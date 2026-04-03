import {
  DEFAULT_MOD_BG_COLOR_TOKEN,
  DEFAULT_MOD_FRAME_COLOR_TOKEN,
} from '../modding/colors';
import {
  DEFAULT_MOD_TITLE,
  createElementIdFromName,
  normalizeAuthoredElementName,
} from '../modding/runtime';
import {
  formatReactionScript,
  splitReactionScriptLineComment,
  validateReactionScript,
} from '../modding/reaction-script';
import {
  MAX_REALM_SUMMARY_LENGTH,
  normalizeModCounterDefinition,
  type ReactionCommentBlock,
  type ReactionComments,
  type ModCounterDefinition,
  type ModElement,
  type ModListItem,
  type SaveDraftInput,
} from '../modding/types';
import { DEFAULT_ELEMENT_NAME_PREFIX } from './constants';

export const getSharePostUrl = (mod: Pick<ModListItem, 'sharePostId'>) => {
  if (!mod.sharePostId) {
    return null;
  }

  return `https://www.reddit.com/comments/${mod.sharePostId.replace('t3_', '')}`;
};

export const deriveElementGlyph = (name: string) => {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '•';
};

export const createStarterElement = (
  id: string,
  name: string,
  bgColorToken: string = DEFAULT_MOD_BG_COLOR_TOKEN,
  frameColorToken: string = DEFAULT_MOD_FRAME_COLOR_TOKEN
): ModElement => ({
  id,
  name,
  emoji: deriveElementGlyph(name),
  bgColorToken,
  frameColorToken,
  message: '',
  effect: 'none',
  nonConsumable: false,
});

export const createEmptyDraft = (): SaveDraftInput => ({
  title: DEFAULT_MOD_TITLE,
  summary: '',
  intro: '',
  startingElementIds: ['air', 'fire', 'earth', 'water'],
  counters: [],
  showPalette: true,
  elements: [
    createStarterElement('air', 'Air', 'ice', 'ocean'),
    createStarterElement('fire', 'Fire', 'sun', 'ember'),
    createStarterElement('earth', 'Earth', 'sand', 'stone'),
    createStarterElement('water', 'Water', 'ocean', 'royal'),
  ],
  reactions: [],
  reactionComments: {
    byReaction: [],
    trailingComments: [],
  },
});

export const clampRealmSummary = (summary: string) =>
  summary.slice(0, MAX_REALM_SUMMARY_LENGTH);

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));

export const findElementByName = (elements: ModElement[], name: string) => {
  const normalized = name.trim().toLowerCase();
  return (
    elements.find(
      (element) => element.name.trim().toLowerCase() === normalized
    ) ?? null
  );
};

