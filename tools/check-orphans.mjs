import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const ELEMENTS_FILE = resolve(ROOT, 'src/data/elements.ts');
const RECIPES_FILE = resolve(ROOT, 'src/data/recipes.ts');

const STARTER_ELEMENTS = new Set(['air', 'fire', 'earth', 'water']);

const elementsSource = readFileSync(ELEMENTS_FILE, 'utf8');
const recipesSource = readFileSync(RECIPES_FILE, 'utf8');

const parseElements = (source) => {
	const sectionMatch = source.match(/export const ELEMENT_COLORS:[\s\S]*?=\s*{([\s\S]*?)^\};/m);
	if (!sectionMatch) {
		throw new Error('Could not find ELEMENT_COLORS object in elements.ts');
	}

	const section = sectionMatch[1];
	const elementNames = new Set();
	const keyRegex = /^\s*([A-Za-z0-9_-]+|'[^']+')\s*:/gm;
	let match = keyRegex.exec(section);
	while (match) {
		const raw = match[1];
		const normalized = raw.startsWith("'") ? raw.slice(1, -1) : raw;
		elementNames.add(normalized);
		match = keyRegex.exec(section);
	}

	return elementNames;
};

const parseRecipes = (source) => {
	const sectionMatch = source.match(/export const RECIPES:[\s\S]*?=\s*{([\s\S]*?)^\};/m);
	if (!sectionMatch) {
		throw new Error('Could not find RECIPES object in recipes.ts');
	}

	const section = sectionMatch[1];
	const recipes = [];
	const recipeRegex = /'([^']+)'\s*:\s*\[([^\]]*)\]/g;
	let match = recipeRegex.exec(section);

	while (match) {
		const [a, b] = match[1].split('+');
		const outputs = match[2]
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => part.replace(/^'/, '').replace(/'$/, ''));

		recipes.push({ a, b, outputs, raw: match[1] });
		match = recipeRegex.exec(section);
	}

	return recipes;
};

const elements = parseElements(elementsSource);
const recipes = parseRecipes(recipesSource);

const unknownInputs = new Set();
const unknownOutputs = new Set();

for (const recipe of recipes) {
	if (!elements.has(recipe.a)) unknownInputs.add(recipe.a);
	if (!elements.has(recipe.b)) unknownInputs.add(recipe.b);
	for (const output of recipe.outputs) {
		if (!elements.has(output)) unknownOutputs.add(output);
	}
}

const craftable = new Set(STARTER_ELEMENTS);
let changed = true;

while (changed) {
	changed = false;
	for (const recipe of recipes) {
		if (!craftable.has(recipe.a) || !craftable.has(recipe.b)) continue;
		for (const output of recipe.outputs) {
			if (!elements.has(output)) continue;
			if (craftable.has(output)) continue;
			craftable.add(output);
			changed = true;
		}
	}
}

const orphans = [...elements].filter((name) => !craftable.has(name)).sort();
const craftableSorted = [...craftable].sort();

console.log(`Starter elements: ${[...STARTER_ELEMENTS].join(', ')}`);
console.log(`Total elements: ${elements.size}`);
console.log(`Craftable elements: ${craftable.size}`);
console.log(`Orphans: ${orphans.length}`);

if (orphans.length > 0) {
	console.log('\nOrphan elements:');
	for (const orphan of orphans) {
		console.log(`- ${orphan}`);
	}
}

if (unknownInputs.size > 0 || unknownOutputs.size > 0) {
	console.log('\nInvalid recipe references:');
	if (unknownInputs.size > 0) {
		console.log(`- Unknown inputs: ${[...unknownInputs].sort().join(', ')}`);
	}
	if (unknownOutputs.size > 0) {
		console.log(`- Unknown outputs: ${[...unknownOutputs].sort().join(', ')}`);
	}
}

if (orphans.length === 0 && unknownInputs.size === 0 && unknownOutputs.size === 0) {
	console.log('\nAll elements are craftable and references are valid.');
}

console.log(`\nCraftable list: ${craftableSorted.join(', ')}`);
