export type ReactionScriptAst = {
  statements: ReactionScriptStatement[];
};

export type ReactionScriptStatement = {
  action: ReactionScriptAction;
  conditions: ReactionScriptCondition[];
  line: number;
};

export type ReactionScriptAction =
  | {
      elementRefs: string[];
      kind: 'add';
    }
  | {
      counterName: string;
      kind: 'set';
      operator: '+=' | '-=' | '=';
      value: number;
    }
  | {
      elementRef: string;
      kind: 'remove';
    }
  | {
      elementRef: string;
      kind: 'remove_all';
    }
  | {
      kind: 'message';
      text: string;
    }
  | {
      kind: 'stop';
    };

export type ReactionScriptCondition =
  | {
      elementRef: string;
      kind:
        | 'on_table'
        | 'not_on_table'
        | 'discovered'
        | 'not_discovered';
    }
  | {
      counterName: string;
      kind: 'count_compare';
      operator: '<' | '<=' | '>' | '>=' | '==' | '!=';
      value: number;
    };

export type ReactionScriptIssue = {
  line: number;
  message: string;
};

export type ReactionScriptParseResult =
  | {
      ast: ReactionScriptAst;
      ok: true;
    }
  | {
      errors: ReactionScriptIssue[];
      ok: false;
    };

export type ReactionScriptValidationContext = {
  counterNames: string[];
  elements: Array<{
    id: string;
    name?: string;
  }>;
};

export type ReactionScriptValidationResult = {
  emittedElementIds: string[];
  errors: ReactionScriptIssue[];
  ok: boolean;
  referencedCounterNames: string[];
};

export type ReactionScriptTableElement = {
  elementId: string;
  id: string;
};

export type ReactionScriptExecutionContext = ReactionScriptValidationContext & {
  counters: Record<string, number>;
  discoveredElementIds: string[];
  script: ReactionScriptAst | string;
  tableElements: ReactionScriptTableElement[];
};

export type ReactionScriptExecutionResult =
  | {
      errors: ReactionScriptIssue[];
      ok: false;
    }
  | {
      ok: true;
      result: {
        counterValues: Record<string, number>;
        emittedElementIds: string[];
        messages: string[];
        removedTableElementIds: string[];
        stopped: boolean;
      };
    };

const CONDITION_PREDICATE_KINDS = [
  'on_table',
  'not_on_table',
  'discovered',
  'not_discovered',
] as const;

const LEGACY_CONDITION_PREDICATE_ALIASES = {
  undiscovered: 'not_discovered',
} as const;

const isReactionScriptIssue = (
  value:
    | ReactionScriptAction
    | ReactionScriptCondition
    | ReactionScriptIssue
    | ReactionScriptStatement
): value is ReactionScriptIssue =>
  'line' in value && 'message' in value;

const normalizeLookupKey = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const parseInteger = (value: string) => {
  if (!/^-?\d+$/.test(value)) {
    return null;
  }

  return Number(value);
};

