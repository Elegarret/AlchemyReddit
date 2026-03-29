import { parseReactionScript } from './reaction-script';

export type ReactionScriptAutocompleteSuggestion = {
  cursorOffset: number;
  description?: string;
  label: string;
  replaceEnd: number;
  replaceStart: number;
  text: string;
};

export type ReactionScriptAutocompleteResult = {
  suggestions: ReactionScriptAutocompleteSuggestion[];
};

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
    cursorOffset: 'set('.length,
    label: 'set',
    text: 'set()',
  },
  {
    cursorOffset: 'message("'.length,
    description: 'show text message',
    label: 'message',
    text: 'message("")',
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

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeName = (value: string) => value.trim().toLowerCase();

const sortNames = (values: string[]) =>
  [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' })
  );

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
    replaceStart,
    text: value,
  }));
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
  prefix: string;
}) => {
  const { absoluteStart, allowIf, counterNames, elementNames, prefix } = params;
  const setCall = getOpenCallContext(prefix, ['set']);
  if (setCall) {
    return buildNameSuggestions(
      counterNames,
      setCall.argumentText,
      absoluteStart + setCall.replaceStart,
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

export const getReactionScriptAutocomplete = (params: {
  counterNames: string[];
  cursor: number;
  elementNames: string[];
  value: string;
}): ReactionScriptAutocompleteResult => {
  const { counterNames, cursor, elementNames, value } = params;
  const lineStart = value.lastIndexOf('\n', Math.max(cursor - 1, 0)) + 1;
  const linePrefix = value.slice(lineStart, cursor);
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
      prefix: linePrefix,
    }),
  };
};

export const applyReactionScriptAutocompleteSuggestion = (params: {
  suggestion: ReactionScriptAutocompleteSuggestion;
  value: string;
}) => {
  const { suggestion, value } = params;
  const nextValue =
    value.slice(0, suggestion.replaceStart) +
    suggestion.text +
    value.slice(suggestion.replaceEnd);
  const cursor = suggestion.replaceStart + suggestion.cursorOffset;

  return {
    cursor,
    value: nextValue,
  };
};
