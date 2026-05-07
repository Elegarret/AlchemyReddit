import { DEFAULT_MOD_BG_COLOR_TOKEN, DEFAULT_MOD_FRAME_COLOR_TOKEN, getModElementClasses, MOD_COLOR_TOKENS } from './colors';
import {
	executeReactionScript,
	parseReactionScriptConditionList,
	hasReactionScript,
	validateReactionScriptConditions,
	validateReactionScriptFunctionDefinitions,
	validateReactionScript,
	type ReactionScriptPopupEvent,
	type ReactionScriptEventState,
	type ReactionScriptIssue,
	type ReactionScriptTableElement,
} from './reaction-script';
import type {
	ActiveRuleset,
	ModDoc,
	ModCounterDefinition,
	ModElement,
	ModEvent,
	ModFunction,
	ModReaction,
	SaveDraftInput,
	ValidationResult,
} from './types';
import { getModElementActiveIconValue, MAX_MOD_ELEMENTS, MAX_MOD_REACTIONS } from './types';

export const MAX_REACTION_OUTPUTS = 8;
export const PLAYTEST_RULESET_STORAGE_KEY = 'alchemy-playtest-ruleset';
export const DEFAULT_MOD_TITLE = 'Unknown Realm';
const RESERVED_ELEMENT_NAME_CHARACTER_PATTERN = /[+,=:()"\r\n\t]/;
const RESERVED_ELEMENT_NAME_CHARACTER_PATTERN_GLOBAL = /[+,=:()"\r\n\t]/g;
const RESERVED_ELEMENT_NAME_PREFIX_KEYWORDS = [
	'add',
	'remove',
	'remove_all',
	'set',
	'message',
	'popup',
	'win',
	'lose',
	'stop',
	'if',
	'on_table',
	'not_on_table',
	'discovered',
	'not_discovered',
	'count',
	'and',
	'emit',
	'undiscovered',
] as const;

const clampToOptionalBounds = (
	value: number,
	min?: number,
	max?: number
) => {
	let nextValue = value;

	if (min !== undefined) {
		nextValue = Math.max(nextValue, min);
	}

	if (max !== undefined) {
		nextValue = Math.min(nextValue, max);
	}

	return nextValue;
};

const normalizeName = (value: string) =>
	value.trim().toLowerCase().replace(/\s+/g, ' ');

export const normalizeReactionKey = (leftId: string, rightId: string) =>
	[leftId, rightId].sort((a, b) => a.localeCompare(b)).join('+');

export const canonicalizeReactionMap = <TValue>(reactionMap: Record<string, TValue>) =>
	Object.fromEntries(
		Object.entries(reactionMap).map(([key, value]) => {
			const [leftId = '', rightId = ''] = key.split('+');
			return [normalizeReactionKey(leftId, rightId), value];
		})
	);

export const sanitizeElementName = (name: string) =>
	name.replace(RESERVED_ELEMENT_NAME_CHARACTER_PATTERN_GLOBAL, '');

export const hasReservedElementNameCharacters = (name: string) =>
	RESERVED_ELEMENT_NAME_CHARACTER_PATTERN.test(name);

const getReservedElementNamePrefix = (name: string) => {
	const trimmed = name.trim();
	if (!trimmed) {
		return null;
	}

	const firstWord = trimmed.split(/\s+/, 1)[0]?.toLowerCase() ?? '';
	return RESERVED_ELEMENT_NAME_PREFIX_KEYWORDS.includes(
		firstWord as (typeof RESERVED_ELEMENT_NAME_PREFIX_KEYWORDS)[number]
	)
		? firstWord
		: null;
};

export const normalizeAuthoredElementName = (name: string) => {
	let normalized = sanitizeElementName(name).trim().replace(/\s+/g, ' ');
	let reservedPrefix = getReservedElementNamePrefix(normalized);
	while (reservedPrefix) {
		normalized = normalized.slice(reservedPrefix.length).trimStart();
		reservedPrefix = getReservedElementNamePrefix(normalized);
	}

	return normalized;
};

export const getElementNameValidationError = (name: string) => {
	if (hasReservedElementNameCharacters(name)) {
		return `Element ${name} contains reserved syntax characters in its name.`;
	}

	const reservedPrefix = getReservedElementNamePrefix(name);
	if (reservedPrefix) {
		return `Element ${name} starts with reserved scripting keyword "${reservedPrefix}".`;
	}

	return null;
};

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
			counters: 'alchemy-counters',
			counterVisibility: 'alchemy-counter-visibility',
			discovered: 'alchemy-discovered',
			elements: 'alchemy-table-elements',
			events: 'alchemy-events',
			page: 'alchemy-current-page',
		};
	}

	const prefix = `alchemy-${ruleset.storageScope}`;
	return {
		counters: `${prefix}-counters`,
		counterVisibility: `${prefix}-counter-visibility`,
		discovered: `${prefix}-discovered`,
		elements: `${prefix}-table-elements`,
		events: `${prefix}-events`,
		page: `${prefix}-current-page`,
	};
};

