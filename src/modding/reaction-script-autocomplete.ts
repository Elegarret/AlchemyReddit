import {
  findReactionScriptCommentStart,
  parseReactionScript,
} from './reaction-script';

export type ReactionScriptAutocompleteSuggestion = {
  cursorOffset: number;
  description?: string;
  insertText?: string;
  label: string;
  previewText?: string;
  replaceEnd: number;
  replaceToTokenEnd?: boolean;
  replaceStart: number;
  text: string;
};

export type ReactionScriptAutocompleteResult = {
  suggestions: ReactionScriptAutocompleteSuggestion[];
};

export type ReactionScriptAutocompleteMode = 'script' | 'reaction-text';

type SuggestionTemplate = {
  cursorOffset: number;
  description?: string;
  label: string;
  text: string;
};

type LineIfContext =
  | {
      kind: 'action';
      prefix: string;
      prefixStart: number;
    }
  | {
      kind: 'conditions';
      prefix: string;
      prefixStart: number;
    }
  | null;

type OpenCallContext = {
  argumentText: string;
  replaceStart: number;
};

type ClosedCallContext = {
  argumentText: string;
};

const TOP_LEVEL_ACTION_TEMPLATES: SuggestionTemplate[] = [
  {
    cursorOffset: 'if ('.length,
    label: 'if',
    text: 'if () ',
  },
  {
    cursorOffset: 'add '.length,
    description: 'add element',
    label: 'add',
    text: 'add ',
  },
  {
    cursorOffset: 'remove '.length,
    description: 'remove element',
    label: 'remove',
    text: 'remove ',
  },
  {
    cursorOffset: 'remove_all '.length,
    description: 'remove elements of a kind',
    label: 'remove_all',
    text: 'remove_all ',
  },
  {
    cursorOffset: 'set '.length,
    description: 'set counter +=/-=/= value',
    label: 'set',
    text: 'set ',
  },
  {
    cursorOffset: 'message "'.length,
    description: 'show text message',
    label: 'message',
    text: 'message ""',
  },
  {
    cursorOffset: 'popup "'.length,
    description: 'show blocking popup',
    label: 'popup',
    text: 'popup ""',
  },
  {
    cursorOffset: 'win "'.length,
    description: 'show blocking win screen',
    label: 'win',
    text: 'win ""',
  },
  {
    cursorOffset: 'lose "'.length,
    description: 'show blocking lose screen',
    label: 'lose',
    text: 'lose ""',
  },
  {
    cursorOffset: 'stop'.length,
    description: 'ignore remaining script',
    label: 'stop',
    text: 'stop',
  },
];

const NESTED_ACTION_TEMPLATES = TOP_LEVEL_ACTION_TEMPLATES.filter(
  (template) => template.label !== 'if'
);

const CONDITION_TEMPLATES: SuggestionTemplate[] = [
  {
    cursorOffset: 'on_table('.length,
    label: 'on_table',
    text: 'on_table()',
  },
  {
    cursorOffset: 'not_on_table('.length,
    label: 'not_on_table',
    text: 'not_on_table()',
  },
  {
    cursorOffset: 'discovered('.length,
    label: 'discovered',
    text: 'discovered()',
  },
  {
    cursorOffset: 'not_discovered('.length,
    label: 'not_discovered',
    text: 'not_discovered()',
  },
  {
    cursorOffset: 'count('.length,
    label: 'count',
    text: 'count()',
  },
];

const AND_TEMPLATE: SuggestionTemplate = {
  cursorOffset: 'and '.length,
  description: 'logical and',
  label: 'and',
  text: 'and ',
};

const SET_OPERATOR_TEMPLATES: Array<
  SuggestionTemplate & {
    text: ' = ' | ' += ' | ' -= ';
  }
> = [
  {
    cursorOffset: ' = '.length,
    description: 'set to value',
    label: '=',
    text: ' = ',
  },
  {
    cursorOffset: ' += '.length,
    description: 'add value',
    label: '+=',
    text: ' += ',
  },
  {
    cursorOffset: ' -= '.length,
    description: 'subtract value',
    label: '-=',
    text: ' -= ',
  },
];

const REACTION_SCRIPT_BLOCK_SUGGESTION = {
  cursorOffset: '\n    '.length,
  description: 'start scripted block',
  insertText: '\n    ',
  label: '</>script',
  previewText: '</>script',
  text: '</>script',
} satisfies Omit<
  ReactionScriptAutocompleteSuggestion,
  'replaceEnd' | 'replaceStart'