export const ensureUniqueElementId = (elements: ModElement[], name: string) => {
  const usedIds = new Set(elements.map((element) => element.id));
  const baseId = createElementIdFromName(name);
  let nextId = baseId;
  let suffix = 2;

  while (usedIds.has(nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return nextId;
};

export const getNextGeneratedElementName = (elements: ModElement[]) => {
  let suffix = 1;
  const usedNames = new Set(
    elements.map((element) => element.name.trim().toLowerCase())
  );

  while (
    usedNames.has(`${DEFAULT_ELEMENT_NAME_PREFIX}-${suffix}`.toLowerCase())
  ) {
    suffix += 1;
  }

  return `${DEFAULT_ELEMENT_NAME_PREFIX}-${suffix}`;
};

export const ensureElementInDraft = (
  draft: SaveDraftInput,
  rawName: string
) => {
  const trimmed = normalizeAuthoredElementName(rawName);
  if (!trimmed) {
    return {
      draft,
      elementId: null,
    };
  }

  const existing = findElementByName(draft.elements, trimmed);
  if (existing) {
    return {
      draft,
      elementId: existing.id,
    };
  }

  const nextElement = createStarterElement(
    ensureUniqueElementId(draft.elements, trimmed),
    trimmed
  );
  return {
    draft: {
      ...draft,
      elements: [...draft.elements, nextElement],
    },
    elementId: nextElement.id,
  };
};

const createEmptyReactionCommentBlock = (): ReactionCommentBlock => ({
  leadingComments: [],
});

const DECLARATION_LINE_KEYS = [
  'starters',
  'counters',
  'nonconsumables',
] as const;

type DeclarationLineKey = (typeof DECLARATION_LINE_KEYS)[number];

export type ReactionTextIssue = {
  line: number;
  message: string;
  missingElementName?: string;
};

export type ReactionTextParseResult = {
  draft: SaveDraftInput;
  errors: ReactionTextIssue[];
  ok: boolean;
};

const parseDeclarationLine = (rawLine: string) => {
  const match = rawLine.match(/^\s*([A-Za-z_]+)\s*:\s*(.*)$/);
  if (!match) {
    return null;
  }

  return {
    key: (match[1] ?? '').trim().toLowerCase(),
    value: match[2] ?? '',
  };
};

const getSupportedDeclarationKey = (rawKey: string) =>
  DECLARATION_LINE_KEYS.find((key) => key === rawKey) ?? null;

const startsWithSupportedDeclarationKeyword = (rawLine: string) =>
  DECLARATION_LINE_KEYS.some((key) =>
    new RegExp(`^\\s*${key}(?=\\s|$)`, 'i').test(rawLine)
  );

const parseIntegerToken = (value: string) => {
  if (!/^-?\d+$/.test(value)) {
    return null;
  }

  return Number(value);
};

const createReactionTextMissingElementIssue = (
  line: number,
  name: string
): ReactionTextIssue => ({
  line,
  message: `Unknown element "${name}".`,
  missingElementName: name,
});

const resolveExistingElementInDraft = (
  draft: SaveDraftInput,
  rawName: string
) => {
  const normalizedName = normalizeAuthoredElementName(rawName);
  if (!normalizedName) {
    return {
      elementId: null,
      normalizedName: null,
    };
  }

  const existing = findElementByName(draft.elements, normalizedName);
  return {
    elementId: existing?.id ?? null,
    normalizedName,
  };
};

const getDraftCounterNames = (draft: SaveDraftInput) =>
  draft.counters.flatMap((counter) => {
    const element = draft.elements.find(
      (candidate) => candidate.id === counter.elementId
    );

    return element?.name ? [element.name] : [];
  });

export const getReactionTextMissingElementNames = (
  issues: ReactionTextIssue[]
) => {
  const seen = new Set<string>();
  const missingElementNames: string[] = [];

  issues.forEach((issue) => {
    const missingElementName = issue.missingElementName?.trim();
    if (!missingElementName) {
      return;
    }

    const normalizedKey = missingElementName.toLowerCase();
    if (seen.has(normalizedKey)) {
      return;
    }

    seen.add(normalizedKey);
    missingElementNames.push(missingElementName);
  });

  return missingElementNames;
};

const parseNameList = (
  rawValue: string,
  key: Exclude<DeclarationLineKey, 'counters'>,
  line: number
) => {
  if (!rawValue.trim()) {
    return {
      errors: [] as ReactionTextIssue[],
      names: [] as string[],
    };
  }

  const names = rawValue.split(',').map((value) => value.trim());
  if (names.some((name) => name.length === 0)) {
    return {
      errors: [
        {
          line,
          message: `${key} contains an empty element name.`,
        },
      ],
      names: [] as string[],
    };
  }

  return {
    errors: [] as ReactionTextIssue[],
    names,
  };
};

const parseCounterItem = (
  rawItem: string,
  line: number
):
  | {
      counter: Pick<ModCounterDefinition, 'initial' | 'max' | 'min'>;
      name: string;
    }
  | {
      error: ReactionTextIssue;
    } => {
  const trimmed = rawItem.trim();
  if (!trimmed) {
    return {
      error: {
        line,
        message: 'counters contains an empty counter entry.',
      },
    };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const attributeStartIndex = tokens.findIndex((token) =>
    /^(min|max|initial)=/i.test(token)
  );
  if (attributeStartIndex <= 0) {
    return {
      error: {
        line,
        message: `Counter "${trimmed}" must include a name and initial=number.`,
      },
    };
  }

  const name = tokens.slice(0, attributeStartIndex).join(' ').trim();
  if (!name) {
    return {
      error: {
        line,
        message: `Counter "${trimmed}" must include a name and initial=number.`,
      },
    };
  }

  let initial: number | null = null;
  let min: number | undefined;
  let max: number | undefined;
  const seenAttributes = new Set<string>();

  for (const token of tokens.slice(attributeStartIndex)) {
    const match = token.match(/^(min|max|initial)=(-?\d+)$/i);
    if (!match) {
      return {
        error: {
          line,
          message: `Counter "${name}" has an invalid token "${token}".`,
        },
      };
    }

    const attributeKey = (match[1] ?? '').toLowerCase();
    if (seenAttributes.has(attributeKey)) {
      return {
        error: {
          line,
          message: `Counter "${name}" defines ${attributeKey} more than once.`,
        },
      };
    }

    seenAttributes.add(attributeKey);
    const parsedValue = parseIntegerToken(match[2] ?? '');
    if (parsedValue === null) {
      return {
        error: {
          line,
          message: `Counter "${name}" has an invalid ${attributeKey} value.`,
        },
      };
    }

    if (attributeKey === 'initial') {
      initial = parsedValue;
      continue;
    }

    if (attributeKey === 'min') {
      min = parsedValue;
      continue;
    }

    max = parsedValue;
  }

  if (initial === null) {
    return {
      error: {
        line,
        message: `Counter "${name}" must include initial=number.`,
      },
    };
  }

  return {
    counter: normalizeModCounterDefinition({
      initial,
      ...(max !== undefined ? { max } : {}),
      ...(min !== undefined ? { min } : {}),
    }),
    name,
  };
};

const clearTextDeclarationState = (draft: SaveDraftInput): SaveDraftInput => ({
  ...draft,
  counters: [],
  elements: draft.elements.map((element) => ({
    ...element,
    nonConsumable: false,
  })),
  startingElementIds: [],
});

const parseReactionTextDeclarations = (
  draft: SaveDraftInput,
  lines: string[]
) => {
  let nextDraft = clearTextDeclarationState(draft);
  const errors: ReactionTextIssue[] = [];
  const seenKeys = new Set<DeclarationLineKey>();
  const startingElementIds: string[] = [];
  const counterDefinitions: ModCounterDefinition[] = [];
  const nonConsumableElementIds = new Set<string>();
  let bodyStartIndex = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      bodyStartIndex = index + 1;
      break;
    }

    const absoluteLine = index + 1;
    const parsedLine = parseDeclarationLine(rawLine);
    if (!parsedLine) {
      if (startsWithSupportedDeclarationKeyword(rawLine)) {
        errors.push({
          line: absoluteLine,
          message:
            'Expected a declaration line: starters:, counters:, or nonconsumables:.',
        });
        continue;
      }

      bodyStartIndex = index;
      break;
    }

    const declarationKey = getSupportedDeclarationKey(parsedLine.key);
    if (!declarationKey) {
      errors.push({
        line: absoluteLine,
        message: `Unknown declaration key "${parsedLine.key}".`,
      });
      continue;
    }

    if (seenKeys.has(declarationKey)) {
      errors.push({
        line: absoluteLine,
        message: `Duplicate ${declarationKey} declaration.`,
      });
      continue;
    }
    seenKeys.add(declarationKey);

    if (declarationKey === 'starters' || declarationKey === 'nonconsumables') {
      const parsedList = parseNameList(
        parsedLine.value,
        declarationKey,
        absoluteLine
      );
      errors.push(...parsedList.errors);

      parsedList.names.forEach((name) => {
        const resolved = resolveExistingElementInDraft(nextDraft, name);
        if (!resolved.normalizedName) {
          errors.push({
            line: absoluteLine,
            message: `${declarationKey} contains an invalid element name.`,
          });
          return;
        }

        if (!resolved.elementId) {
          errors.push(
            createReactionTextMissingElementIssue(
              absoluteLine,
              resolved.normalizedName
            )
          );
          return;
        }

        if (declarationKey === 'starters') {
          if (!startingElementIds.includes(resolved.elementId)) {
            startingElementIds.push(resolved.elementId);
          }
          return;
        }

        nonConsumableElementIds.add(resolved.elementId);
      });
      continue;
    }

    if (!parsedLine.value.trim()) {
      continue;
    }

    parsedLine.value.split(',').forEach((rawItem) => {
      const parsedItem = parseCounterItem(rawItem, absoluteLine);
      if ('error' in parsedItem) {
        errors.push(parsedItem.error);
        return;
      }

      const resolved = resolveExistingElementInDraft(nextDraft, parsedItem.name);
      if (!resolved.normalizedName) {
        errors.push({
          line: absoluteLine,
          message: `Counter "${parsedItem.name}" has an invalid element name.`,
        });
        return;
      }

      if (!resolved.elementId) {
        errors.push(
          createReactionTextMissingElementIssue(
            absoluteLine,
            resolved.normalizedName
          )
        );
        return;
      }

      if (
        counterDefinitions.some(
          (counter) => counter.elementId === resolved.elementId
        )
      ) {
        errors.push({
          line: absoluteLine,
          message: `Counter "${parsedItem.name}" is declared more than once.`,
        });
        return;
      }

      counterDefinitions.push({
        elementId: resolved.elementId,
        ...parsedItem.counter,
      });
    });
  }

  return {
    bodyStartIndex,
    draft: {
      ...nextDraft,
      counters: counterDefinitions,
      elements: nextDraft.elements.map((element) => ({
        ...element,
        nonConsumable: nonConsumableElementIds.has(element.id),
      })),
      startingElementIds,
    },
    errors,
  };
};

const parseReactionBodyToDraft = (
  draft: SaveDraftInput,
  bodyLines: string[],
  bodyStartIndex: number
) => {
  let nextDraft = draft;
  const reactions: SaveDraftInput['reactions'] = [];
  const commentBlocks: ReactionCommentBlock[] = [];
  const errors: ReactionTextIssue[] = [];
  let pendingLeadingComments: string[] = [];

  for (let index = 0; index < bodyLines.length; index += 1) {
    const rawLine = bodyLines[index] ?? '';
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      continue;
    }

    const splitLine = splitReactionScriptLineComment(rawLine);
    if (!splitLine.code.trim() && splitLine.commentText !== null) {
      pendingLeadingComments.push(splitLine.commentText);
      continue;
    }

    const absoluteLine = bodyStartIndex + index + 1;
    const line = splitLine.code.trim();
    const parsedDeclarationLine = parseDeclarationLine(line);
    if (parsedDeclarationLine && getSupportedDeclarationKey(parsedDeclarationLine.key)) {
      errors.push({
        line: absoluteLine,
        message:
          'Declarations are only allowed at the top of the full text editor before the first blank line.',
      });
      continue;
    }

    const equalIndex = line.indexOf('=');
    const colonIndex = line.indexOf(':');
    const plusIndex = line.indexOf('+');
    const delimiterIndex =
      colonIndex > 0 && (equalIndex === -1 || colonIndex < equalIndex)
        ? colonIndex
        : equalIndex;
    if (delimiterIndex <= 0 || plusIndex <= 0 || plusIndex > delimiterIndex) {
      continue;
    }

    const leftName = line.slice(0, plusIndex).trim();
    const rightName = line.slice(plusIndex + 1, delimiterIndex).trim();
    const inlineResult =
      delimiterIndex === equalIndex ? line.slice(equalIndex + 1).trim() : '';
    if (!leftName || !rightName) {
      continue;
    }

    const leftResolved = resolveExistingElementInDraft(nextDraft, leftName);
    if (!leftResolved.normalizedName) {
      continue;
    }

    const rightResolved = resolveExistingElementInDraft(nextDraft, rightName);
    if (!rightResolved.normalizedName) {
      continue;
    }

    if (!leftResolved.elementId) {
      errors.push(
        createReactionTextMissingElementIssue(
          absoluteLine,
          leftResolved.normalizedName
        )
      );
    }

    if (!rightResolved.elementId) {
      errors.push(
        createReactionTextMissingElementIssue(
          absoluteLine,
          rightResolved.normalizedName
        )
      );
    }

    const outputIds: string[] = [];
    if (inlineResult) {
      inlineResult
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((outputName) => {
          const resolved = resolveExistingElementInDraft(nextDraft, outputName);
          if (!resolved.normalizedName) {
            return;
          }

          if (!resolved.elementId) {
            errors.push(
              createReactionTextMissingElementIssue(
                absoluteLine,
                resolved.normalizedName
              )
            );
            return;
          }

          outputIds.push(resolved.elementId);
        });
    }

    if (!leftResolved.elementId || !rightResolved.elementId) {
      continue;
    }

    if (inlineResult) {
      reactions.push({
        leftId: leftResolved.elementId,
        rightId: rightResolved.elementId,
        outputIds,
      });
      commentBlocks.push({
        headerComment: splitLine.commentText ?? undefined,
        leadingComments: pendingLeadingComments,
      });
      pendingLeadingComments = [];
      continue;
    }

    const scriptLines: string[] = [];
    while (index + 1 < bodyLines.length) {
      const nextLine = bodyLines[index + 1] ?? '';
      if (nextLine.startsWith('    ')) {
        scriptLines.push(nextLine.slice(4));
        index += 1;
        continue;
      }

      if (nextLine.startsWith('\t')) {
        scriptLines.push(nextLine.slice(1));
        index += 1;
        continue;
      }

      break;
    }

    const script =
      formatReactionScript(scriptLines.join('\n')) ?? scriptLines.join('\n');
    const scriptValidation = validateReactionScript(script, {
      counterNames: getDraftCounterNames(nextDraft),
      elements: nextDraft.elements.map((element) => ({
        id: element.id,
        name: element.name,
      })),
      nonGameplayElementIds: nextDraft.counters.map(
        (counter) => counter.elementId
      ),
    });

    if (!scriptValidation.ok) {
      scriptValidation.errors.forEach((error) => {
        if (!error.message.startsWith('Unknown element "')) {
          return;
        }

        const missingElementName =
          error.message.match(/^Unknown element "(.+)"\.$/)?.[1] ?? null;
        errors.push({
          line: absoluteLine + error.line,
          message: error.message,
          ...(missingElementName
            ? { missingElementName }
            : {}),
        });
      });
    }

    reactions.push({
      leftId: leftResolved.elementId,
      rightId: rightResolved.elementId,
      outputIds: [],
      script,
    });
    commentBlocks.push({
      headerComment: splitLine.commentText ?? undefined,
      leadingComments: pendingLeadingComments,
    });
    pendingLeadingComments = [];
  }

  return {
    draft: {
      ...nextDraft,
      reactionComments: {
        byReaction: commentBlocks,
        trailingComments: pendingLeadingComments,
      },
      reactions,
    },
    errors,
  };
};

