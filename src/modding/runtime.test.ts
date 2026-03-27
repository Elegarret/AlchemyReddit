import { describe, expect, it } from 'vitest';
import {
  buildRulesetFromDraft,
  DEFAULT_MOD_TITLE,
  validateModDraft,
} from './runtime';
import type { ModElement } from './types';

const makeElement = (id: string, name: string): ModElement => ({
  id,
  name,
  emoji: name[0] ?? '?',
  bgColorToken: 'ice',
  frameColorToken: 'ocean',
  message: '',
  effect: 'none',
});

describe('validateModDraft', () => {
  it('requires a custom title and description', () => {
    const result = validateModDraft({
      title: DEFAULT_MOD_TITLE,
      summary: '',
      intro: '',
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

    expect(result.errors).toContain(
      'Choose a custom realm title before publishing.'
    );
    expect(result.errors).toContain('A realm description is required.');
  });

  it('treats missing reactions as a blocking validation error', () => {
    const result = validateModDraft({
      title: 'Reactionless Realm',
      summary: 'This realm intentionally has no reactions.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      elements: [makeElement('air', 'Air'), makeElement('fire', 'Fire')],
      reactions: [],
    });

    expect(result.errors).toContain(
      'Add at least one reaction to make the realm playable.'
    );
  });

  it('reports unreachable elements by name instead of stale generated ids', () => {
    const result = validateModDraft({
      title: 'Crystal Realm',
      summary: 'A polished test realm.',
      intro: '',
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

  it('includes intro, messages, and effects in the built ruleset', () => {
    const result = buildRulesetFromDraft({
      title: 'Signal Realm',
      summary: 'A realm with custom element metadata.',
      intro: 'Read this before your first reaction.',
      startingElementIds: ['air', 'light'],
      elements: [
        makeElement('air', 'Air'),
        {
          ...makeElement('light', 'Lantern'),
          message: 'This element glows with intent.',
          effect: 'light',
        },
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'light',
          outputIds: ['light'],
        },
      ],
    });

    expect(result.intro).toBe('Read this before your first reaction.');
    expect(result.elementMessages.light).toBe('This element glows with intent.');
    expect(result.elementEffects.light).toBe('light');
  });
});
