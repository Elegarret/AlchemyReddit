type ModColorDefinition = {
	bgClass: string;
	frameClass: string;
	swatchClass: string;
};

export const MOD_COLOR_TOKENS: Record<string, ModColorDefinition> = {
	ember: {
		bgClass: 'bg-orange-300',
		frameClass: 'border-orange-500',
		swatchClass: 'bg-orange-300 border-orange-500',
	},
	ocean: {
		bgClass: 'bg-sky-200',
		frameClass: 'border-sky-400',
		swatchClass: 'bg-sky-200 border-sky-400',
	},
	forest: {
		bgClass: 'bg-emerald-500',
		frameClass: 'border-emerald-700',
		swatchClass: 'bg-emerald-500 border-emerald-700',
	},
	stone: {
		bgClass: 'bg-slate-400',
		frameClass: 'border-slate-600',
		swatchClass: 'bg-slate-400 border-slate-600',
	},
	sun: {
		bgClass: 'bg-yellow-200',
		frameClass: 'border-yellow-400',
		swatchClass: 'bg-yellow-200 border-yellow-400',
	},
	royal: {
		bgClass: 'bg-indigo-400',
		frameClass: 'border-indigo-600',
		swatchClass: 'bg-indigo-400 border-indigo-600',
	},
	rose: {
		bgClass: 'bg-rose-300',
		frameClass: 'border-rose-500',
		swatchClass: 'bg-rose-300 border-rose-500',
	},
	shadow: {
		bgClass: 'bg-zinc-700',
		frameClass: 'border-zinc-900',
		swatchClass: 'bg-zinc-700 border-zinc-900',
	},
	mint: {
		bgClass: 'bg-teal-300',
		frameClass: 'border-teal-500',
		swatchClass: 'bg-teal-300 border-teal-500',
	},
	sand: {
		bgClass: 'bg-amber-200',
		frameClass: 'border-amber-400',
		swatchClass: 'bg-amber-200 border-amber-400',
	},
	plum: {
		bgClass: 'bg-fuchsia-300',
		frameClass: 'border-fuchsia-500',
		swatchClass: 'bg-fuchsia-300 border-fuchsia-500',
	},
	ice: {
		bgClass: 'bg-cyan-100',
		frameClass: 'border-cyan-300',
		swatchClass: 'bg-cyan-100 border-cyan-300',
	},
};

export const MOD_COLOR_OPTIONS = Object.entries(MOD_COLOR_TOKENS).map(([value, definition]) => ({
	value,
	label: value.charAt(0).toUpperCase() + value.slice(1),
	swatchClass: definition.swatchClass,
}));

export const DEFAULT_MOD_BG_COLOR_TOKEN = 'ocean';
export const DEFAULT_MOD_FRAME_COLOR_TOKEN = 'ocean';
export const DEFAULT_MOD_COLOR_TOKEN = DEFAULT_MOD_BG_COLOR_TOKEN;

export const getModElementClasses = (bgColorToken: string, frameColorToken: string) => {
	const background = MOD_COLOR_TOKENS[bgColorToken] ?? MOD_COLOR_TOKENS[DEFAULT_MOD_BG_COLOR_TOKEN];
	const frame = MOD_COLOR_TOKENS[frameColorToken] ?? MOD_COLOR_TOKENS[DEFAULT_MOD_FRAME_COLOR_TOKEN];

	return `${background?.bgClass ?? 'bg-sky-200'} ${frame?.frameClass ?? 'border-sky-400'}`;
};