const parseQuotedText = (rawValue: string) => {
  if (!rawValue.startsWith('"') || !rawValue.endsWith('"')) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

const parseElementRefs = (
  rawValue: string,
  line: number,
  keyword: string
): ReactionScriptIssue | string[] => {
  const elementRefs = rawValue.split(',').map((value) => value.trim());
  if (elementRefs.some((value) => value.length === 0)) {
    return {
      line,
      message: `${keyword} has an empty element name.`,
    };
  }

  return elementRefs;
};

const parseWrappedArgument = (rawValue: string, keyword: string) => {
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = rawValue.match(
    new RegExp(`^${escapedKeyword}\\s*\\((.*)\\)$`, 's')
  );

  return match?.[1] ?? null;
};

const isBoundaryCharacter = (value: string | undefined) =>
  value === undefined || /\s|\(|\)/.test(value);

const matchesWordTokenAt = (value: string, index: number, token: string) =>
  value.slice(index, index + token.length) === token &&
  isBoundaryCharacter(value[index - 1]) &&
  isBoundaryCharacter(value[index + token.length]);

const splitConditionList = (rawConditionList: string) => {
  const errors: string[] = [];
  const parts: string[] = [];
  let depth = 0;
  let segmentStart = 0;

  for (let index = 0; index < rawConditionList.length; index += 1) {
    const character = rawConditionList[index];
    if (character === '(') {
      depth += 1;
      continue;
    }

    if (character === ')') {
      depth -= 1;
      continue;
    }

    if (depth !== 0) {
      continue;
    }

    if (matchesWordTokenAt(rawConditionList, index, 'or')) {
      errors.push('Only "and" conditions are supported.');
      break;
    }

    if (!matchesWordTokenAt(rawConditionList, index, 'and')) {
      continue;
    }

    const part = rawConditionList.slice(segmentStart, index).trim();
    if (!part) {
      errors.push('Conditions cannot be empty.');
      break;
    }

    parts.push(part);
    segmentStart = index + 'and'.length;
    index += 'and'.length - 1;
  }

  if (errors.length > 0) {
    return {
      errors,
      parts: [],
    };
  }

  const trailingPart = rawConditionList.slice(segmentStart).trim();
  if (!trailingPart) {
    return {
      errors: ['Conditions cannot be empty.'],
      parts: [],
    };
  }

  return {
    errors: [],
    parts: [...parts, trailingPart],
  };
};

const parseConditionPredicateKind = (value: string) => {
  if (value === 'on_table') {
    return 'on_table';
  }

  if (value === 'not_on_table') {
    return 'not_on_table';
  }

  if (value === 'discovered') {
    return 'discovered';
  }

  if (value === 'not_discovered') {
    return 'not_discovered';
  }

  if (value === 'undiscovered') {
    return LEGACY_CONDITION_PREDICATE_ALIASES.undiscovered;
  }

  return null;
};

const parseCounterComparisonOperator = (value: string) => {
  if (value === '<') {
    return '<';
  }

  if (value === '<=') {
    return '<=';
  }

  if (value === '>') {
    return '>';
  }

  if (value === '>=') {
    return '>=';
  }

  if (value === '==') {
    return '==';
  }

  if (value === '!=') {
    return '!=';
  }

  return null;
};

const parseCounterSetOperator = (value: string) => {
  if (value === '+=') {
    return '+=';
  }

  if (value === '-=') {
    return '-=';
  }

  if (value === '=') {
    return '=';
  }

  return null;
};

const parseCondition = (
  rawCondition: string,
  line: number
): ReactionScriptCondition | ReactionScriptIssue => {
  for (const predicateName of CONDITION_PREDICATE_KINDS) {
    const rawArgument = parseWrappedArgument(rawCondition, predicateName);
    if (rawArgument !== null) {
      const elementRef = rawArgument.trim();
      if (!elementRef) {
        return {
          line,
          message: 'Element predicate is missing an element name.',
        };
      }

      return {
        elementRef,
        kind: predicateName,
      };
    }
  }

  const legacyPredicateMatch = rawCondition.match(
    /^(undiscovered)\s*\((.*)\)$/s
  );
  if (legacyPredicateMatch) {
    const kind = parseConditionPredicateKind(legacyPredicateMatch[1] ?? '');
    const elementRef = legacyPredicateMatch[2]?.trim() ?? '';
    if (!kind || !elementRef) {
      return {
        line,
        message: 'Element predicate is missing an element name.',
      };
    }

    return {
      elementRef,
      kind,
    };
  }

  const countMatch = rawCondition.match(
    /^count\s*\(\s*([A-Za-z][A-Za-z0-9_-]*)\s*\)\s*(<=|>=|==|!=|<|>)\s*(-?\d+)$/
  );
  if (countMatch) {
    const counterName = countMatch[1] ?? '';
    const operator = parseCounterComparisonOperator(countMatch[2] ?? '');
    const value = parseInteger(countMatch[3] ?? '');
    if (!operator || value === null) {
      return {
        line,
        message: 'Counter comparison is invalid.',
      };
    }

    return {
      counterName,
      kind: 'count_compare',
      operator,
      value,
    };
  }

  return {
    line,
    message: `Unsupported condition: ${rawCondition}`,
  };
};

const parseSetAction = (
  rawAction: string,
  line: number
): ReactionScriptAction | ReactionScriptIssue | null => {
  const rawArgument = parseWrappedArgument(rawAction, 'set');
  if (rawArgument === null) {
    return null;
  }

  const match = rawArgument.trim().match(
    /^([A-Za-z][A-Za-z0-9_-]*)\s*(\+=|-=|=)\s*(-?\d+)$/
  );
  if (!match) {
    return {
      line,
      message: 'set(...) must contain counterName = number, += number, or -= number.',
    };
  }

  const counterName = match[1] ?? '';
  const operator = parseCounterSetOperator(match[2] ?? '');
  const value = parseInteger(match[3] ?? '');
  if (!operator || value === null) {
    return {
      line,
      message: 'set(...) is invalid.',
    };
  }

  return {
    counterName,
    kind: 'set',
    operator,
    value,
  };
};

const parseMessageAction = (
  rawAction: string,
  line: number
): ReactionScriptAction | ReactionScriptIssue | null => {
  const wrappedArgument = parseWrappedArgument(rawAction, 'message');
  if (wrappedArgument !== null) {
    const text = parseQuotedText(wrappedArgument.trim());
    if (text === null) {
      return {
        line,
        message: 'message(...) must wrap a double-quoted string.',
      };
    }

    return {
      kind: 'message',
      text,
    };
  }

  if (!/^message\b/.test(rawAction)) {
    return null;
  }

  const legacyText = parseQuotedText(rawAction.slice('message'.length).trim());
  if (legacyText === null) {
    return {
      line,
      message: 'message(...) must wrap a double-quoted string.',
    };
  }

  return {
    kind: 'message',
    text: legacyText,
  };
};

const parseElementAction = (
  rawAction: string,
  line: number,
  keyword: 'add' | 'emit' | 'remove' | 'remove_all'
): ReactionScriptAction | ReactionScriptIssue | null => {
  const match = rawAction.match(new RegExp(`^${keyword}\\s+(.+)$`, 's'));
  if (match) {
    const rawValue = match[1]?.trim() ?? '';
    if (!rawValue) {
      return {
        line,
        message: `${keyword} is missing an element name.`,
      };
    }

    if (keyword === 'add' || keyword === 'emit') {
      const elementRefs = parseElementRefs(rawValue, line, keyword);
      if (!Array.isArray(elementRefs)) {
        return elementRefs;
      }

      return {
        elementRefs,
        kind: 'add',
      };
    }

    return {
      elementRef: rawValue,
      kind: keyword,
    };
  }

  if (rawAction === keyword) {
    return {
      line,
      message: `${keyword} is missing an element name.`,
    };
  }

  return null;
};

const parseAction = (
  rawAction: string,
  line: number
): ReactionScriptAction | ReactionScriptIssue => {
  if (rawAction === 'stop') {
    return {
      kind: 'stop',
    };
  }

  const messageAction = parseMessageAction(rawAction, line);
  if (messageAction !== null) {
    return messageAction;
  }

  const setAction = parseSetAction(rawAction, line);
  if (setAction !== null) {
    return setAction;
  }

  const removeAllAction = parseElementAction(rawAction, line, 'remove_all');
  if (removeAllAction !== null) {
    return removeAllAction;
  }

  const removeAction = parseElementAction(rawAction, line, 'remove');
  if (removeAction !== null) {
    return removeAction;
  }

  const addAction = parseElementAction(rawAction, line, 'add');
  if (addAction !== null) {
    return addAction;
  }

  const legacyEmitAction = parseElementAction(rawAction, line, 'emit');
  if (legacyEmitAction !== null) {
    return legacyEmitAction;
  }

  if (
    /^([A-Za-z][A-Za-z0-9_-]*)\s*(\+=|-=|=)\s*(-?\d+)$/.test(rawAction.trim())
  ) {
    return {
      line,
      message: 'Use set(counterName = number), set(counterName += number), or set(counterName -= number).',
    };
  }

  if (!rawAction.trim()) {
    return {
      line,
      message: 'Missing action.',
    };
  }

  return {
    elementRefs: [rawAction.trim()],
    kind: 'add',
  };
};

const parseStatementLine = (
  rawLine: string,
  line: number
): ReactionScriptStatement | ReactionScriptIssue => {
  const trimmedLine = rawLine.trim();
  if (!/^if(?=\s|\()/.test(trimmedLine)) {
    const action = parseAction(trimmedLine, line);
    if (isReactionScriptIssue(action)) {
      return action;
    }

    return {
      action,
      conditions: [],
      line,
    };
  }

  let cursor = 'if'.length;
  while (trimmedLine[cursor] === ' ') {
    cursor += 1;
  }

  if (trimmedLine[cursor] !== '(') {
    const action = parseAction(trimmedLine, line);
    if (isReactionScriptIssue(action)) {
      return action;
    }

    return {
      action,
      conditions: [],
      line,
    };
  }

  let depth = 0;
  let closingIndex = -1;
  for (let index = cursor; index < trimmedLine.length; index += 1) {
    const character = trimmedLine[index];
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        closingIndex = index;
        break;
      }
    }
  }

  if (closingIndex === -1) {
    return {
      line,
      message: 'If conditions must end with a closing parenthesis.',
    };
  }

  const rawConditionList = trimmedLine.slice(cursor + 1, closingIndex).trim();
  const rawAction = trimmedLine.slice(closingIndex + 1).trim();

  if (!rawConditionList) {
    return {
      line,
      message: 'If conditions cannot be empty.',
    };
  }

  if (!rawAction) {
    return {
      line,
      message: 'If statements must include exactly one action.',
    };
  }

  const conditionList = splitConditionList(rawConditionList);
  if (conditionList.errors.length > 0) {
    return {
      line,
      message: conditionList.errors[0] ?? 'Invalid condition list.',
    };
  }

  const conditions: ReactionScriptCondition[] = [];
  for (const part of conditionList.parts) {
    const condition = parseCondition(part, line);
    if (isReactionScriptIssue(condition)) {
      return condition;
    }

    conditions.push(condition);
  }

  const action = parseAction(rawAction, line);
  if (isReactionScriptIssue(action)) {
    return action;
  }

  return {
    action,
    conditions,
    line,
  };
};