export const getProgressScope = (ruleset: ActiveRuleset) =>
	ruleset.kind === 'base' ? 'base' : ruleset.storageScope;

const getRulesetScriptElements = (ruleset: ActiveRuleset) =>
	Object.keys(ruleset.elementStyles).map((id) => ({
		id,
		...(ruleset.elementNames?.[id] ? { name: ruleset.elementNames[id] } : {}),
	}));

const getRulesetCounterElementIds = (ruleset: ActiveRuleset) =>
	ruleset.counterDefinitions.map((counter) => counter.elementId);

const buildCounterDefinitions = (
	counters: ModCounterDefinition[],
	elementNamesById: Record<string, string>
): ActiveRuleset['counterDefinitions'] =>
	counters.flatMap((counter) => {
		const name = elementNamesById[counter.elementId];
		return name
			? [
					{
						...counter,
						name,
					},
				]
			: [];
	});

export const getRulesetStartingCounterNames = (ruleset: ActiveRuleset) => {
	const startingCounterIds = new Set(ruleset.startingCounterElementIds);
	return ruleset.counterDefinitions.flatMap((counter) =>
		startingCounterIds.has(counter.elementId) ? [counter.name] : []
	);
};

export const getRulesetCounterValues = (
	ruleset: ActiveRuleset,
	persistedValues: Record<string, number> = {}
) => {
	const persistedEntries = Object.entries(persistedValues);
	const values: Record<string, number> = {};

	ruleset.counterDefinitions.forEach((counter) => {
		const persistedEntry = persistedEntries.find(
			([key]) => normalizeName(key) === normalizeName(counter.name)
		);
		const persistedValue = persistedEntry?.[1];
		values[counter.name] = clampToOptionalBounds(
			typeof persistedValue === 'number' ? persistedValue : counter.initial,
			counter.min,
			counter.max
		);
	});

	return values;
};

const getReactionEmittedOutputs = (
	reaction: ModReaction,
	elements: ModElement[],
	counterNames: string[],
	counterElementIds: string[] = [],
	functions: ModFunction[] = []
) => {
	if (!hasReactionScript(reaction.script)) {
		return reaction.outputIds;
	}

	const validation = validateReactionScript(reaction.script ?? '', {
		counterNames,
		elements: elements.map((element) => ({
			id: element.id,
			name: element.name,
		})),
		functions,
		nonGameplayElementIds: counterElementIds,
	});

	return validation.ok ? validation.emittedElementIds : [];
};

