import {
	ELEMENT_COLORS,
	ELEMENT_EFFECTS,
	ELEMENT_ICONS,
	ELEMENT_MESSAGES,
	KEY_ITEMS,
	KEY_ITEMS_DATA,
} from '../data/elements';
import { RECIPES } from '../data/recipes';
import { canonicalizeReactionMap } from './runtime';
import type { ActiveRuleset } from './types';

export const BASE_RULESET: ActiveRuleset = {
	kind: 'base',
	rulesetId: 'base',
	title: 'Alchemy',
	summary: 'The built-in discovery game.',
	intro: '',
	storageScope: 'base',
	startingElements: ['air', 'fire', 'earth', 'water'],
	startingCounterElementIds: [],
	recipes: canonicalizeReactionMap(RECIPES),
	reactionScripts: {},
	events: [],
	functions: [],
	elementStyles: ELEMENT_COLORS,
	elementIcons: ELEMENT_ICONS,
	elementEffects: ELEMENT_EFFECTS,
	keyItems: KEY_ITEMS,
	keyItemData: KEY_ITEMS_DATA,
	elementMessages: ELEMENT_MESSAGES,
	nonConsumableElementIds: [],
	counterDefinitions: [],
	counterNames: [],
	showPalette: true,
	compactElements: false,
};
