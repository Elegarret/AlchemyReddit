export const RECIPES: Record<string, string[]> = {
	'water+air': ['steam'],
	'air+fire': ['energy'],
	'air+earth': ['dust'],
	'earth+fire': ['lava'],
	'water+earth': ['swamp'],
	'water+fire': ['alcohol'],
	'water+lava': ['steam', 'stone'],
	'air+stone': ['sand'],
	'water+stone': ['sand'],
	'stone+fire': ['metal'],
};

export const getRecipeResult = (a: string, b: string): string[] | null => {
	const key1 = `${a}+${b}`;
	const key2 = `${b}+${a}`;
	return RECIPES[key1] ?? RECIPES[key2] ?? null;
};
