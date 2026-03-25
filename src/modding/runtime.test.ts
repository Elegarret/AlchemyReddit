import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOD_TITLE,
  validateModDraft,
} from './runtime';

const makeElement = (id: string, name: string) => ({
  id,
  name,
  emoji: name[0] ?? '?',
  bgColorToken: 'ice',
  frameColorToken: 'ocean',
});

describe('validateModDraft', () => {
  it('requires a custom title and description', () => {
    const result = validateModDraft({
      title: DEFAULT_MOD_TITLE,
      summary: '',
      startingElementIds: ['air', 'fire'],
      elements: [makeElement('air', 'Air'), makeElement('fire', 'Fire')],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['air'],
        },
      ],
    });

    expect(result.errors).toContain('Choose a custom mod title before publishing.');
    expect(result.errors).toContain('A mod description is required.');
  });

  it('treats missing reactions as a blocking validation error', () => {
    const result = validateModDraft({
      title: 'Reactionless Realm',
      summary: 'This realm intentionally has no reactions.',
      startingElementIds: ['air', 'fire'],
      elements: [makeElement('air', 'Air'), makeElement('fire', 'Fire')],
      reactions: [],
    });

    expect(result.errors).toContain(
      'Add at least one reaction to make the mod playable.'
    );
  });

  it('reports unreachable elements by name instead of stale generated ids', () => {
    const result = validateModDraft({
      title: 'Crystal Realm',
      summary: 'A polished test realm.',
      startingElementIds: ['air', 'fire'],
      elements: [
        makeElement('air', 'Air'),
        makeElement('fire', 'Fire'),
        makeElement('element-1', 'Crystal'),
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['air'],
        },
      ],
    });

    expect(result.errors).toContain('Unreachable elements: Crystal');
    expect(result.errors.join(' ')).not.toContain('element-1');
  });
});