const createElementResolver = (context: ReactionScriptValidationContext) => {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();

  for (const element of context.elements) {
    byId.set(normalizeLookupKey(element.id), element.id);
    if (element.name) {
      byName.set(normalizeLookupKey(element.name), element.id);
    }
  }

  return (elementRef: string) => {
    const normalized = normalizeLookupKey(elementRef);
    return byId.get(normalized) ?? byName.get(normalized) ?? null;
  };
};

const createCounterSet = (counterNames: string[]) =>
  new Set(counterNames.map((counterName) => normalizeLookupKey(counterName)));

const validateElementRef = (
  elementRef: string,
  line: number,
  resolveElementId: (elementRef: string) => string | null
) => {
  const elementId = resolveElementId(elementRef);
  if (!elementId) {
    return {
      elementId: null,
      error: {
        line,
        message: `Unknown element "${elementRef}".`,
      },
    };
  }

  return {
    elementId,
    error: null,
  };
};

const validateCounterName = (
  counterName: string,
  line: number,
  counters: Set<string>
) => {
  if (counters.has(normalizeLookupKey(counterName))) {
    return null;
  }

  return {
    line,
    message: `Unknown counter "${counterName}".`,
  };
};

const evaluateCondition = (
  condition: ReactionScriptCondition,
  resolveElementId: (elementRef: string) => string | null,
  discoveredElementIds: Set<string>,
  tableElements: ReactionScriptTableElement[],
  counterValues: Record<string, number>
) => {
  if (condition.kind === 'count_compare') {
    const counterValue = counterValues[condition.counterName] ?? 0;
    switch (condition.operator) {
      case '<':
        return counterValue < condition.value;
      case '<=':
        return counterValue <= condition.value;
      case '>':
        return counterValue > condition.value;
      case '>=':
        return counterValue >= condition.value;
      case '==':
        return counterValue === condition.value;
      case '!=':
        return counterValue !== condition.value;
    }
  }

  const elementId = resolveElementId(condition.elementRef);
  if (!elementId) {
    return false;
  }

  if (condition.kind === 'discovered') {
    return discoveredElementIds.has(elementId);
  }

  if (condition.kind === 'not_discovered') {
    return !discoveredElementIds.has(elementId);
  }

  const isOnTable = tableElements.some(
    (tableElement) => tableElement.elementId === elementId
  );
  return condition.kind === 'on_table' ? isOnTable : !isOnTable;
};

