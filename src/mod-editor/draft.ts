import {
  DEFAULT_MOD_BG_COLOR_TOKEN,
  DEFAULT_MOD_FRAME_COLOR_TOKEN,
} from '../modding/colors';
import {
  DEFAULT_MOD_TITLE,
  createElementIdFromName,
} from '../modding/runtime';
import { formatReactionScript } from '../modding/reaction-script';
import {
  MAX_REALM_SUMMARY_LENGTH,
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
  const trimmed = rawName.trim();
  if (!trimmed) {
    return {
      draft,
      elementId: draft.elements[0]?.id ?? '',
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

export const applyReactionTextToDraft = (
  draft: SaveDraftInput,
  text: string
) => {
  let nextDraft = draft;
  const reactions: SaveDraftInput['reactions'] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (!line) {
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

    const leftResolved = ensureElementInDraft(nextDraft, leftName);
    nextDraft = leftResolved.draft;

    const rightResolved = ensureElementInDraft(nextDraft, rightName);
    nextDraft = rightResolved.draft;

    if (inlineResult) {
      const outputIds: string[] = [];
      inlineResult
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((outputName) => {
          const resolved = ensureElementInDraft(nextDraft, outputName);
          nextDraft = resolved.draft;
          outputIds.push(resolved.elementId);
        });

      reactions.push({
        leftId: leftResolved.elementId,
        rightId: rightResolved.elementId,
        outputIds,
      });
      continue;
    }

    const scriptLines: string[] = [];
    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1] ?? '';
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

    reactions.push({
      leftId: leftResolved.elementId,
      rightId: rightResolved.elementId,
      outputIds: [],
      script: formatReactionScript(scriptLines.join('\n')) ?? scriptLines.join('\n'),
    });
  }

  return {
    ...nextDraft,
    reactions,
  };
};

export const formatReactionText = (draft: SaveDraftInput) => {
  const lines = draft.reactions.map((reaction) => {
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

    if (script) {
      const formattedScript = formatReactionScript(script) ?? script;
      return [
        `${left}+${right}=`,
        ...formattedScript.split('\n').map((line) => `    ${line}`),
      ].join('\n');
    }

    return `${left}+${right}=${outputs}`;
  });

  return lines.join('\n') + (lines.length > 0 ? '\n' : '');
};