>;

const REACTION_TEXT_EVENT_TEMPLATES: SuggestionTemplate[] = [
  {
    cursorOffset: 'event '.length,
    description: 'counter event',
    label: 'event',
    text: 'event ',
  },
];

const REACTION_TEXT_EVENT_MODE_TEMPLATES: SuggestionTemplate[] = [
  {
    cursorOffset: 'crossing: '.length,
    description: 'when condition becomes true',
    label: 'crossing',
    text: 'crossing: ',
  },
  {
    cursorOffset: 'once: '.length,
    description: 'once per playthrough',
    label: 'once',
    text: 'once: ',
  },
  {
    cursorOffset: 'always: '.length,
    description: 'after any counter changes',
    label: 'always',
    text: 'always: ',
  },
];

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeName = (value: string) => value.trim().toLowerCase();

const sortNames = (values: string[]) =>
  [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' })
  );

const AUTOCOMPLETE_TOKEN_END_CHARACTER_PATTERN = /[,+:=()"\n\r]/;

const filterNames = (values: string[], partial: string) => {
  const normalizedPartial = normalizeName(partial);
  const sorted = sortNames(values.filter(Boolean));
  if (!normalizedPartial) {
    return sorted;
  }

  return sorted.filter((value) =>
    normalizeName(value).startsWith(normalizedPartial)
  );
};

const buildSuggestions = (
  templates: SuggestionTemplate[],
  partial: string,
  replaceStart: number,
  replaceEnd: number
) => {
  const normalizedPartial = partial.trim().toLowerCase();
  if (
    normalizedPartial &&
    templates.some((template) => template.label === normalizedPartial)
  ) {
    return [];
  }

  return templates
    .filter((template) =>
      normalizedPartial
        ? template.label.startsWith(normalizedPartial)
        : true
    )
    .map((template) => ({
      cursorOffset: template.cursorOffset,
      ...(template.description
        ? { description: template.description }
        : {}),
      label: template.label,
      replaceEnd,
      replaceStart,
      text: template.text,
    }));
};

const buildNameSuggestions = (
  values: string[],
  partial: string,
  replaceStart: number,
  replaceEnd: number
) => {
  const normalizedPartial = normalizeName(partial);
  const names = filterNames(values, partial);
  if (
    normalizedPartial &&
    names.some((value) => normalizeName(value) === normalizedPartial)
  ) {
    return [];
  }

  return names.map((value) => ({
    cursorOffset: value.length,
    label: value,
    replaceEnd,
    replaceToTokenEnd: true,
    replaceStart,
    text: value,
  }));
};

const getCommittedElementName = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getClosedCallContext = (value: string, names: string[]) => {
  for (const name of names) {
    const matcher = value.match(
      new RegExp(`^\\s*${escapeRegExp(name)}\\s*\\((.*)\\)\\s*$`, 's')
    );
    if (matcher) {
      return {
        argumentText: matcher[1] ?? '',
      } satisfies ClosedCallContext;
    }
  }

  return null;
};

const getCommittedElementPredicateName = (value: string) => {
  const openCall = getOpenCallContext(value, [
    'on_table',
    'not_on_table',
    'discovered',
    'not_discovered',
  ]);
  if (openCall) {
    return getCommittedElementName(openCall.argumentText);
  }

  const closedCall = getClosedCallContext(value, [
    'on_table',
    'not_on_table',
    'discovered',
    'not_discovered',
  ]);
  return closedCall ? getCommittedElementName(closedCall.argumentText) : null;
};

const getCommittedPopupIconElementName = (value: string) => {
  const closedCallMatch = value.match(
    /^\s*(?:popup|win|lose)\s*\(\s*"(?:\\.|[^"\\])*"\s*,\s*(.+?)\s*\)\s*$/s
  );
  if (closedCallMatch) {
    return getCommittedElementName(closedCallMatch[1] ?? '');
  }

  const bareMatch = value.match(
    /^\s*(?:popup|win|lose)\s+"(?:\\.|[^"\\])*"\s*,\s*(.+?)\s*$/s
  );
  if (bareMatch) {
    return getCommittedElementName(bareMatch[1] ?? '');
  }

  const openCallMatch = value.match(
    /^\s*(?:popup|win|lose)\s*\(\s*"(?:\\.|[^"\\])*"\s*,\s*(.+)$/s
  );
  if (openCallMatch) {
    return getCommittedElementName(openCallMatch[1] ?? '');
  }

  const openBareMatch = value.match(
    /^\s*(?:popup|win|lose)\s+"(?:\\.|[^"\\])*"\s*,\s*(.+)$/s
  );
  return openBareMatch ? getCommittedElementName(openBareMatch[1] ?? '') : null;
};