const parseScriptAst = (
  script: ReactionScriptAst | string
): ReactionScriptParseResult => {
  if (typeof script === 'string') {
    return parseReactionScript(script);
  }

  return {
    ast: script,
    ok: true,
  };
};

const formatQuotedText = (value: string) => JSON.stringify(value);

const formatCondition = (condition: ReactionScriptCondition) => {
  if (condition.kind === 'count_compare') {
    return `count(${condition.counterName}) ${condition.operator} ${condition.value}`;
  }

  return `${condition.kind}(${condition.elementRef})`;
};

const formatAction = (action: ReactionScriptAction) => {
  switch (action.kind) {
    case 'add':
      return `add ${action.elementRefs.join(', ')}`;
    case 'set':
      return `set(${action.counterName} ${action.operator} ${action.value})`;
    case 'remove':
      return `remove ${action.elementRef}`;
    case 'remove_all':
      return `remove_all ${action.elementRef}`;
    case 'message':
      return `message(${formatQuotedText(action.text)})`;
    case 'stop':
      return 'stop';
  }
};

export const hasReactionScript = (script: string | undefined) =>
  (script ?? '').trim().length > 0;

const formatReactionScriptIssueMessage = (message: string) =>
  message === 'If conditions cannot be empty.'
    ? 'If() conditions cannot be empty.'
    : message;