export const getAllRecipeOutputs = (ruleset: ActiveRuleset) => {
	const outputs = new Set<string>();
	Object.values(ruleset.recipes).forEach((recipeOutputs) => {
		recipeOutputs.forEach((output) => outputs.add(output));
	});

	Object.values(ruleset.reactionScripts).forEach((script) => {
		const validation = validateReactionScript(script, {
			counterNames: ruleset.counterNames,
			elements: getRulesetScriptElements(ruleset),
			functions: ruleset.functions ?? [],
			nonGameplayElementIds: getRulesetCounterElementIds(ruleset),
		});
		if (!validation.ok) {
			return;
		}

		validation.emittedElementIds.forEach((output) => outputs.add(output));
	});

	ruleset.events.forEach((event) => {
		const validation = validateReactionScript(event.script, {
			counterNames: ruleset.counterNames,
			elements: getRulesetScriptElements(ruleset),
			functions: ruleset.functions ?? [],
			nonGameplayElementIds: getRulesetCounterElementIds(ruleset),
			scriptKind: 'event',
		});
		if (!validation.ok) {
			return;
		}

		validation.emittedElementIds.forEach((output) => outputs.add(output));
	});

	return outputs;
};

export const getValidDiscoveredItems = (ruleset: ActiveRuleset, items: string[]) => {
	const allOutputs = getAllRecipeOutputs(ruleset);
	const filtered = items.filter((item) => ruleset.startingElements.includes(item) || allOutputs.has(item));
	return Array.from(new Set([...ruleset.startingElements, ...filtered]));
};

export const getRecipeResultForRuleset = (ruleset: ActiveRuleset, leftId: string, rightId: string) => {
	const key = normalizeReactionKey(leftId, rightId);
	const outputs = ruleset.recipes[key];
	return outputs && outputs.length > 0 ? outputs : null;
};

export const getReactionScriptForRuleset = (
	ruleset: ActiveRuleset,
	leftId: string,
	rightId: string
) => {
	const key = normalizeReactionKey(leftId, rightId);
	return ruleset.reactionScripts[key] ?? null;
};

export const hasReactionForRuleset = (
	ruleset: ActiveRuleset,
	leftId: string,
	rightId: string
) => {
	const key = normalizeReactionKey(leftId, rightId);
	return ruleset.recipes[key] !== undefined || ruleset.reactionScripts[key] !== undefined;
};

export type ResolvedReactionResult = {
	counterValues: Record<string, number>;
	emittedElementIds: string[];
	eventState?: ReactionScriptEventState;
	hiddenCounterNames: string[];
	messages: string[];
	popupEvents: ReactionScriptPopupEvent[];
	removedTableElementIds: string[];
	shownCounterNames: string[];
	stopped: boolean;
	usedScript: boolean;
};

const filterSingleCopyNonConsumableOutputs = (params: {
	currentTableElements: ReactionScriptTableElement[];
	emittedElementIds: string[];
	removedTableElementIds: string[];
	ruleset: ActiveRuleset;
}) => {
	const {
		currentTableElements,
		emittedElementIds,
		removedTableElementIds,
		ruleset,
	} = params;
	const nonConsumableElementIds = new Set(ruleset.nonConsumableElementIds);
	if (nonConsumableElementIds.size === 0 || emittedElementIds.length === 0) {
		return emittedElementIds;
	}

	const removedTableElementIdSet = new Set(removedTableElementIds);
	const survivingNonConsumableIds = new Set(
		currentTableElements
			.filter(
				(tableElement) =>
					nonConsumableElementIds.has(tableElement.elementId) &&
					!removedTableElementIdSet.has(tableElement.id)
			)
			.map((tableElement) => tableElement.elementId)
	);

	return emittedElementIds.filter((elementId) => {
		if (!nonConsumableElementIds.has(elementId)) {
			return true;
		}

		if (survivingNonConsumableIds.has(elementId)) {
			return false;
		}

		survivingNonConsumableIds.add(elementId);
		return true;
	});
};

