import { ELEMENT_COLORS, ELEMENT_ICONS, ELEMENT_MESSAGES, KEY_ITEMS, KEY_ITEMS_DATA } from '../data/elements';
import { RECIPES } from '../data/recipes';
import type { ActiveRuleset } from './types';

export const BASE_RULESET: ActiveRuleset = {
	kind: 'base',
	rulesetId: 'base',
	title: 'Alchemy',
	summary: 'The built-in discovery game.',
	storageScope: 'base',
	startingElements: ['air', 'fire', 'earth', 'water'],
	recipes: RECIPES,
	elementStyles: ELEMENT_COLORS,
	elementIcons: ELEMENT_ICONS,
	keyItems: KEY_ITEMS,
	keyItemData: KEY_ITEMS_DATA,
	elementMessages: ELEMENT_MESSAGES,
};