export const formatReactionScriptIssue = (issue: ReactionScriptIssue) =>
  `Line ${issue.line}: ${formatReactionScriptIssueMessage(issue.message)}`;

export const parseReactionScript = (
  scriptText: string
): ReactionScriptParseResult => {
  const statements: ReactionScriptStatement[] = [];
  const errors: ReactionScriptIssue[] = [];
  const lines = scriptText.replace(/\r\n/g, '\n').split('\n');

  lines.forEach((lineText, index) => {
    const trimmedLine = lineText.trim();
    if (!trimmedLine) {
      return;
    }

    const parsed = parseStatementLine(trimmedLine, index + 1);
    if (isReactionScriptIssue(parsed)) {
      errors.push(parsed);
      return;
    }

    statements.push(parsed);
  });

  if (errors.length > 0) {
    return {
      errors,
      ok: false,
    };
  }

  return {
    ast: {
      statements,
    },
    ok: true,
  };
};

export const formatReactionScriptAst = (ast: ReactionScriptAst) =>
  ast.statements
    .map((statement) => {
      const actionText = formatAction(statement.action);
      if (statement.conditions.length === 0) {
        return actionText;
      }

      return `if (${statement.conditions.map(formatCondition).join(' and ')}) ${actionText}`;
    })
    .join('\n');

export const formatReactionScript = (script: ReactionScriptAst | string) => {
  const parsed = parseScriptAst(script);
  if (!parsed.ok) {
    return null;
  }

  return formatReactionScriptAst(parsed.ast);
};

export const validateReactionScript = (
  script: ReactionScriptAst | string,
  context: ReactionScriptValidationContext
): ReactionScriptValidationResult => {
  const parsed = parseScriptAst(script);
  if (!parsed.ok) {
    return {
      emittedElementIds: [],
      errors: parsed.errors,
      ok: false,
      referencedCounterNames: [],
    };
  }

  const resolveElementId = createElementResolver(context);
  const counterSet = createCounterSet(context.counterNames);
  const emittedElementIds = new Set<string>();
  const referencedCounterNames = new Set<string>();
  const errors: ReactionScriptIssue[] = [];

  for (const statement of parsed.ast.statements) {
    for (const condition of statement.conditions) {
      if (condition.kind === 'count_compare') {
        referencedCounterNames.add(condition.counterName);
        const error = validateCounterName(
          condition.counterName,
          statement.line,
          counterSet
        );
        if (error) {
          errors.push(error);
        }
        continue;
      }

      const result = validateElementRef(
        condition.elementRef,
        statement.line,
        resolveElementId
      );
      if (result.error) {
        errors.push(result.error);
      }
    }

    if (statement.action.kind === 'set') {
      referencedCounterNames.add(statement.action.counterName);
      const error = validateCounterName(
        statement.action.counterName,
        statement.line,
        counterSet
      );
      if (error) {
        errors.push(error);
      }
      continue;
    }

    if (
      statement.action.kind === 'add' ||
      statement.action.kind === 'remove' ||
      statement.action.kind === 'remove_all'
    ) {
      if (statement.action.kind === 'add') {
        statement.action.elementRefs.forEach((elementRef) => {
          const result = validateElementRef(
            elementRef,
            statement.line,
            resolveElementId
          );
          if (result.error) {
            errors.push(result.error);
            return;
          }

          if (result.elementId !== null) {
            emittedElementIds.add(result.elementId);
          }
        });
        continue;
      }

      const result = validateElementRef(
        statement.action.elementRef,
        statement.line,
        resolveElementId
      );
      if (result.error) {
        errors.push(result.error);
      }
    }
  }

  return {
    emittedElementIds: Array.from(emittedElementIds),
    errors,
    ok: errors.length === 0,
    referencedCounterNames: Array.from(referencedCounterNames),
  };
};