export const resolveReactionForRuleset = (params: {
	counterValues: Record<string, number>;
	currentTableElements: ReactionScriptTableElement[];
	discoveredElementIds: string[];
	eventState?: ReactionScriptEventState;
	leftId: string;
	rightId: string;
	ruleset: ActiveRuleset;
}):
	| {
			ok: true;
			result: ResolvedReactionResult;
	  }
	| {
			errors: ReactionScriptIssue[];
			ok: false;
	  }
	| null => {
	const { counterValues, currentTableElements, discoveredElementIds, eventState, leftId, rightId, ruleset } = params;
	const key = normalizeReactionKey(leftId, rightId);
	const script = ruleset.reactionScripts[key];
	if (script !== undefined) {
		const execution = executeReactionScript({
			counterNames: ruleset.counterNames,
			counters: counterValues,
			counterDefinitions: ruleset.counterDefinitions,
			discoveredElementIds,
			elements: getRulesetScriptElements(ruleset),
			events: ruleset.events,
			eventState,
			functions: ruleset.functions ?? [],
			nonGameplayElementIds: getRulesetCounterElementIds(ruleset),
			nonConsumableElementIds: ruleset.nonConsumableElementIds,
			script,
			tableElements: currentTableElements,
		});
		if (!execution.ok) {
			return {
				errors: execution.errors,
				ok: false,
			};
		}

		return {
			ok: true,
			result: {
				...execution.result,
				emittedElementIds: filterSingleCopyNonConsumableOutputs({
					currentTableElements,
					emittedElementIds: execution.result.emittedElementIds,
					removedTableElementIds: execution.result.removedTableElementIds,
					ruleset,
				}),
				usedScript: true,
			},
		};
	}

	const outputs = ruleset.recipes[key];
	if (!outputs || outputs.length === 0) {
		return null;
	}

	return {
		ok: true,
		result: {
			counterValues,
			emittedElementIds: filterSingleCopyNonConsumableOutputs({
				currentTableElements,
				emittedElementIds: outputs,
				removedTableElementIds: [],
				ruleset,
			}),
			hiddenCounterNames: [],
			messages: [],
			popupEvents: [],
			removedTableElementIds: [],
			shownCounterNames: [],
			stopped: false,
			usedScript: false,
		},
	};
};

export const getAutoRemovedReactionElementIds = (params: {
	draggedTableElementId: string;
	leftId: string;
	rightId: string;
	ruleset: ActiveRuleset;
	targetTableElementId: string;
}) => {
	const {
		draggedTableElementId,
		leftId,
		rightId,
		ruleset,
		targetTableElementId,
	} = params;
	const nonConsumableElementIds = new Set(ruleset.nonConsumableElementIds);
	const removedTableElementIds: string[] = [];

	if (!nonConsumableElementIds.has(leftId)) {
		removedTableElementIds.push(draggedTableElementId);
	}

	if (!nonConsumableElementIds.has(rightId)) {
		removedTableElementIds.push(targetTableElementId);
	}

	return removedTableElementIds;
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
		| 'title'
		| 'summary'
		| 'coverImageUrl'
		| 'intro'
		| 'startingElementIds'
		| 'counters'
		| 'showPalette'
		| 'compactElements'
		| 'elements'
		| 'reactions'
		| 'events'
		| 'functions'
	>
) => {
	const source = JSON.stringify({
		title: mod.title,
		summary: mod.summary,
		...(mod.coverImageUrl ? { coverImageUrl: mod.coverImageUrl } : {}),
		intro: mod.intro,
		startingElementIds: mod.startingElementIds,
		counters: mod.counters,
		showPalette: mod.showPalette,
		compactElements: mod.compactElements ?? false,
		elements: mod.elements,
		reactions: mod.reactions,
		events: mod.events ?? [],
		functions: mod.functions ?? [],
	});

	let hash = 2166136261;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return Math.abs(hash).toString(36).padStart(8, '0');
};