export const formatReactionTextIssue = (issue: ReactionTextIssue) =>
  `Line ${issue.line}: ${issue.message}`;

export const normalizeReactionComments = (
  draft: Pick<SaveDraftInput, 'reactionComments' | 'reactions'>
): ReactionComments => {
  const byReaction = draft.reactions.map((_, index) => {
    const existing = draft.reactionComments?.byReaction[index];
    return {
      headerComment: existing?.headerComment,
      leadingComments: [...(existing?.leadingComments ?? [])],
    };
  });

  return {
    byReaction,
    trailingComments: [...(draft.reactionComments?.trailingComments ?? [])],
  };
};

export const parseReactionTextToDraft = (
  draft: SaveDraftInput,
  text: string
) : ReactionTextParseResult => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const declarationParse = parseReactionTextDeclarations(draft, lines);
  const bodyParse = parseReactionBodyToDraft(
    declarationParse.draft,
    lines.slice(declarationParse.bodyStartIndex),
    declarationParse.bodyStartIndex
  );

  return {
    draft: bodyParse.draft,
    errors: [...declarationParse.errors, ...bodyParse.errors],
    ok:
      declarationParse.errors.length === 0 &&
      bodyParse.errors.length === 0,
  };
};

export const applyReactionTextToDraft = (
  draft: SaveDraftInput,
  text: string
) => parseReactionTextToDraft(draft, text).draft;