export const executeReactionScript = (
  context: ReactionScriptExecutionContext
): ReactionScriptExecutionResult => {
  const parsed = parseScriptAst(context.script);
  if (!parsed.ok) {
    return {
      errors: parsed.errors,
      ok: false,
    };
  }

  const validation = validateReactionScript(parsed.ast, context);
  if (!validation.ok) {
    return {
      errors: validation.errors,
      ok: false,
    };
  }

  const resolveElementId = createElementResolver(context);
  const discoveredElementIds = new Set(context.discoveredElementIds);
  const tableElements = [...context.tableElements];
  const counterValues = { ...context.counters };
  const emittedElementIds: string[] = [];
  const removedTableElementIds: string[] = [];
  const messages: string[] = [];
  let stopped = false;

  for (const statement of parsed.ast.statements) {
    const conditionsPassed = statement.conditions.every((condition) =>
      evaluateCondition(
        condition,
        resolveElementId,
        discoveredElementIds,
        tableElements,
        counterValues
      )
    );
    if (!conditionsPassed) {
      continue;
    }

    if (statement.action.kind === 'add') {
      statement.action.elementRefs.forEach((elementRef) => {
        const elementId = resolveElementId(elementRef);
        if (elementId) {
          emittedElementIds.push(elementId);
        }
      });
      continue;
    }

    if (statement.action.kind === 'set') {
      const currentValue = counterValues[statement.action.counterName] ?? 0;
      if (statement.action.operator === '=') {
        counterValues[statement.action.counterName] = statement.action.value;
      } else if (statement.action.operator === '+=') {
        counterValues[statement.action.counterName] =
          currentValue + statement.action.value;
      } else {
        counterValues[statement.action.counterName] =
          currentValue - statement.action.value;
      }
      continue;
    }

    if (statement.action.kind === 'remove') {
      const elementId = resolveElementId(statement.action.elementRef);
      if (!elementId) {
        continue;
      }

      const match = tableElements.find(
        (tableElement) => tableElement.elementId === elementId
      );
      if (!match) {
        continue;
      }

      removedTableElementIds.push(match.id);
      const nextTableElements = tableElements.filter(
        (tableElement) => tableElement.id !== match.id
      );
      tableElements.splice(0, tableElements.length, ...nextTableElements);
      continue;
    }

    if (statement.action.kind === 'remove_all') {
      const elementId = resolveElementId(statement.action.elementRef);
      if (!elementId) {
        continue;
      }

      const removedMatches = tableElements.filter(
        (tableElement) => tableElement.elementId === elementId
      );
      removedMatches.forEach((tableElement) => {
        removedTableElementIds.push(tableElement.id);
      });

      const nextTableElements = tableElements.filter(
        (tableElement) => tableElement.elementId !== elementId
      );
      tableElements.splice(0, tableElements.length, ...nextTableElements);
      continue;
    }

    if (statement.action.kind === 'message') {
      messages.push(statement.action.text);
      continue;
    }

    stopped = true;
    break;
  }

  return {
    ok: true,
    result: {
      counterValues,
      emittedElementIds,
      messages,
      removedTableElementIds,
      stopped,
    },
  };
};
