import { describe, expect, it } from 'vitest';
import {
  buildRulesetFromDraft,
  getRecipeResultForRuleset,
  PLAYTEST_RULESET_STORAGE_KEY,
} from '../modding/runtime';
import type { ModElement } from '../modding/types';
import { readPlaytestRuleset } from './playtest';

const makeElement = (id: string, name: string): ModElement => ({
  id,
  name,
  iconSource: 'emoji',
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

  it('canonicalizes legacy unsorted recipe keys from persisted playtest data', () => {
    localStorage.setItem(
      PLAYTEST_RULESET_STORAGE_KEY,
      JSON.stringify({
        kind: 'base',
        rulesetId: 'legacy-playtest',
        storageScope: 'legacy-playtest',
        startingElements: ['earth', 'water'],
        recipes: {
          'water+earth': ['mud'],
        },
        elementStyles: {
          earth: 'bg-amber-600 border-amber-800',
          water: 'bg-sky-200 border-sky-400',
          mud: 'bg-stone-500 border-stone-700',
        },
        elementIcons: {
          earth: 'E',
          water: 'W',
          mud: 'M',
        },
      })
    );

    const loaded = readPlaytestRuleset();

    expect(getRecipeResultForRuleset(loaded!, 'earth', 'water')).toEqual(['mud']);

    localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
  });
});