const matchesWordTokenAt = (value: string, index: number, token: string) => {
  const previous = value[index - 1];
  const next = value[index + token.length];
  return (
    value.slice(index, index + token.length) === token &&
    (previous === undefined || /\s|\(|\)/.test(previous)) &&
    (next === undefined || /\s|\(|\)/.test(next))
  );
};

const getLineIfContext = (linePrefix: string): LineIfContext => {
  const leadingWhitespace = linePrefix.match(/^\s*/)?.[0].length ?? 0;
  const prefixWithoutIndent = linePrefix.slice(leadingWhitespace);
  if (!/^if(?=\s|\()/.test(prefixWithoutIndent)) {
    return null;
  }

  let cursor = leadingWhitespace + 'if'.length;
  while (linePrefix[cursor] === ' ') {
    cursor += 1;
  }

  if (linePrefix[cursor] !== '(') {
    return null;
  }

  let depth = 0;
  for (let index = cursor; index < linePrefix.length; index += 1) {
    const character = linePrefix[index];
    if (character === '(') {
      depth += 1;
      continue;
    }

    if (character !== ')') {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return {
        kind: 'action',
        prefix: linePrefix.slice(index + 1),
        prefixStart: index + 1,
      };
    }
  }

  return {
    kind: 'conditions',
    prefix: linePrefix.slice(cursor + 1),
    prefixStart: cursor + 1,
  };
};

const getOpenCallContext = (value: string, names: string[]) => {
  let bestMatch: OpenCallContext | null = null;

  for (const name of names) {
    const matcher = new RegExp(`${escapeRegExp(name)}\\s*\\(`, 'g');
    let match = matcher.exec(value);
    while (match) {
      const replaceStart = match.index + match[0].length;
      const argumentText = value.slice(replaceStart);
      if (!argumentText.includes(')')) {
        bestMatch = {
          argumentText,
          replaceStart,
        };
      }

      match = matcher.exec(value);
    }
  }

  return bestMatch;
};

const getConditionSegment = (value: string) => {
  let depth = 0;
  let segmentStart = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') {
      depth += 1;
      continue;
    }

    if (character === ')') {
      depth -= 1;
      continue;
    }

    if (depth === 0 && matchesWordTokenAt(value, index, 'and')) {
      segmentStart = index + 'and'.length;
      index += 'and'.length - 1;
    }
  }

  return {
    start: segmentStart,
    text: value.slice(segmentStart),
  };
};

const getCommentAwareLineContext = (line: string, cursorInLine: number) => {
  const commentStart = findReactionScriptCommentStart(line);
  if (commentStart === -1) {
    return {
      isInComment: false,
      linePrefix: line.slice(0, cursorInLine),
      lineValue: line,
    };
  }

  return {
    isInComment: cursorInLine >= commentStart,
    linePrefix: line.slice(0, Math.min(cursorInLine, commentStart)),
    lineValue: line.slice(0, commentStart),
  };
};

const isCompleteCondition = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return parseReactionScript(`if (${trimmed}) stop`).ok;
};

const getConditionSuggestions = (params: {
  absoluteStart: number;
  counterNames: string[];
  elementNames: string[];
  prefix: string;
}) => {
  const { absoluteStart, counterNames, elementNames, prefix } = params;
  const elementCall = getOpenCallContext(prefix, [
    'on_table',
    'not_on_table',
    'discovered',
    'not_discovered',
  ]);
  if (elementCall) {
    return buildNameSuggestions(
      elementNames,
      elementCall.argumentText,
      absoluteStart + elementCall.replaceStart,
      absoluteStart + prefix.length
    );
  }

  const countCall = getOpenCallContext(prefix, ['count']);
  if (countCall) {
    return buildNameSuggestions(
      counterNames,
      countCall.argumentText,
      absoluteStart + countCall.replaceStart,
      absoluteStart + prefix.length
    );
  }

  const conditionSegment = getConditionSegment(prefix);
  const segmentText = conditionSegment.text;
  const trimmedSegment = segmentText.trimStart();
  const replaceStart =
    absoluteStart + conditionSegment.start + (segmentText.length - trimmedSegment.length);
  const replaceEnd = absoluteStart + prefix.length;

  if (isCompleteCondition(segmentText)) {
    return [
      {
        cursorOffset: AND_TEMPLATE.cursorOffset,
        ...(AND_TEMPLATE.description
          ? { description: AND_TEMPLATE.description }
          : {}),
        label: AND_TEMPLATE.label,
        replaceEnd,
        replaceStart: replaceEnd,
        text: AND_TEMPLATE.text,
      },
    ];
  }

  if (!/^[A-Za-z_]*$/.test(trimmedSegment)) {
    return [];
  }

  return buildSuggestions(
    CONDITION_TEMPLATES,
    trimmedSegment,
    replaceStart,
    replaceEnd
  );
};