export const formatReactionText = (draft: SaveDraftInput) => {
  const normalizedComments = normalizeReactionComments(draft);
  const reactionLines = draft.reactions.flatMap((reaction, index) => {
    const commentBlock =
      normalizedComments.byReaction[index] ?? createEmptyReactionCommentBlock();
    const left =
      draft.elements.find((element) => element.id === reaction.leftId)?.name ??
      '';
    const right =
      draft.elements.find((element) => element.id === reaction.rightId)?.name ??
      '';
    const outputs = reaction.outputIds
      .map(
        (outputId) =>
          draft.elements.find((element) => element.id === outputId)?.name ?? ''
      )
      .join(', ');
    const script = reaction.script?.trim() ?? '';
    const headerComment =
      commentBlock.headerComment !== undefined
        ? ` //${commentBlock.headerComment}`
        : '';
    const leadingCommentLines = commentBlock.leadingComments.map(
      (comment) => `//${comment}`
    );

    if (script) {
      const formattedScript = formatReactionScript(script) ?? script;
      return [
        ...leadingCommentLines,
        `${left}+${right}=${headerComment}`,
        ...formattedScript.split('\n').map((line) => `    ${line}`),
      ];
    }

    return [
      ...leadingCommentLines,
      `${left}+${right}=${outputs}${headerComment}`,
    ];
  });

  reactionLines.push(
    ...normalizedComments.trailingComments.map((comment) => `//${comment}`)
  );

  const declarationLines = [
    `starters: ${draft.startingElementIds
      .map(
        (elementId) =>
          draft.elements.find((element) => element.id === elementId)?.name ??
          elementId
      )
      .join(', ')}`,
  ];
  const counterItems = draft.counters.flatMap((counter) => {
    const counterName =
      draft.elements.find((element) => element.id === counter.elementId)?.name ??
      '';
    if (!counterName) {
      return [];
    }

    return [
      [
        counterName,
        ...(counter.min !== undefined ? [`min=${counter.min}`] : []),
        ...(counter.max !== undefined ? [`max=${counter.max}`] : []),
        `initial=${counter.initial}`,
      ].join(' '),
    ];
  });
  if (counterItems.length > 0) {
    declarationLines.push(`counters: ${counterItems.join(', ')}`);
  }

  const nonConsumableNames = draft.elements
    .filter((element) => element.nonConsumable)
    .map((element) => element.name);
  if (nonConsumableNames.length > 0) {
    declarationLines.push(`nonconsumables: ${nonConsumableNames.join(', ')}`);
  }

  const lines =
    reactionLines.length > 0
      ? [...declarationLines, '', ...reactionLines]
      : declarationLines;

  return lines.join('\n') + (lines.length > 0 ? '\n' : '');
};
