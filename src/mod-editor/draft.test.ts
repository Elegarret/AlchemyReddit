import { describe, expect, it } from 'vitest';
import {
  applyReactionTextToDraft,
  createEmptyDraft,
  ensureElementInDraft,
  formatReactionText,
  normalizeReactionComments,
  parseReactionTextToDraft,
} from './draft';

describe('applyReactionTextToDraft', () => {
  const declarationBlock = 'starters: Air, Fire, Earth, Water\n\n';
  const createDraftWithElements = (...names: string[]) =>
    names.reduce(
      (draft, name) => ensureElementInDraft(draft, name).draft,
      createEmptyDraft()
    );

  it('seeds the editor with styled starter elements', () => {
    expect(createEmptyDraft().elements.slice(0, 4)).toEqual([
      expect.objectContaining({
        id: 'air',
        name: 'Air',
        emoji: '💨',
        bgColorToken: '#60a5fa',
        frameColorToken: '#2563eb',
      }),
      expect.objectContaining({
        id: 'fire',
        name: 'Fire',
        emoji: '🔥',
        bgColorToken: '#fdba74',
        frameColorToken: '#f97316',
      }),
      expect.objectContaining({
        id: 'earth',
        name: 'Earth',
        emoji: '⛰️',
        bgColorToken: '#d97706',
        frameColorToken: '#92400e',
      }),
      expect.objectContaining({
        id: 'water',
        name: 'Water',
        emoji: '💧',
        bgColorToken: '#bae6fd',
        frameColorToken: '#38bdf8',
      }),
    ]);
  });

  it('accepts script blocks introduced by a colon', () => {
    const draft = applyReactionTextToDraft(
      createEmptyDraft(),
      `${declarationBlock}Air+Fire:\n    add Dust\n`
    );

    expect(draft.reactions).toEqual([
      {
        leftId: 'air',
        rightId: 'fire',
        outputIds: [],
        script: 'add Dust',
      },
    ]);
  });

  it('preserves standalone and header comments through text parsing and formatting', () => {
    const draft = applyReactionTextToDraft(
      createDraftWithElements('Steam'),
      [
        'starters: Air, Fire, Earth, Water',
        '',
        '// first reaction',
        'Air+Fire=Steam // header note',
        '// tail note',
      ].join('\n')
    );

    expect(normalizeReactionComments(draft)).toEqual({
      byReaction: [
        {
          headerComment: ' header note',
          leadingComments: [' first reaction'],
        },
      ],
      trailingComments: [' tail note'],
    });
    expect(formatReactionText(draft)).toBe(
      [
        'starters: Air, Fire, Earth, Water',
        '',
        '// first reaction',
        'Air+Fire=Steam // header note',
        '// tail note',
        '',
      ].join('\n')
    );
  });

  it('keeps indented script comments inside scripted reactions', () => {
    const draft = applyReactionTextToDraft(
      createEmptyDraft(),
      [
        'starters: Air, Fire, Earth, Water',
        '',
        'Air+Fire: // header',
        '    // script note',
        '    add Dust',
      ].join('\n')
    );

    expect(draft.reactions).toEqual([
      {
        leftId: 'air',
        rightId: 'fire',
        outputIds: [],
        script: '// script note\nadd Dust',
      },
    ]);
    expect(formatReactionText(draft)).toBe(
      [
        'starters: Air, Fire, Earth, Water',
        '',
        'Air+Fire= // header',
        '    // script note',
        '    add Dust',
        '',
      ].join('\n')
    );
  });

  it('round-trips declarations into canonical text', () => {
    const result = parseReactionTextToDraft(
      createDraftWithElements('Health', 'Heat', 'Furnace', 'Catalyst', 'Steam'),
      [
        'starters: Air, Fire',
        'counters: Health max=999 initial=25, Heat initial=0 min=-5',
        'nonconsumables: Furnace, Catalyst',
        '',
        'Air+Fire=Steam',
      ].join('\n')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(formatReactionText(result.draft)).toBe(
      [
        'starters: Air, Fire',
        'counters: Health max=999 initial=25, Heat min=-5 initial=0',
        'nonconsumables: Furnace, Catalyst',
        '',
        'Air+Fire=Steam',
        '',
      ].join('\n')
    );
  });

  it('accepts reactions immediately after declarations without a blank line', () => {
    const result = parseReactionTextToDraft(
      createDraftWithElements('Health', 'Steam'),
      ['starters: Air, Fire', 'counters: Health initial=1', 'Air+Fire=Steam'].join(
        '\n'
      )
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.draft.reactions).toEqual([
      {
        leftId: 'air',
        rightId: 'fire',
        outputIds: ['steam'],
      },
    ]);
  });

  it('reports malformed declaration lines instead of silently dropping them', () => {
    const result = parseReactionTextToDraft(
      createDraftWithElements('Steam'),
      ['starters Air, Fire', '', 'Air+Fire=Steam'].join('\n')
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      {
        line: 1,
        message:
          'Expected a declaration line: starters:, counters:, or nonconsumables:.',
      },
    ]);
  });

  it('rejects declaration lines after the first blank line', () => {
    const result = parseReactionTextToDraft(
      createDraftWithElements('Steam', 'Health'),
      [
        'starters: Air, Fire',
        '',
        'counters: Health initial=1',
        'Air+Fire=Steam',
      ].join('\n')
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      {
        line: 3,
        message:
          'Declarations are only allowed at the top of the full text editor before the first blank line.',
      },
    ]);
  });

  it('reports missing declaration elements instead of auto-creating them', () => {
    const result = parseReactionTextToDraft(
      createEmptyDraft(),
      [
        'starters: Air, Health, Fire',
        'counters: Health initial=10',
        'nonconsumables: Catalyst',
        '',
      ].join('\n')
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      {
        line: 1,
        message: 'Unknown element "Health".',
        missingElementName: 'Health',
      },
      {
        line: 2,
        message: 'Unknown element "Health".',
        missingElementName: 'Health',
      },
      {
        line: 3,
        message: 'Unknown element "Catalyst".',
        missingElementName: 'Catalyst',
      },
    ]);
    expect(
      result.draft.elements.some(
        (element) =>
          element.name === 'Health' || element.name === 'Catalyst'
      )
    ).toBe(false);
  });

  it('keeps known reaction links while reporting unknown text-editor names', () => {
    const result = parseReactionTextToDraft(
      createDraftWithElements('Steam'),
      ['starters: Air, Fire', '', 'Air+Fire=Steam, Mystery'].join('\n')
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      {
        line: 3,
        message: 'Unknown element "Mystery".',
        missingElementName: 'Mystery',
      },
    ]);
    expect(result.draft.reactions).toEqual([
      {
        leftId: 'air',
        rightId: 'fire',
        outputIds: ['steam'],
      },
    ]);
  });

  it('reports every missing element on the same reaction-text line', () => {
    const result = parseReactionTextToDraft(
      createEmptyDraft(),
      ['starters: Air, Fire', '', '111+222=333'].join('\n')
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      {
        line: 3,
        message: 'Unknown element "111".',
        missingElementName: '111',
      },
      {
        line: 3,
        message: 'Unknown element "222".',
        missingElementName: '222',
      },
      {
        line: 3,
        message: 'Unknown element "333".',
        missingElementName: '333',
      },
    ]);
  });

  it('reports unknown script element names with absolute reaction-text lines', () => {
    const result = parseReactionTextToDraft(
      createEmptyDraft(),
      ['starters: Air, Fire', '', 'Air+Fire:', '    add Mystery'].join('\n')
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      {
        line: 4,
        message: 'Unknown element "Mystery".',
        missingElementName: 'Mystery',
      },
    ]);
  });

  it('sanitizes reserved syntax characters before creating new elements', () => {
    const resolved = ensureElementInDraft(createEmptyDraft(), 'Key(Shard)=');

    expect(
      resolved.draft.elements.find((element) => element.id === resolved.elementId)
    ).toMatchObject({
      name: 'KeyShard',
    });
  });

  it('strips leading scripting keywords before creating new elements', () => {
    const resolved = ensureElementInDraft(createEmptyDraft(), 'add stone');

    expect(
      resolved.draft.elements.find((element) => element.id === resolved.elementId)
    ).toMatchObject({
      name: 'stone',
    });
  });
});