const getActionSuggestions = (params: {
  absoluteStart: number;
  allowIf: boolean;
  counterNames: string[];
  elementNames: string[];
  iconElementNames: string[];
  prefix: string;
}) => {
  const {
    absoluteStart,
    allowIf,
    counterNames,
    elementNames,
    iconElementNames,
    prefix,
  } = params;
  const setKeywordMatch = prefix.match(/^(\s*set(?:\s+|\(\s*))(.*)$/s);
  if (setKeywordMatch) {
    const keywordPrefix = setKeywordMatch[1] ?? '';
    const rawArgument = setKeywordMatch[2] ?? '';
    if (keywordPrefix.includes('(') && rawArgument.includes(')')) {
      return [];
    }

    if (rawArgument.includes(',')) {
      return [];
    }

    const exactCounterMatch = rawArgument.match(
      /^(\s*)([A-Za-z][A-Za-z0-9_-]*)(\s*)$/
    );
    if (exactCounterMatch) {
      const exactCounterName = exactCounterMatch[2] ?? '';
      const isExactCounter = counterNames.some(
        (counterName) => normalizeName(counterName) === normalizeName(exactCounterName)
      );
      if (isExactCounter) {
        const leadingWhitespace = exactCounterMatch[1]?.length ?? 0;
        const counterNameLength = exactCounterName.length;
        const replaceStart =
          absoluteStart + keywordPrefix.length + leadingWhitespace + counterNameLength;
        const replaceEnd = absoluteStart + keywordPrefix.length + rawArgument.length;

        return SET_OPERATOR_TEMPLATES.map((template) => ({
          cursorOffset: template.cursorOffset,
          ...(template.description
            ? { description: template.description }
            : {}),
          label: template.label,
          replaceEnd,
          replaceStart,
          text: template.text,
        }));
      }
    }

    if (/^\s*[A-Za-z][A-Za-z0-9_-]*\s*(?:\+=|-=|=)/.test(rawArgument)) {
      return [];
    }

    const trimmedArgument = rawArgument.trimStart();
    if (!/^[A-Za-z0-9_-]*$/.test(trimmedArgument)) {
      return [];
    }

    return buildNameSuggestions(
      counterNames,
      trimmedArgument,
      absoluteStart + keywordPrefix.length + (rawArgument.length - trimmedArgument.length),
      absoluteStart + prefix.length
    );
  }

  const popupStyleMatch = prefix.match(
    /^(\s*(?:popup|win|lose)(?:\s*\(\s*|\s+)"(?:\\.|[^"\\])*"\s*,\s*)(.*)$/s
  );
  if (popupStyleMatch) {
    const keywordPrefix = popupStyleMatch[1] ?? '';
    const partial = popupStyleMatch[2] ?? '';
    return buildNameSuggestions(
      iconElementNames,
      partial,
      absoluteStart + keywordPrefix.length,
      absoluteStart + prefix.length
    );
  }

  const addKeywordMatch = prefix.match(/^(\s*add\s+)(.*)$/s);
  if (addKeywordMatch) {
    const keywordPrefix = addKeywordMatch[1] ?? '';
    const rawList = addKeywordMatch[2] ?? '';
    const segmentStart = rawList.lastIndexOf(',') + 1;
    const segment = rawList.slice(segmentStart);
    const trimmedSegment = segment.trimStart();

    return buildNameSuggestions(
      elementNames,
      trimmedSegment,
      absoluteStart +
        keywordPrefix.length +
        segmentStart +
        (segment.length - trimmedSegment.length),
      absoluteStart + prefix.length
    );
  }

  const elementKeywordMatch = prefix.match(/^(\s*(?:remove|remove_all)\s+)(.*)$/s);
  if (elementKeywordMatch) {
    const keywordPrefix = elementKeywordMatch[1] ?? '';
    const partial = elementKeywordMatch[2] ?? '';
    return buildNameSuggestions(
      elementNames,
      partial,
      absoluteStart + keywordPrefix.length,
      absoluteStart + prefix.length
    );
  }

  const trimmedPrefix = prefix.trimStart();
  if (!/^[A-Za-z_]*$/.test(trimmedPrefix)) {
    return [];
  }

  const templates = allowIf ? TOP_LEVEL_ACTION_TEMPLATES : NESTED_ACTION_TEMPLATES;
  const replaceStart =
    absoluteStart + (prefix.length - trimmedPrefix.length);

  return buildSuggestions(
    templates,
    trimmedPrefix,
    replaceStart,
    absoluteStart + prefix.length
  );
};

const getCommittedScriptElementName = (params: {
  cursor: number;
  triggerKey: string;
  value: string;
}) => {
  const { cursor, triggerKey, value } = params;
  if (triggerKey !== ',' && triggerKey !== 'Enter') {
    return null;
  }

  const lineStart = value.lastIndexOf('\n', Math.max(cursor - 1, 0)) + 1;
  const commentContext = getCommentAwareLineContext(
    value.slice(lineStart, cursor),
    cursor - lineStart
  );
  if (commentContext.isInComment) {
    return null;
  }

  const linePrefix = commentContext.linePrefix;
  const ifContext = getLineIfContext(linePrefix);
  if (ifContext?.kind === 'conditions') {
    return getCommittedElementPredicateName(ifContext.prefix);
  }

  const actionPrefix = ifContext?.kind === 'action' ? ifContext.prefix : linePrefix;
  const addKeywordMatch = actionPrefix.match(/^(\s*add\s+)(.*)$/s);
  if (addKeywordMatch) {
    const rawList = addKeywordMatch[2] ?? '';
    const segmentStart = rawList.lastIndexOf(',') + 1;
    return getCommittedElementName(rawList.slice(segmentStart));
  }

  const elementKeywordMatch = actionPrefix.match(
    /^\s*(?:remove|remove_all)\s+(.+)$/s
  );
  if (elementKeywordMatch) {
    return getCommittedElementName(elementKeywordMatch[1] ?? '');
  }

  const popupIconElementName = getCommittedPopupIconElementName(actionPrefix);
  if (popupIconElementName) {
    return popupIconElementName;
  }

  return null;
};

const getCommittedReactionTextElementName = (params: {
  cursor: number;
  triggerKey: string;
  value: string;
}) => {
  const { cursor, triggerKey, value } = params;
  const lineStart = value.lastIndexOf('\n', Math.max(cursor - 1, 0)) + 1;
  const rawLinePrefix = value.slice(lineStart, cursor);
  const commentContext = getCommentAwareLineContext(
    rawLinePrefix,
    cursor - lineStart
  );
  if (commentContext.isInComment) {
    return null;
  }

  const linePrefix = commentContext.linePrefix;

  if (linePrefix.startsWith('    ') || linePrefix.startsWith('\t')) {
    const indentLength = linePrefix.startsWith('    ') ? 4 : 1;
    const lineCursor = cursor - lineStart - indentLength;
    if (lineCursor < 0) {
      return null;
    }

    return getCommittedScriptElementName({
      cursor: lineCursor,
      triggerKey,
      value: value.slice(lineStart + indentLength, cursor),
    });
  }

  if (triggerKey === '+') {
    return getCommittedElementName(linePrefix);
  }

  if (triggerKey !== ',' && triggerKey !== 'Enter') {
    return null;
  }

  const plusIndex = linePrefix.indexOf('+');
  const equalsIndex = linePrefix.indexOf('=');
  const colonIndex = linePrefix.indexOf(':');
  const hasScriptBlockColon =
    colonIndex !== -1 && (equalsIndex === -1 || colonIndex < equalsIndex);

  if (
    plusIndex === -1 ||
    (equalsIndex !== -1 && plusIndex > equalsIndex) ||
    (hasScriptBlockColon && plusIndex > colonIndex)
  ) {
    return null;
  }

  if (equalsIndex === -1) {
    return triggerKey === 'Enter'
      ? getCommittedElementName(linePrefix.slice(plusIndex + 1))
      : null;
  }

  const outputsPrefix = linePrefix.slice(equalsIndex + 1);
  const outputSegmentStart = outputsPrefix.lastIndexOf(',') + 1;
  return getCommittedElementName(outputsPrefix.slice(outputSegmentStart));
};

export const getReactionScriptAutocomplete = (params: {
  counterNames: string[];
  cursor: number;
  elementNames: string[];
  iconElementNames?: string[];
  value: string;
}): ReactionScriptAutocompleteResult => {
  const {
    counterNames,
    cursor,
    elementNames,
    iconElementNames = elementNames,
    value,
  } = params;
  const lineStart = value.lastIndexOf('\n', Math.max(cursor - 1, 0)) + 1;
  const lineCommentContext = getCommentAwareLineContext(
    value.slice(lineStart, cursor),
    cursor - lineStart
  );
  if (lineCommentContext.isInComment) {
    return { suggestions: [] };
  }

  const linePrefix = lineCommentContext.linePrefix;
  const ifContext = getLineIfContext(linePrefix);

  if (ifContext?.kind === 'conditions') {
    return {
      suggestions: getConditionSuggestions({
        absoluteStart: lineStart + ifContext.prefixStart,
        counterNames,
        elementNames,
        prefix: ifContext.prefix,
      }),
    };
  }

  if (ifContext?.kind === 'action') {
    return {
      suggestions: getActionSuggestions({
        absoluteStart: lineStart + ifContext.prefixStart,
        allowIf: false,
        counterNames,
        elementNames,
        iconElementNames,
        prefix: ifContext.prefix,
      }),
    };
  }

  return {
    suggestions: getActionSuggestions({
      absoluteStart: lineStart,
      allowIf: true,
      counterNames,
      elementNames,
      iconElementNames,
      prefix: linePrefix,
    }),
  };
};

export const getCommittedReactionScriptAutocompleteElement = (params: {
  cursor: number;
  mode: ReactionScriptAutocompleteMode;
  triggerKey: string;
  value: string;
}) =>
  params.mode === 'script'
    ? getCommittedScriptElementName(params)
    : getCommittedReactionTextElementName(params);

export const getReactionTextAutocomplete = (params: {
  counterNames: string[];
  cursor: number;
  elementNames: string[];
  iconElementNames?: string[];
  value: string;
}): ReactionScriptAutocompleteResult => {
  const {
    counterNames,
    cursor,
    elementNames,
    iconElementNames = elementNames,
    value,
  } = params;
  const lineStart = value.lastIndexOf('\n', Math.max(cursor - 1, 0)) + 1;
  const rawLinePrefix = value.slice(lineStart, cursor);
  const lineCommentContext = getCommentAwareLineContext(
    rawLinePrefix,
    cursor - lineStart
  );
  if (lineCommentContext.isInComment) {
    return { suggestions: [] };
  }

  const linePrefix = lineCommentContext.linePrefix;

  if (linePrefix.startsWith('    ') || linePrefix.startsWith('\t')) {
    const indentLength = linePrefix.startsWith('    ') ? 4 : 1;
    const lineCursor = cursor - lineStart - indentLength;
    if (lineCursor < 0) {
      return { suggestions: [] };
    }

    const lineEndIndex = value.indexOf('\n', cursor);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const lineValue = getCommentAwareLineContext(
      value.slice(lineStart + indentLength, lineEnd),
      lineCursor
    ).lineValue;

    return {
      suggestions: getReactionScriptAutocomplete({
        counterNames,
        cursor: Math.min(lineCursor, lineValue.length),
        elementNames,
        iconElementNames,
        value: lineValue,
      }).suggestions.map((suggestion) => ({
        ...suggestion,
        replaceEnd: suggestion.replaceEnd + lineStart + indentLength,
        replaceStart: suggestion.replaceStart + lineStart + indentLength,
      })),
    };
  }

  if (/^\s/.test(linePrefix)) {
    return { suggestions: [] };
  }

  const absoluteEnd = lineStart + linePrefix.length;
  const plusIndex = linePrefix.indexOf('+');
  const equalsIndex = linePrefix.indexOf('=');
  const colonIndex = linePrefix.indexOf(':');
  const hasScriptBlockColon =
    colonIndex !== -1 && (equalsIndex === -1 || colonIndex < equalsIndex);

  if (
    plusIndex === -1 ||
    (equalsIndex !== -1 && plusIndex > equalsIndex) ||
    (hasScriptBlockColon && plusIndex > colonIndex)
  ) {
    const trimmedPrefix = linePrefix.trimStart();
    const replaceStart = lineStart + (linePrefix.length - trimmedPrefix.length);
    const eventModeMatch = trimmedPrefix.match(/^event\s+([A-Za-z_]*)$/);
    if (eventModeMatch) {
      const modePartial = eventModeMatch[1] ?? '';
      return {
        suggestions: buildSuggestions(
          REACTION_TEXT_EVENT_MODE_TEMPLATES,
          modePartial,
          replaceStart + trimmedPrefix.length - modePartial.length,
          absoluteEnd
        ),
      };
    }

    const eventConditionMatch = trimmedPrefix.match(
      /^event(?:\s+(?:crossing|once|always))?:\s*(.*)$/s
    );
    if (eventConditionMatch) {
      const conditionPrefix = eventConditionMatch[1] ?? '';
      return {
        suggestions: getConditionSuggestions({
          absoluteStart: absoluteEnd - conditionPrefix.length,
          counterNames,
          elementNames,
          prefix: conditionPrefix,
        }),
      };
    }

    if (/^event$/.test(trimmedPrefix)) {
      return {
        suggestions: buildSuggestions(
          REACTION_TEXT_EVENT_TEMPLATES,
          trimmedPrefix,
          replaceStart,
          absoluteEnd
        ),
      };
    }

    return {
      suggestions: [
        ...buildSuggestions(
          REACTION_TEXT_EVENT_TEMPLATES,
          trimmedPrefix,
          replaceStart,
          absoluteEnd
        ),
        ...buildNameSuggestions(
          elementNames,
          trimmedPrefix,
          replaceStart,
          absoluteEnd
        ),
      ],
    };
  }

  if (hasScriptBlockColon) {
    return { suggestions: [] };
  }

  if (equalsIndex === -1) {
    const rightPrefix = linePrefix.slice(plusIndex + 1);
    const trimmedRightPrefix = rightPrefix.trimStart();
    return {
      suggestions: buildNameSuggestions(
        elementNames,
        trimmedRightPrefix,
        lineStart + plusIndex + 1 + (rightPrefix.length - trimmedRightPrefix.length),
        absoluteEnd
      ),
    };
  }

  const outputsPrefix = linePrefix.slice(equalsIndex + 1);
  const trimmedOutputsPrefix = outputsPrefix.trim();
  const outputSegmentStart = outputsPrefix.lastIndexOf(',') + 1;
  const outputSegment = outputsPrefix.slice(outputSegmentStart);
  const trimmedOutputSegment = outputSegment.trimStart();
  const replaceStart =
    lineStart +
    equalsIndex +
    1 +
    outputSegmentStart +
    (outputSegment.length - trimmedOutputSegment.length);
  const outputSuggestions = buildNameSuggestions(
    elementNames,
    trimmedOutputSegment,
    replaceStart,
    absoluteEnd
  );

  if (!trimmedOutputsPrefix) {
    return {
      suggestions: [
        {
          ...REACTION_SCRIPT_BLOCK_SUGGESTION,
          replaceEnd: absoluteEnd,
          replaceStart: lineStart + equalsIndex + 1,
        },
        ...outputSuggestions,
      ],
    };
  }

  return {
    suggestions: outputSuggestions,
  };
};

export const applyReactionScriptAutocompleteSuggestion = (params: {
  suggestion: ReactionScriptAutocompleteSuggestion;
  value: string;
}) => {
  const { suggestion, value } = params;
  let effectiveReplaceEnd = suggestion.replaceEnd;
  if (suggestion.replaceToTokenEnd) {
    while (
      effectiveReplaceEnd < value.length &&
      !AUTOCOMPLETE_TOKEN_END_CHARACTER_PATTERN.test(
        value[effectiveReplaceEnd] ?? ''
      )
    ) {
      effectiveReplaceEnd += 1;
    }
  }

  const nextValue =
    value.slice(0, suggestion.replaceStart) +
    (suggestion.insertText ?? suggestion.text) +
    value.slice(effectiveReplaceEnd);
  const cursor = suggestion.replaceStart + suggestion.cursorOffset;

  return {
    cursor,
    value: nextValue,
  };
};
