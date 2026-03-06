import fs from 'fs';
import path from 'path';

const recipesPath = path.join(process.cwd(), 'src', 'data', 'recipes.ts');
const content = fs.readFileSync(recipesPath, 'utf-8');

// Regex to find keys in the RECIPES object
// Matches 'key': or "key": or key:
const recipeRegex = /['"]([^'"]+)['"]\s*:\s*\[([^\]]*)\]/g;

const recipes = new Map();
let match;

while ((match = recipeRegex.exec(content)) !== null) {
	const key = match[1];
	const results = match[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
	recipes.set(key, results);
}

const syms = [];
const seen = new Set();

for (const [key, results] of recipes.entries()) {
	if (key.includes('+')) {
		const [a, b] = key.split('+');
		if (a === b) continue; // Skip same-element recipes

		const reverseKey = `${b}+${a}`;
		if (recipes.has(reverseKey) && !seen.has(key) && !seen.has(reverseKey)) {
			syms.push({
				forward: { key, results },
				backward: { key: reverseKey, results: recipes.get(reverseKey) }
			});
			seen.add(key);
			seen.add(reverseKey);
		}
	}
}

if (syms.length === 0) {
	console.log("No symmetrical variants found.");
} else {
	console.log(`Found ${syms.length} symmetrical variants:\n`);
	syms.forEach(pair => {
		console.log(`${pair.forward.key} -> [${pair.forward.results.join(', ')}]`);
		console.log(`${pair.backward.key} -> [${pair.backward.results.join(', ')}]`);
		console.log('---');
	});
}
