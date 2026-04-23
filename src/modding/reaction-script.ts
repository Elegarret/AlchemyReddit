import type { ActiveCounterDefinition, ModEvent } from './types';

export type ReactionScriptAst = {
  sourceLines?: ReactionScriptSourceLine[];
  statements: ReactionScriptStatement[];
};

export type ReactionScriptSourceLine =
  | {
      commentText: string;
      kind: 'comment';
      line: number;
    }
  | {
      commentText?: string;
      kind: 'statement';
      line: number;
      statement: ReactionScriptStatement;
    };

export type ReactionScriptStatement = {
  action: ReactionScriptAction;
  conditions: ReactionScriptCondition[];
  line: number;
};

export type ReactionScriptPopupKind = 'popup' | 'win' | 'lose';

export type ReactionScriptPopupEvent = {
  iconElementId: string | null;
  kind: ReactionScriptPopupKind;
  text: string;
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
      elementRef?: string;
      kind: 'remove_all';
    }
  | {
      kind: 'message';
      text: string;
    }
  | {
      iconElementRef?: string;
      kind: ReactionScriptPopupKind;
      text: string;
    }
  | {
      kind: 'stop';
    }
  | {
      kind: 'stop_reaction';
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
  nonGameplayElementIds?: string[];
  scriptKind?: 'event' | 'reaction';
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

export type ReactionScriptEventState = {
  activeEventIds: string[];
  firedEventIds: string[];
};

export type ReactionScriptExecutionContext = ReactionScriptValidationContext & {
  counters: Record<string, number>;
  counterDefinitions?: Array<
    Pick<ActiveCounterDefinition, 'max' | 'min' | 'name'>
  >;
  discoveredElementIds: string[];
  events?: ModEvent[];
  eventState?: ReactionScriptEventState;
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
        hiddenCounterNames: string[];
        messages: string[];
        popupEvents: ReactionScriptPopupEvent[];
        removedTableElementIds: string[];
        eventState?: ReactionScriptEventState;
        shownCounterNames: string[];
        stopReaction?: boolean;
        stopped: boolean;
      };
    };

export const createEmptyReactionScriptEventState =
  (): ReactionScriptEventState => ({
    activeEventIds: [],
    firedEventIds: [],
  });

const MAX_EVENT_EXECUTIONS_PER_REACTION = 32;

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

const clampToOptionalBounds = (
  value: number,
  min?: number,
  max?: number
) => {
  let nextValue = value;

  if (min !== undefined) {
    nextValue = Math.max(nextValue, min);
  }

  if (max !== undefined) {
    nextValue = Math.min(nextValue, max);
  }

  return nextValue;
};

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

export const findReactionScriptCommentStart = (value: string) => {
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < value.length - 1; index += 1) {
    const character = value[index];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === '\\') {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '/' && value[index + 1] === '/') {
      return index;
    }
  }

  return -1;
};

export const splitReactionScriptLineComment = (value: string) => {
  const commentStart = findReactionScriptCommentStart(value);
  if (commentStart === -1) {
    return {
      code: value,
      commentText: null,
    };
  }

  return {
    code: value.slice(0, commentStart),
    commentText: value.slice(commentStart + 2),
  };
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
    /^count\s*\(\s*([^)]+?)\s*\)\s*(<=|>=|==|!=|<|>)\s*(-?\d+)$/
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

export const parseReactionScriptConditionList = (
  rawConditionList: string,
  line: number
):
  | {
      conditions: ReactionScriptCondition[];
      ok: true;
    }
  | {
      errors: ReactionScriptIssue[];
      ok: false;
    } => {
  const conditionList = splitConditionList(rawConditionList.trim());
  if (conditionList.errors.length > 0) {
    return {
      errors: [
        {
          line,
          message: conditionList.errors[0] ?? 'Invalid condition list.',
        },
      ],
      ok: false,
    };
  }

  const conditions: ReactionScriptCondition[] = [];
  const errors: ReactionScriptIssue[] = [];
  for (const part of conditionList.parts) {
    const condition = parseCondition(part, line);
    if (isReactionScriptIssue(condition)) {
      errors.push(condition);
      continue;
    }

    conditions.push(condition);
  }

  if (errors.length > 0) {
    return {
      errors,
      ok: false,
    };
  }

  return {
    conditions,
    ok: true,
  };
};

