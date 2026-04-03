import { describe, expect, it } from 'vitest';
import { buildRulesetFromDraft, PLAYTEST_RULESET_STORAGE_KEY } from '../modding/runtime';
import type { ModElement } from '../modding/types';
import { readPlaytestRuleset } from './playtest';

const makeElement = (id: string, name: string): ModElement => ({
  id,
  name,
  emoji: name[0] ?? '?',
  bgColorToken: 'ice',
  frameColorToken: 'ocean',
  message: '',
  effect: 'none',
  nonConsumable: false,
});

describe('readPlaytestRuleset', () => {
  it('preserves starter counter metadata for playtest rendering', () => {
    const ruleset = buildRulesetFromDraft({
      title: 'Playtest Counter Realm',
      summary: 'Starter counter visibility should survive playtest serialization.',
      intro: '',
      startingElementIds: ['air', 'fire', 'health'],
      counters: [
        {
          elementId: 'health',
          initial: 2,
        },
      ],
      showPalette: true,
      elements: [
        makeElement('air', 'Air'),
        makeElement('fire', 'Fire'),
        makeElement('health', 'Health'),
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['air'],
        },
      ],
    });

    localStorage.setItem(PLAYTEST_RULESET_STORAGE_KEY, JSON.stringify(ruleset));
    const loaded = readPlaytestRuleset();

    expect(loaded?.startingElements).toEqual(['air', 'fire']);
    expect(loaded?.startingCounterElementIds).toEqual(['health']);

    localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
  });
});
