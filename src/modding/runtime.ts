import { DEFAULT_MOD_BG_COLOR_TOKEN, DEFAULT_MOD_FRAME_COLOR_TOKEN, getModElementClasses, MOD_COLOR_TOKENS } from './colors';
import type {
	ActiveRuleset,
	ModDoc,
	ModElement,
	ModReaction,
	SaveDraftInput,
	ValidationResult,
} from './types';

export const MAX_MOD_ELEMENTS = 128;
export const MAX_MOD_REACTIONS = 512;
export const MAX_REACTION_OUTPUTS = 4;
export const PLAYTEST_RULESET_STORAGE_KEY = 'alchemy-playtest-ruleset';
export const DEFAULT_MOD_TITLE = 'Unknown Realm';

export const normalizeReactionKey = (leftId: string, rightId: string) =>
	[leftId, rightId].sort((a, b) => a.localeCompare(b)).join('+');

export const createElementIdFromName = (name: string) => {
	const normalized = name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 36);

	return normalized || 'element';
};

export const createModId = () =>
	`mod-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

export const createSlug = (title: string) => {
	const normalized = title
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);

	return normalized || 'alchemy-mod';
};

export const getLocalStorageKeys = (ruleset: ActiveRuleset) => {
	if (ruleset.kind === 'base') {
		return {
			discovered: 'alchemy-discovered',
			elements: 'alchemy-table-elements',
			page: 'alchemy-current-page',
		};
	}

	const prefix = `alchemy-${ruleset.storageScope}`;
	return {
		discovered: `${prefix}-discovered`,
		elements: `${prefix}-table-elements`,
		page: `${prefix}-current-page`,
	};
};

export const getProgressScope = (ruleset: ActiveRuleset) =>
	ruleset.kind === 'base' ? 'base' : ruleset.storageScope;

export const getAllRecipeOutputs = (recipes: Record<string, string[]>) => {
	const outputs = new Set<string>();
	Object.values(recipes).forEach((recipeOutputs) => {
		recipeOutputs.forEach((output) => outputs.add(output));
	});
	return outputs;
};

export const getValidDiscoveredItems = (ruleset: ActiveRuleset, items: string[]) => {
	const allOutputs = getAllRecipeOutputs(ruleset.recipes);
	const filtered = items.filter((item) => ruleset.startingElements.includes(item) || allOutputs.has(item));
	return Array.from(new Set([...ruleset.startingElements, ...filtered]));
};

export const getRecipeResultForRuleset = (ruleset: ActiveRuleset, leftId: string, rightId: string) => {
	const key = normalizeReactionKey(leftId, rightId);
	return ruleset.recipes[key] ?? null;
};

export const getRecipesForElementInRuleset = (ruleset: ActiveRuleset, elementId: string) => {
	const matches: string[][] = [];
	for (const [key, outputs] of Object.entries(ruleset.recipes)) {
		if (!outputs.includes(elementId)) {
			continue;
		}
		matches.push(key.split('+'));
	}
	return matches;
};

export const createModFingerprint = (
	mod: Pick<
		ModDoc,
		'title' | 'summary' | 'intro' | 'startingElementIds' | 'elements' | 'reactions'
	>
) => {
	const source = JSON.stringify({
		title: mod.title,
		summary: mod.summary,
		intro: mod.intro,
		startingElementIds: mod.startingElementIds,
		elements: mod.elements,
		reactions: mod.reactions,
	});

	let hash = 2166136261;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return Math.abs(hash).toString(36).padStart(8, '0');
};

export const getReachableElementIds = (startingElementIds: string[], reactions: ModReaction[]) => {
	const reachable = new Set(startingElementIds);
	let changed = true;

	while (changed) {
		changed = false;
		for (const reaction of reactions) {
			if (!reachable.has(reaction.leftId) || !reachable.has(reaction.rightId)) {
				continue;
			}
			for (const outputId of reaction.outputIds) {
				if (reachable.has(outputId)) {
					continue;
				}
				reachable.add(outputId);
				changed = true;
			}
		}
	}

	return Array.from(reachable);
};

export const validateModDraft = (draft: {
	title: string;
	summary: string;
	intro: string;
	startingElementIds: string[];
	elements: ModElement[];
	reactions: ModReaction[];
}): ValidationResult => {
	const errors: string[] = [];
	const warnings: string[] = [];
	const title = draft.title.trim();
	const summary = draft.summary.trim();

	if (!title) {
		errors.push('A realm title is required.');
	}

	if (title.toLowerCase() === DEFAULT_MOD_TITLE.toLowerCase()) {
		errors.push('Choose a custom realm title before publishing.');
	}

	if (!summary) {
		errors.push('A realm description is required.');
	}

	if (draft.elements.length > MAX_MOD_ELEMENTS) {
		errors.push(`Too many elements. Maximum is ${MAX_MOD_ELEMENTS}.`);
	}

	if (draft.reactions.length > MAX_MOD_REACTIONS) {
		errors.push(`Too many reactions. Maximum is ${MAX_MOD_REACTIONS}.`);
	}

	if (draft.startingElementIds.length < 2 || draft.startingElementIds.length > 8) {
		errors.push('Choose between 2 and 8 starting elements.');
	}

	const elementIds = new Set<string>();
	const elementNames = new Set<string>();
	const elementNamesById = new Map<string, string>();
	for (const element of draft.elements) {
		if (elementIds.has(element.id)) {
			errors.push(`Duplicate element id: ${element.id}`);
		}
		elementIds.add(element.id);
		elementNamesById.set(element.id, element.name);

		const normalizedName = element.name.trim().toLowerCase();
		if (elementNames.has(normalizedName)) {
			errors.push(`Duplicate element name: ${element.name}`);
		}
		elementNames.add(normalizedName);

		if (!element.bgColorToken.startsWith('#') && !MOD_COLOR_TOKENS[element.bgColorToken]) {
			errors.push(`Unknown background color for ${element.name}.`);
		}

		if (!element.frameColorToken.startsWith('#') && !MOD_COLOR_TOKENS[element.frameColorToken]) {
			errors.push(`Unknown frame color for ${element.name}.`);
		}
	}

	for (const elementId of draft.startingElementIds) {
		if (!elementIds.has(elementId)) {
			errors.push(`Starting element ${elementId} does not exist.`);
		}
	}

	const describeElement = (elementId: string) =>
		elementNamesById.get(elementId) ?? elementId;

	const seenReactions = new Set<string>();
	for (const reaction of draft.reactions) {
		if (!elementIds.has(reaction.leftId) || !elementIds.has(reaction.rightId)) {
			errors.push(
				`Reaction ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)} references a missing element.`
			);
		}

		if (reaction.outputIds.length === 0) {
			errors.push(
				`Reaction ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)} has no outputs.`
			);
		}

		if (reaction.outputIds.length > MAX_REACTION_OUTPUTS) {
			errors.push(
				`Reaction ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)} has too many outputs.`
			);
		}

		for (const outputId of reaction.outputIds) {
			if (!elementIds.has(outputId)) {
				errors.push(
					`Reaction ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)} outputs missing element ${describeElement(outputId)}.`
				);
			}
		}

		const normalizedKey = normalizeReactionKey(reaction.leftId, reaction.rightId);
		if (seenReactions.has(normalizedKey)) {
			errors.push(
				`Duplicate reaction pair: ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)}`
			);
		}
		seenReactions.add(normalizedKey);
	}

	const reachableElementIds = getReachableElementIds(draft.startingElementIds, draft.reactions);
	const unreachableIds = draft.elements
		.map((element) => element.id)
		.filter((elementId) => !reachableElementIds.includes(elementId));

	if (unreachableIds.length > 0) {
		errors.push(
			`Unreachable elements: ${unreachableIds
				.slice(0, 8)
				.map(describeElement)
				.join(', ')}`
		);
	}

	if (draft.reactions.length === 0) {
		errors.push('Add at least one reaction to make the realm playable.');
	}

	return {
		isValid: errors.length === 0,
		errors,
		warnings,
		reachableElementIds,
		totalElements: draft.elements.length,
	};
};

export const buildRulesetFromMod = (mod: ModDoc): ActiveRuleset => {
  const recipes = Object.fromEntries(
    mod.reactions.map((reaction) => [normalizeReactionKey(reaction.leftId, reaction.rightId), reaction.outputIds])
  );
  const elementNames: Record<string, string> = {};
  const elementStyles: Record<string, string> = {};
  const elementIcons: Record<string, string> = {};
  const elementEffects: ActiveRuleset['elementEffects'] = {};
  const elementMessages: Record<string, string> = {};
  for (const element of mod.elements) {
    elementNames[element.id] = element.name;
    elementStyles[element.id] = getModElementClasses(
      element.bgColorToken ?? DEFAULT_MOD_BG_COLOR_TOKEN,
      element.frameColorToken ?? DEFAULT_MOD_FRAME_COLOR_TOKEN
		);
		elementIcons[element.id] = element.emoji;
		if (element.effect !== 'none') {
			elementEffects[element.id] = element.effect;
		}
		if (element.message) {
			elementMessages[element.id] = element.message;
		}
	}

  return {
    kind: 'mod',
    rulesetId: `mod:${mod.id}`,
    title: mod.title,
    summary: mod.summary,
    intro: mod.intro,
    storageScope: `mod:${mod.id}:${mod.publishedHash ?? createModFingerprint(mod)}`,
    startingElements: mod.startingElementIds,
    recipes,
    elementNames,
    elementStyles,
    elementIcons,
		elementEffects,
		keyItems: [],
		keyItemData: {},
		elementMessages,
		sourceModId: mod.id,
		ownerUsername: mod.ownerUsername,
		...(mod.publishedHash ? { publishedHash: mod.publishedHash } : {}),
		...(mod.publishedAt ? { publishedAt: mod.publishedAt } : {}),
	};
};

export const buildRulesetFromDraft = (draft: SaveDraftInput): ActiveRuleset =>
	buildRulesetFromMod({
		id: draft.id ?? 'draft',
		title: draft.title,
		summary: draft.summary,
		intro: draft.intro,
		ownerUserId: 'draft-user',
		ownerUsername: 'draft-user',
		startingElementIds: draft.startingElementIds,
		elements: draft.elements,
		reactions: draft.reactions,
		status: 'draft',
		updatedAt: new Date().toISOString(),
		publishedHash: createModFingerprint({
			title: draft.title,
			summary: draft.summary,
			intro: draft.intro,
			startingElementIds: draft.startingElementIds,
			elements: draft.elements,
			reactions: draft.reactions,
		}),
	});
