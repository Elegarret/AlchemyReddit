import { PLAYTEST_RULESET_STORAGE_KEY } from '../modding/runtime';
import { type ActiveRuleset } from '../modding/types';

type PersistedRuleset = {
  kind?: ActiveRuleset['kind'];
  rulesetId: string;
  title?: string;
  summary?: string;
  intro?: string;
  storageScope: string;
  startingElements: string[];
  recipes: ActiveRuleset['recipes'];
  elementNames?: ActiveRuleset['elementNames'];
  elementStyles: ActiveRuleset['elementStyles'];
  elementIcons: ActiveRuleset['elementIcons'];
  elementEffects?: ActiveRuleset['elementEffects'];
  keyItems?: ActiveRuleset['keyItems'];
  keyItemData?: ActiveRuleset['keyItemData'];
  elementMessages?: ActiveRuleset['elementMessages'];
  sourceModId?: string;
  publishedHash?: string;
  ownerUsername?: string;
  publishedAt?: string;
};

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isRulesetRecord = (value: unknown): value is PersistedRuleset => {
  if (!isUnknownRecord(value)) {
    return false;
  }

  return (
    typeof value.rulesetId === 'string' &&
    typeof value.storageScope === 'string' &&
    Array.isArray(value.startingElements) &&
    isUnknownRecord(value.recipes) &&
    isUnknownRecord(value.elementStyles) &&
    isUnknownRecord(value.elementIcons)
  );
};

export const readPlaytestRuleset = (): ActiveRuleset | null => {
  try {
    const saved = localStorage.getItem(PLAYTEST_RULESET_STORAGE_KEY);
    if (!saved) {
      return null;
    }

    const parsed = JSON.parse(saved);
    if (!isRulesetRecord(parsed)) {
      return null;
    }

    const kind: ActiveRuleset['kind'] = parsed.kind === 'mod' ? 'mod' : 'base';

    return {
      kind,
      rulesetId: parsed.rulesetId,
      title: parsed.title ?? 'Alchemy',
      summary: parsed.summary ?? '',
      intro: parsed.intro ?? '',
      storageScope: parsed.storageScope,
      startingElements: parsed.startingElements,
      recipes: parsed.recipes,
      elementStyles: parsed.elementStyles,
      elementIcons: parsed.elementIcons,
      elementEffects: parsed.elementEffects ?? {},
      keyItems: parsed.keyItems ?? [],
      keyItemData: parsed.keyItemData ?? {},
      elementMessages: parsed.elementMessages ?? {},
      ...(parsed.elementNames ? { elementNames: parsed.elementNames } : {}),
      ...(parsed.sourceModId ? { sourceModId: parsed.sourceModId } : {}),
      ...(parsed.publishedHash ? { publishedHash: parsed.publishedHash } : {}),
      ...(parsed.ownerUsername ? { ownerUsername: parsed.ownerUsername } : {}),
      ...(parsed.publishedAt ? { publishedAt: parsed.publishedAt } : {}),
    };
  } catch {
    return null;
  }
};