const parseSetAction = (
  rawAction: string,
  line: number
): ReactionScriptAction | ReactionScriptIssue | null => {
  const wrappedArgument = parseWrappedArgument(rawAction, 'set');
  const bareArgumentMatch = rawAction.match(/^set(?:\s+(.+))?$/s);
  if (wrappedArgument === null && !bareArgumentMatch) {
    return null;
  }

  const rawArgument = (wrappedArgument ?? bareArgumentMatch?.[1] ?? '').trim();

  const match = rawArgument.match(
    /^([A-Za-z][A-Za-z0-9_-]*)\s*(\+=|-=|=)\s*(-?\d+)$/
  );
  if (!match) {
    return {
      line,
      message: 'set must contain counterName = number, += number, or -= number.',
    };
  }

  const counterName = match[1] ?? '';
  const operator = parseCounterSetOperator(match[2] ?? '');
  const value = parseInteger(match[3] ?? '');
  if (!operator || value === null) {
    return {
      line,
      message: 'set is invalid.',
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
        message: 'message must wrap a double-quoted string.',
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
      message: 'message must wrap a double-quoted string.',
    };
  }

  return {
    kind: 'message',
    text: legacyText,
  };
};

const parsePopupStyleAction = (
  rawAction: string,
  line: number,
  kind: ReactionScriptPopupKind
): ReactionScriptAction | ReactionScriptIssue | null => {
  const wrappedArgument = parseWrappedArgument(rawAction, kind);
  const bareArgumentMatch = rawAction.match(
    new RegExp(`^${kind}(?:\\s+(.+))?$`, 's')
  );
  if (wrappedArgument === null && !bareArgumentMatch) {
    return null;
  }

  const trimmedArgument = (wrappedArgument ?? bareArgumentMatch?.[1] ?? '').trim();
  if (!trimmedArgument) {
    return {
      line,
      message: `${kind} must contain a double-quoted string and an optional element name.`,
    };
  }

  const textMatch = trimmedArgument.match(/^("(?:\\.|[^"\\])*")(?:\s*,\s*(.+))?$/s);
  if (!textMatch) {
    return {
      line,
      message: `${kind} must contain a double-quoted string and an optional element name.`,
    };
  }

  const text = parseQuotedText(textMatch[1] ?? '');
  if (text === null) {
    return {
      line,
      message: `${kind} must contain a double-quoted string and an optional element name.`,
    };
  }

  const rawIconElementRef = textMatch[2]?.trim() ?? '';
  if (rawIconElementRef.includes(',')) {
    return {
      line,
      message: `${kind} accepts at most one optional element name.`,
    };
  }

  return {
    ...(rawIconElementRef ? { iconElementRef: rawIconElementRef } : {}),
    kind,
    text,
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
    if (keyword === 'remove_all') {
      return {
        kind: 'remove_all',
      };
    }

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

  if (rawAction === 'stop-reaction') {
    return {
      kind: 'stop_reaction',
    };
  }

  const messageAction = parseMessageAction(rawAction, line);
  if (messageAction !== null) {
    return messageAction;
  }

  const popupAction = parsePopupStyleAction(rawAction, line, 'popup');
  if (popupAction !== null) {
    return popupAction;
  }

  const winAction = parsePopupStyleAction(rawAction, line, 'win');
  if (winAction !== null) {
    return winAction;
  }

  const loseAction = parsePopupStyleAction(rawAction, line, 'lose');
  if (loseAction !== null) {
    return loseAction;
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
      message: 'Use set counterName = number, set counterName += number, or set counterName -= number.',
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

  const conditionList = parseReactionScriptConditionList(rawConditionList, line);
  if (!conditionList.ok) {
    return conditionList.errors[0] ?? {
      line,
      message: 'Invalid condition list.',
    };
  }

  const action = parseAction(rawAction, line);
  if (isReactionScriptIssue(action)) {
    return action;
  }

  return {
    action,
    conditions: conditionList.conditions,
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

const createCounterResolver = (counterNames: string[]) => {
  const byName = new Map(
    counterNames.map((counterName) => [
      normalizeLookupKey(counterName),
      counterName,
    ])
  );

  return (counterName: string) =>
    byName.get(normalizeLookupKey(counterName)) ?? null;
};

const createElementNameResolver = (context: ReactionScriptValidationContext) => {
  const byId = new Map<string, string>();

  for (const element of context.elements) {
    if (element.name) {
      byId.set(normalizeLookupKey(element.id), element.name);
    }
  }

  return (elementId: string) => byId.get(normalizeLookupKey(elementId)) ?? null;
};

const createNonGameplayElementSet = (nonGameplayElementIds: string[] = []) =>
  new Set(nonGameplayElementIds.map((elementId) => normalizeLookupKey(elementId)));

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
  resolveCounterName: (counterName: string) => string | null
) => {
  const canonicalName = resolveCounterName(counterName);
  return canonicalName
    ? {
        canonicalName,
        error: null,
      }
    : {
        canonicalName: null,
        error: {
          line,
          message: `Unknown counter "${counterName}".`,
        },
      };
};

const validateGameplayElementRef = (
  elementRef: string,
  line: number,
  resolveElementId: (elementRef: string) => string | null,
  nonGameplayElements: Set<string>
) => {
  const result = validateElementRef(elementRef, line, resolveElementId);
  if (result.error || result.elementId === null) {
    return result;
  }

  if (nonGameplayElements.has(normalizeLookupKey(result.elementId))) {
    return {
      elementId: result.elementId,
      error: {
        line,
        message: `Counter "${elementRef}" cannot act as a normal element here. Use count(...) or set counterName += 1 instead.`,
      },
    };
  }

  return result;
};

const getCounterNameForElementId = (params: {
  elementId: string;
  resolveCounterName: (counterName: string) => string | null;
  resolveElementName: (elementId: string) => string | null;
}) => {
  const elementName = params.resolveElementName(params.elementId);
  return elementName ? params.resolveCounterName(elementName) ?? elementName : null;
};

const evaluateCondition = (
  condition: ReactionScriptCondition,
  resolveElementId: (elementRef: string) => string | null,
  resolveCounterName: (counterName: string) => string | null,
  discoveredElementIds: Set<string>,
  tableElements: ReactionScriptTableElement[],
  counterValues: Record<string, number>
) => {
  if (condition.kind === 'count_compare') {
    const resolvedCounterName = resolveCounterName(condition.counterName);
    const elementId = resolvedCounterName
      ? null
      : resolveElementId(condition.counterName);
    const countValue = resolvedCounterName
      ? (counterValues[resolvedCounterName] ?? 0)
      : elementId
        ? tableElements.filter(
            (tableElement) => tableElement.elementId === elementId
          ).length
        : 0;
    switch (condition.operator) {
      case '<':
        return countValue < condition.value;
      case '<=':
        return countValue <= condition.value;
      case '>':
        return countValue > condition.value;
      case '>=':
        return countValue >= condition.value;
      case '==':
        return countValue === condition.value;
      case '!=':
        return countValue !== condition.value;
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
      return `set ${action.counterName} ${action.operator} ${action.value}`;
    case 'remove':
      return `remove ${action.elementRef}`;
    case 'remove_all':
      return action.elementRef ? `remove_all ${action.elementRef}` : 'remove_all';
    case 'message':
      return `message ${formatQuotedText(action.text)}`;
    case 'popup':
    case 'win':
    case 'lose':
      return `${action.kind} ${formatQuotedText(action.text)}${
        action.iconElementRef ? `, ${action.iconElementRef}` : ''
      }`;
    case 'stop':
      return 'stop';
    case 'stop_reaction':
      return 'stop-reaction';
  }
};

const formatStatement = (statement: ReactionScriptStatement) => {
  const actionText = formatAction(statement.action);
  if (statement.conditions.length === 0) {
    return actionText;
  }

  return `if (${statement.conditions.map(formatCondition).join(' and ')}) ${actionText}`;
};

export const hasReactionScript = (script: string | undefined) =>
  (script ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .some((line) => splitReactionScriptLineComment(line).code.trim().length > 0);

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
  const sourceLines: ReactionScriptSourceLine[] = [];
  const errors: ReactionScriptIssue[] = [];
  const lines = scriptText.replace(/\r\n/g, '\n').split('\n');

  lines.forEach((lineText, index) => {
    const { code, commentText } = splitReactionScriptLineComment(lineText);
    const trimmedLine = code.trim();
    if (!trimmedLine) {
      if (commentText !== null) {
        sourceLines.push({
          commentText,
          kind: 'comment',
          line: index + 1,
        });
      }
      return;
    }

    const parsed = parseStatementLine(trimmedLine, index + 1);
    if (isReactionScriptIssue(parsed)) {
      errors.push(parsed);
      return;
    }

    statements.push(parsed);
    sourceLines.push({
      ...(commentText !== null ? { commentText } : {}),
      kind: 'statement',
      line: index + 1,
      statement: parsed,
    });
  });

  if (errors.length > 0) {
    return {
      errors,
      ok: false,
    };
  }

  return {
    ast: {
      sourceLines,
      statements,
    },
    ok: true,
  };
};

export const formatReactionScriptAst = (ast: ReactionScriptAst) => {
  if (ast.sourceLines) {
    return ast.sourceLines
      .map((sourceLine) => {
        if (sourceLine.kind === 'comment') {
          return `//${sourceLine.commentText}`;
        }

        const formattedStatement = formatStatement(sourceLine.statement);
        return sourceLine.commentText !== undefined
          ? `${formattedStatement} //${sourceLine.commentText}`
          : formattedStatement;
      })
      .join('\n');
  }

  return ast.statements.map(formatStatement).join('\n');
};

export const formatReactionScript = (script: ReactionScriptAst | string) => {
  const parsed = parseScriptAst(script);
  if (!parsed.ok) {
    return null;
  }

  return formatReactionScriptAst(parsed.ast);
};

export const formatReactionScriptConditionList = (
  rawConditionList: string,
  line = 1
) => {
  const parsed = parseReactionScriptConditionList(rawConditionList, line);
  if (!parsed.ok) {
    return null;
  }

  return parsed.conditions.map(formatCondition).join(' and ');
};

export const validateReactionScriptConditions = (
  conditions: ReactionScriptCondition[],
  context: ReactionScriptValidationContext,
  options: {
    counterOnly?: boolean;
  } = {}
) => {
  const resolveElementId = createElementResolver(context);
  const resolveCounterName = createCounterResolver(context.counterNames);
  const nonGameplayElements = createNonGameplayElementSet(
    context.nonGameplayElementIds
  );
  const referencedCounterNames = new Set<string>();
  const errors: ReactionScriptIssue[] = [];

  for (const condition of conditions) {
    if (condition.kind === 'count_compare') {
      const result = validateCounterName(
        condition.counterName,
        1,
        resolveCounterName
      );
      if (!result.error) {
        referencedCounterNames.add(result.canonicalName);
        continue;
      }

      if (options.counterOnly) {
        errors.push(result.error);
        continue;
      }

      const elementResult = validateGameplayElementRef(
        condition.counterName,
        1,
        resolveElementId,
        nonGameplayElements
      );
      if (elementResult.error) {
        errors.push(result.error);
      }
      continue;
    }

    if (options.counterOnly) {
      errors.push({
        line: 1,
        message:
          'Event conditions only support count(counter) comparisons.',
      });
      continue;
    }

    const result = validateGameplayElementRef(
      condition.elementRef,
      1,
      resolveElementId,
      nonGameplayElements
    );
    if (result.error) {
      errors.push(result.error);
    }
  }

  return {
    errors,
    ok: errors.length === 0,
    referencedCounterNames: Array.from(referencedCounterNames),
  };
};

const normalizeReactionScriptEventState = (
  eventState: ReactionScriptEventState | undefined
) => ({
  activeEventIds: new Set(eventState?.activeEventIds ?? []),
  firedEventIds: new Set(eventState?.firedEventIds ?? []),
});

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
  const resolveCounterName = createCounterResolver(context.counterNames);
  const resolveElementName = createElementNameResolver(context);
  const nonGameplayElements = createNonGameplayElementSet(
    context.nonGameplayElementIds
  );
  const emittedElementIds = new Set<string>();
  const referencedCounterNames = new Set<string>();
  const errors: ReactionScriptIssue[] = [];

  for (const statement of parsed.ast.statements) {
    if (
      statement.action.kind === 'stop_reaction' &&
      context.scriptKind !== 'event'
    ) {
      errors.push({
        line: statement.line,
        message: 'stop-reaction can only be used inside event scripts.',
      });
    }

    for (const condition of statement.conditions) {
      if (condition.kind === 'count_compare') {
        const result = validateCounterName(
          condition.counterName,
          statement.line,
          resolveCounterName
        );
        if (!result.error) {
          referencedCounterNames.add(result.canonicalName);
          continue;
        }

        const elementResult = validateGameplayElementRef(
          condition.counterName,
          statement.line,
          resolveElementId,
          nonGameplayElements
        );
        if (elementResult.error) {
          errors.push(result.error);
        }
        continue;
      }

      const result = validateGameplayElementRef(
        condition.elementRef,
        statement.line,
        resolveElementId,
        nonGameplayElements
      );
      if (result.error) {
        errors.push(result.error);
      }
    }

    if (statement.action.kind === 'set') {
      const result = validateCounterName(
        statement.action.counterName,
        statement.line,
        resolveCounterName
      );
      referencedCounterNames.add(result.canonicalName ?? statement.action.counterName);
      if (result.error) {
        errors.push(result.error);
      }
      continue;
    }

    if (
      statement.action.kind === 'popup' ||
      statement.action.kind === 'win' ||
      statement.action.kind === 'lose'
    ) {
      if (!statement.action.iconElementRef) {
        continue;
      }

      const result = validateElementRef(
        statement.action.iconElementRef,
        statement.line,
        resolveElementId
      );
      if (result.error) {
        errors.push(result.error);
      }
      continue;
    }

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
          if (nonGameplayElements.has(normalizeLookupKey(result.elementId))) {
            const counterName = getCounterNameForElementId({
              elementId: result.elementId,
              resolveCounterName,
              resolveElementName,
            });
            if (counterName) {
              referencedCounterNames.add(counterName);
            }
            return;
          }

          emittedElementIds.add(result.elementId);
        }
      });
      continue;
    }

    if (statement.action.kind === 'remove') {
      const result = validateElementRef(
        statement.action.elementRef,
        statement.line,
        resolveElementId
      );
      if (result.error) {
        errors.push(result.error);
        continue;
      }

      if (
        result.elementId !== null &&
        nonGameplayElements.has(normalizeLookupKey(result.elementId))
      ) {
        const counterName = getCounterNameForElementId({
          elementId: result.elementId,
          resolveCounterName,
          resolveElementName,
        });
        if (counterName) {
          referencedCounterNames.add(counterName);
        }
      }
      continue;
    }

    if (statement.action.kind === 'remove_all') {
      if (!statement.action.elementRef) {
        continue;
      }

      const result = validateElementRef(
        statement.action.elementRef,
        statement.line,
        resolveElementId
      );
      if (result.error) {
        errors.push(result.error);
        continue;
      }

      if (
        result.elementId !== null &&
        nonGameplayElements.has(normalizeLookupKey(result.elementId))
      ) {
        errors.push({
          line: statement.line,
          message: `Counter "${statement.action.elementRef}" cannot be targeted by remove_all. Use remove counterName instead.`,
        });
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

  const validation = validateReactionScript(parsed.ast, {
    ...context,
    scriptKind: context.scriptKind ?? 'reaction',
  });
  if (!validation.ok) {
    return {
      errors: validation.errors,
      ok: false,
    };
  }

  const resolveElementId = createElementResolver(context);
  const resolveCounterName = createCounterResolver(context.counterNames);
  const resolveElementName = createElementNameResolver(context);
  const nonGameplayElements = createNonGameplayElementSet(
    context.nonGameplayElementIds
  );
  const discoveredElementIds = new Set(context.discoveredElementIds);
  const tableElements = [...context.tableElements];
  const counterValues = { ...context.counters };
  const counterBounds = new Map(
    (context.counterDefinitions ?? []).map((counter) => [
      normalizeLookupKey(counter.name),
      counter,
    ])
  );
  const emittedElementIds: string[] = [];
  const hiddenCounterNames = new Set<string>();
  const removedTableElementIds: string[] = [];
  const messages: string[] = [];
  const popupEvents: ReactionScriptPopupEvent[] = [];
  const shownCounterNames = new Set<string>();
  const eventState = normalizeReactionScriptEventState(context.eventState);
  let eventExecutionCount = 0;
  let stopReaction = false;
  let stopped = false;

  const evaluateConditions = (
    conditions: ReactionScriptCondition[],
    values: Record<string, number>
  ) =>
    conditions.every((condition) =>
      evaluateCondition(
        condition,
        resolveElementId,
        resolveCounterName,
        discoveredElementIds,
        tableElements,
        values
      )
    );

  const getEventConditions = (event: ModEvent):
    | {
        conditions: ReactionScriptCondition[];
        ok: true;
      }
    | {
        error: ReactionScriptIssue;
        ok: false;
      } => {
    const parsedConditions = parseReactionScriptConditionList(event.condition, 1);
    if (!parsedConditions.ok) {
      return {
        error: parsedConditions.errors[0] ?? {
          line: 1,
          message: 'Invalid event condition.',
        },
        ok: false,
      };
    }

    const conditionValidation = validateReactionScriptConditions(
      parsedConditions.conditions,
      {
        ...context,
        scriptKind: 'event',
      },
      {
        counterOnly: true,
      }
    );
    if (!conditionValidation.ok) {
      return {
        error: conditionValidation.errors[0] ?? {
          line: 1,
          message: 'Invalid event condition.',
        },
        ok: false,
      };
    }

    return {
      conditions: parsedConditions.conditions,
      ok: true,
    };
  };

  const eventReferencesCounter = (
    conditions: ReactionScriptCondition[],
    counterName: string
  ) =>
    conditions.some(
      (condition) =>
        condition.kind === 'count_compare' &&
        normalizeLookupKey(
          resolveCounterName(condition.counterName) ?? condition.counterName
        ) === normalizeLookupKey(counterName)
    );

  const runStatements = (
    statements: ReactionScriptStatement[],
    scriptKind: 'event' | 'reaction'
  ): ReactionScriptIssue | null => {
    for (const statement of statements) {
      if (stopped || stopReaction) {
        return null;
      }

      const conditionsPassed = evaluateConditions(
        statement.conditions,
        counterValues
      );
      if (!conditionsPassed) {
        continue;
      }

      if (statement.action.kind === 'add') {
        statement.action.elementRefs.forEach((elementRef) => {
          const elementId = resolveElementId(elementRef);
          if (elementId) {
            if (nonGameplayElements.has(normalizeLookupKey(elementId))) {
              const counterName = getCounterNameForElementId({
                elementId,
                resolveCounterName,
                resolveElementName,
              });
              if (counterName) {
                shownCounterNames.add(counterName);
                hiddenCounterNames.delete(counterName);
              }
              return;
            }

            emittedElementIds.push(elementId);
          }
        });
        continue;
      }

      if (statement.action.kind === 'set') {
        const counterName =
          resolveCounterName(statement.action.counterName) ??
          statement.action.counterName;
        const currentValue = counterValues[counterName] ?? 0;
        const previousCounterValues = { ...counterValues };
        const bounds = counterBounds.get(normalizeLookupKey(counterName));
        let nextValue = currentValue;
        if (statement.action.operator === '=') {
          nextValue = statement.action.value;
        } else if (statement.action.operator === '+=') {
          nextValue = currentValue + statement.action.value;
        } else {
          nextValue = currentValue - statement.action.value;
        }
        counterValues[counterName] = bounds
          ? clampToOptionalBounds(nextValue, bounds.min, bounds.max)
          : nextValue;

        const eventError = runCounterEvents(counterName, previousCounterValues);
        if (eventError) {
          return eventError;
        }
        continue;
      }

      if (statement.action.kind === 'remove') {
        const elementId = resolveElementId(statement.action.elementRef);
        if (!elementId) {
          continue;
        }

        if (nonGameplayElements.has(normalizeLookupKey(elementId))) {
          const counterName = getCounterNameForElementId({
            elementId,
            resolveCounterName,
            resolveElementName,
          });
          if (counterName) {
            hiddenCounterNames.add(counterName);
            shownCounterNames.delete(counterName);
          }
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
        if (!statement.action.elementRef) {
          tableElements.forEach((tableElement) => {
            removedTableElementIds.push(tableElement.id);
          });
          tableElements.splice(0, tableElements.length);
          continue;
        }

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

      if (
        statement.action.kind === 'popup' ||
        statement.action.kind === 'win' ||
        statement.action.kind === 'lose'
      ) {
        popupEvents.push({
          iconElementId: statement.action.iconElementRef
            ? resolveElementId(statement.action.iconElementRef)
            : null,
          kind: statement.action.kind,
          text: statement.action.text,
        });

        if (statement.action.kind !== 'popup') {
          stopped = true;
          return null;
        }

        continue;
      }

      if (statement.action.kind === 'stop_reaction') {
        if (scriptKind === 'event') {
          stopReaction = true;
          return null;
        }

        return {
          line: statement.line,
          message: 'stop-reaction can only be used inside event scripts.',
        };
      }

      if (scriptKind === 'reaction') {
        stopped = true;
      }
      return null;
    }

    return null;
  };

  const runEventScript = (event: ModEvent) => {
    const eventScript = parseScriptAst(event.script);
    if (!eventScript.ok) {
      return eventScript.errors[0] ?? {
        line: 1,
        message: 'Invalid event script.',
      };
    }

    const eventValidation = validateReactionScript(eventScript.ast, {
      ...context,
      scriptKind: 'event',
    });
    if (!eventValidation.ok) {
      return eventValidation.errors[0] ?? {
        line: 1,
        message: 'Invalid event script.',
      };
    }

    return runStatements(eventScript.ast.statements, 'event');
  };

  function runCounterEvents(
    counterName: string,
    previousCounterValues: Record<string, number>
  ): ReactionScriptIssue | null {
    const events = context.events ?? [];
    for (const [eventIndex, event] of events.entries()) {
      if (stopped || stopReaction) {
        return null;
      }

      const eventConditions = getEventConditions(event);
      if (!eventConditions.ok) {
        return eventConditions.error;
      }
      const { conditions } = eventConditions;

      if (!eventReferencesCounter(conditions, counterName)) {
        continue;
      }

      const eventId = String(eventIndex);
      const wasPassed = evaluateConditions(conditions, previousCounterValues);
      const isPassed = evaluateConditions(conditions, counterValues);
      if (isPassed) {
        eventState.activeEventIds.add(eventId);
      } else {
        eventState.activeEventIds.delete(eventId);
      }

      const shouldRun =
        event.mode === 'always'
          ? isPassed
          : event.mode === 'once'
            ? isPassed && !eventState.firedEventIds.has(eventId)
            : !wasPassed && isPassed;
      if (!shouldRun) {
        continue;
      }

      eventExecutionCount += 1;
      if (eventExecutionCount > MAX_EVENT_EXECUTIONS_PER_REACTION) {
        return {
          line: 1,
          message: 'Event loop limit exceeded.',
        };
      }

      eventState.firedEventIds.add(eventId);
      const eventError = runEventScript(event);
      if (eventError) {
        return eventError;
      }
    }

    return null;
  }

  const executionError = runStatements(
    parsed.ast.statements,
    context.scriptKind ?? 'reaction'
  );
  if (executionError) {
    return {
      errors: [executionError],
      ok: false,
    };
  }

  return {
    ok: true,
    result: {
      counterValues,
      emittedElementIds,
      hiddenCounterNames: Array.from(hiddenCounterNames),
      messages,
      popupEvents,
      removedTableElementIds,
      ...((context.events?.length ?? 0) > 0 || context.eventState
        ? {
            eventState: {
              activeEventIds: Array.from(eventState.activeEventIds),
              firedEventIds: Array.from(eventState.firedEventIds),
            },
          }
        : {}),
      shownCounterNames: Array.from(shownCounterNames),
      ...(stopReaction ? { stopReaction } : {}),
      stopped,
    },
  };

};
