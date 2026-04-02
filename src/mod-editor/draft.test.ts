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
      createEmptyDraft(),
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
      createEmptyDraft(),
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

  it('reports malformed declaration lines instead of silently dropping them', () => {
    const result = parseReactionTextToDraft(
      createEmptyDraft(),
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
      createEmptyDraft(),
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

  it('auto-creates declaration elements and removes counters from starters', () => {
    const result = parseReactionTextToDraft(
      createEmptyDraft(),
      [
        'starters: Air, Health, Fire',
        'counters: Health initial=10',
        'nonconsumables: Catalyst',
        '',
      ].join('\n')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.draft.startingElementIds).toEqual(['air', 'fire']);
    expect(result.draft.counters).toEqual([
      {
        elementId: 'health',
        initial: 10,
      },
    ]);
    expect(
      result.draft.elements.find((element) => element.id === 'catalyst')
        ?.nonConsumable
    ).toBe(true);
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