export const getReachableElementIds = (
	startingElementIds: string[],
	reactions: ModReaction[],
	elements: ModElement[],
	counterNames: string[] = [],
	counterElementIds: string[] = [],
	events: ModEvent[] = [],
	functions: ModFunction[] = []
) => {
	const reachable = new Set(startingElementIds);
	let changed = true;

	while (changed) {
		changed = false;
		for (const reaction of reactions) {
			if (!reachable.has(reaction.leftId) || !reachable.has(reaction.rightId)) {
				continue;
			}
			for (const outputId of getReactionEmittedOutputs(
				reaction,
				elements,
				counterNames,
				counterElementIds,
				functions
			)) {
				if (reachable.has(outputId)) {
					continue;
				}
				reachable.add(outputId);
				changed = true;
			}
		}

		for (const event of events) {
			const validation = validateReactionScript(event.script, {
				counterNames,
				elements,
				functions,
				nonGameplayElementIds: counterElementIds,
				scriptKind: 'event',
			});
			if (!validation.ok) {
				continue;
			}

			for (const outputId of validation.emittedElementIds) {
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

const formatReactionScriptValidationMessage = (message: string) => {
	if (message === 'If conditions cannot be empty.') {
		return 'If() conditions cannot be empty.';
	}

	return message;
};

export const validateModDraft = (draft: {
	title: string;
	summary: string;
	intro: string;
	startingElementIds: string[];
	counters: ModCounterDefinition[];
	events?: ModEvent[];
	functions?: ModFunction[];
	showPalette: boolean;
	elements: ModElement[];
	reactions: ModReaction[];
}): ValidationResult => {
	const errors: string[] = [];
	const scriptErrors: string[] = [];
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

	const elementIds = new Set<string>();
	const elementNames = new Set<string>();
	const elementNamesById = new Map<string, string>();
	for (const element of draft.elements) {
		if (elementIds.has(element.id)) {
			errors.push(`Duplicate element id: ${element.id}`);
		}
		elementIds.add(element.id);
		elementNamesById.set(element.id, element.name);

		const elementNameValidationError = getElementNameValidationError(element.name);
		if (elementNameValidationError) {
			errors.push(elementNameValidationError);
		}

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

	const counterIds = new Set<string>();
	const counterNames: string[] = [];
	for (const counter of draft.counters) {
		if (counterIds.has(counter.elementId)) {
			errors.push(`Duplicate counter: ${describeElement(counter.elementId)}.`);
			continue;
		}

		if (!elementIds.has(counter.elementId)) {
			errors.push(`Counter ${counter.elementId} does not exist.`);
			continue;
		}

		counterIds.add(counter.elementId);
		counterNames.push(describeElement(counter.elementId));
	}

	const gameplayStartingElementIds = draft.startingElementIds.filter(
		(elementId) => !counterIds.has(elementId)
	);
	if (
		gameplayStartingElementIds.length < 2 ||
		gameplayStartingElementIds.length > 8
	) {
		errors.push('Choose between 2 and 8 starting elements.');
	}

	const seenReactions = new Set<string>();
	for (const reaction of draft.reactions) {
		const usesScript = hasReactionScript(reaction.script);

		if (!elementIds.has(reaction.leftId) || !elementIds.has(reaction.rightId)) {
			errors.push(
				`Reaction ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)} references a missing element.`
			);
		}

		if (counterIds.has(reaction.leftId) || counterIds.has(reaction.rightId)) {
			errors.push(
				`Reaction ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)} cannot use counters as ingredients.`
			);
		}

		if (!usesScript && reaction.outputIds.length === 0) {
			errors.push(
				`Reaction ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)} has no outputs.`
			);
		}

		if (reaction.outputIds.length > MAX_REACTION_OUTPUTS) {
			warnings.push(
				`Reaction ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)} has too many outputs. Max output length must be ${MAX_REACTION_OUTPUTS} elements.`
			);
		}

		for (const outputId of reaction.outputIds) {
			if (!elementIds.has(outputId)) {
				errors.push(
					`Reaction ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)} outputs missing element ${describeElement(outputId)}.`
				);
			} else if (counterIds.has(outputId)) {
				errors.push(
					`Reaction ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)} cannot output counter ${describeElement(outputId)} as a normal element.`
				);
			}
		}

		if (usesScript) {
			const scriptValidation = validateReactionScript(reaction.script ?? '', {
				counterNames,
				elements: draft.elements.map((element) => ({
					id: element.id,
					name: element.name,
				})),
				functions: draft.functions ?? [],
				nonGameplayElementIds: Array.from(counterIds),
			});
			scriptValidation.errors.forEach((error) => {
				scriptErrors.push(
					`"${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)}" script line ${error.line}: ${formatReactionScriptValidationMessage(error.message)}`
				);
			});
		}

		const normalizedKey = normalizeReactionKey(reaction.leftId, reaction.rightId);
		if (seenReactions.has(normalizedKey)) {
			errors.push(
				`Duplicate reaction pair: ${describeElement(reaction.leftId)} + ${describeElement(reaction.rightId)}`
			);
		}
		seenReactions.add(normalizedKey);
	}

	(draft.events ?? []).forEach((event, eventIndex) => {
		const parsedConditions = parseReactionScriptConditionList(
			event.condition,
			1
		);
		if (!parsedConditions.ok) {
			parsedConditions.errors.forEach((error) => {
				scriptErrors.push(
					`Event ${eventIndex + 1} condition: ${formatReactionScriptValidationMessage(error.message)}`
				);
			});
		} else {
			const conditionValidation = validateReactionScriptConditions(
				parsedConditions.conditions,
				{
					counterNames,
					elements: draft.elements.map((element) => ({
						id: element.id,
						name: element.name,
					})),
					functions: draft.functions ?? [],
					nonGameplayElementIds: Array.from(counterIds),
					scriptKind: 'event',
				},
				{
					counterOnly: true,
				}
			);
			conditionValidation.errors.forEach((error) => {
				scriptErrors.push(
					`Event ${eventIndex + 1} condition: ${formatReactionScriptValidationMessage(error.message)}`
				);
			});
		}

		const eventValidation = validateReactionScript(event.script, {
			counterNames,
			elements: draft.elements.map((element) => ({
				id: element.id,
				name: element.name,
			})),
			functions: draft.functions ?? [],
			nonGameplayElementIds: Array.from(counterIds),
			scriptKind: 'event',
		});
		eventValidation.errors.forEach((error) => {
			scriptErrors.push(
				`Event ${eventIndex + 1} script line ${error.line}: ${formatReactionScriptValidationMessage(error.message)}`
			);
		});
	});

	const functionDefinitionValidation = validateReactionScriptFunctionDefinitions(
		draft.functions ?? []
	);
	functionDefinitionValidation.errors.forEach((error) => {
		scriptErrors.push(
			`Function ${error.line}: ${formatReactionScriptValidationMessage(error.message)}`
		);
	});

	(draft.functions ?? []).forEach((scriptFunction, functionIndex) => {
		const functionValidation = validateReactionScript(scriptFunction.script, {
			counterNames,
			elements: draft.elements.map((element) => ({
				id: element.id,
				name: element.name,
			})),
			functions: draft.functions ?? [],
			nonGameplayElementIds: Array.from(counterIds),
		});
		functionValidation.errors.forEach((error) => {
			scriptErrors.push(
				`Function ${functionIndex + 1} "${scriptFunction.name}" script line ${error.line}: ${formatReactionScriptValidationMessage(error.message)}`
			);
		});
	});

	const reachableElementIds =
		scriptErrors.length === 0
			? getReachableElementIds(
					gameplayStartingElementIds,
					draft.reactions,
					draft.elements,
					counterNames,
					Array.from(counterIds),
					draft.events ?? [],
					draft.functions ?? []
				)
			: gameplayStartingElementIds.filter(
					(elementId) => elementIds.has(elementId) && !counterIds.has(elementId)
				);
	const unreachableIds =
		scriptErrors.length === 0
			? draft.elements
					.map((element) => element.id)
					.filter(
						(elementId) =>
							!counterIds.has(elementId) &&
							!reachableElementIds.includes(elementId)
					)
			: [];

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
		isValid: errors.length === 0 && scriptErrors.length === 0,
		errors,
		scriptErrors,
		warnings,
		reachableElementIds,
		totalElements: draft.elements.filter((element) => !counterIds.has(element.id))
			.length,
	};
};

export const buildRulesetFromMod = (mod: ModDoc): ActiveRuleset => {
	const recipes = canonicalizeReactionMap(
		Object.fromEntries(
			mod.reactions.map((reaction) => [
				normalizeReactionKey(reaction.leftId, reaction.rightId),
				reaction.outputIds,
			])
		)
	);
	const reactionScripts = canonicalizeReactionMap(
		Object.fromEntries(
			mod.reactions
				.filter((reaction) => hasReactionScript(reaction.script))
				.map((reaction) => [
					normalizeReactionKey(reaction.leftId, reaction.rightId),
					reaction.script?.trim() ?? '',
				])
		)
	);
	const elementNames: Record<string, string> = {};
	const elementStyles: Record<string, string> = {};
	const elementIcons: Record<string, string> = {};
	const elementEffects: ActiveRuleset['elementEffects'] = {};
	const elementMessages: Record<string, string> = {};
	const nonConsumableElementIds: string[] = [];
	for (const element of mod.elements) {
		elementNames[element.id] = element.name;
		elementStyles[element.id] = getModElementClasses(
			element.bgColorToken ?? DEFAULT_MOD_BG_COLOR_TOKEN,
			element.frameColorToken ?? DEFAULT_MOD_FRAME_COLOR_TOKEN
		);
		const iconValue = getModElementActiveIconValue(element);
		if (iconValue) {
			elementIcons[element.id] = iconValue;
		}
		if (element.effect !== 'none') {
			elementEffects[element.id] = element.effect;
		}
		if (element.message) {
			elementMessages[element.id] = element.message;
		}
		if (element.nonConsumable) {
			nonConsumableElementIds.push(element.id);
		}
	}
	const counterDefinitions = buildCounterDefinitions(mod.counters, elementNames);
	const counterElementIds = new Set(
		counterDefinitions.map((counter) => counter.elementId)
	);
	const startingCounterElementIds = mod.startingElementIds.filter((elementId) =>
		counterElementIds.has(elementId)
	);
	const startingElements = mod.startingElementIds.filter(
		(elementId) => !counterElementIds.has(elementId)
	);

	return {
		kind: 'mod',
		rulesetId: `mod:${mod.id}`,
		title: mod.title,
		summary: mod.summary,
		...(mod.coverImageUrl ? { coverImageUrl: mod.coverImageUrl } : {}),
		intro: mod.intro,
		storageScope: `mod:${mod.id}:${mod.publishedHash ?? createModFingerprint(mod)}`,
		startingElements,
		startingCounterElementIds,
		recipes,
		reactionScripts,
		events: mod.events ?? [],
		functions: mod.functions ?? [],
		elementNames,
		elementStyles,
		elementIcons,
		elementEffects,
		keyItems: [],
		keyItemData: {},
		elementMessages,
		nonConsumableElementIds,
		counterDefinitions,
		counterNames: counterDefinitions.map((counter) => counter.name),
		showPalette: mod.showPalette,
		compactElements: mod.compactElements ?? false,
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
		...(draft.coverImageUrl ? { coverImageUrl: draft.coverImageUrl } : {}),
		intro: draft.intro,
		ownerUserId: 'draft-user',
		ownerUsername: 'draft-user',
		startingElementIds: draft.startingElementIds,
		counters: draft.counters,
		showPalette: draft.showPalette,
		compactElements: draft.compactElements ?? false,
		elements: draft.elements,
		reactions: draft.reactions,
		events: draft.events ?? [],
		functions: draft.functions ?? [],
		status: 'draft',
		updatedAt: new Date().toISOString(),
		publishedHash: createModFingerprint({
			title: draft.title,
			summary: draft.summary,
			...(draft.coverImageUrl ? { coverImageUrl: draft.coverImageUrl } : {}),
			intro: draft.intro,
			startingElementIds: draft.startingElementIds,
			counters: draft.counters,
			showPalette: draft.showPalette,
			compactElements: draft.compactElements ?? false,
			elements: draft.elements,
			reactions: draft.reactions,
			events: draft.events ?? [],
			functions: draft.functions ?? [],
		}),
	});
