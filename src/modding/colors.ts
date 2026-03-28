type ModColorDefinition = {
	bgColor: string;
	frameColor: string;
};

export const MOD_COLOR_TOKENS: Record<string, ModColorDefinition> = {
	ember: {
		bgColor: '#fdba74',
		frameColor: '#eab308',
	},
	ocean: {
		bgColor: '#bae6fd',
		frameColor: '#1d4ed8',
	},
	forest: {
		bgColor: '#10b981',
		frameColor: '#84cc16',
	},
	stone: {
		bgColor: '#94a3b8',
		frameColor: '#64748b',
	},
	sun: {
		bgColor: '#fef08a',
		frameColor: '#FA4015',
	},
	royal: {
		bgColor: '#818cf8',
		frameColor: '#8b5cf6',
	},
	rose: {
		bgColor: '#fda4af',
		frameColor: '#ec4899',
	},
	shadow: {
		bgColor: '#3f3f46',
		frameColor: '#09090b',
	},
	mint: {
		bgColor: '#5eead4',
		frameColor: '#10b981',
	},
	sand: {
		bgColor: '#fde68a',
		frameColor: '#fb923c',
	},
	plum: {
		bgColor: '#f0abfc',
		frameColor: '#f472b6',
	},
	ice: {
		bgColor: '#cffafe',
		frameColor: '#38bdf8',
	},
};

export const MOD_COLOR_OPTIONS = Object.entries(MOD_COLOR_TOKENS).map(
	([value, definition]) => ({
		value,
		label: value.charAt(0).toUpperCase() + value.slice(1),
		bgColor: definition.bgColor,
		frameColor: definition.frameColor,
	})
);

export const DEFAULT_MOD_BG_COLOR_TOKEN = 'ocean';
export const DEFAULT_MOD_FRAME_COLOR_TOKEN = 'ocean';
export const DEFAULT_MOD_COLOR_TOKEN = DEFAULT_MOD_BG_COLOR_TOKEN;

export const resolveModBgColor = (bgColorToken: string) =>
	bgColorToken.startsWith('#')
		? bgColorToken
		: (MOD_COLOR_TOKENS[bgColorToken]?.bgColor ??
			MOD_COLOR_TOKENS[DEFAULT_MOD_BG_COLOR_TOKEN]!.bgColor);

export const resolveModFrameColor = (frameColorToken: string) =>
	frameColorToken.startsWith('#')
		? frameColorToken
		: (MOD_COLOR_TOKENS[frameColorToken]?.frameColor ??
			MOD_COLOR_TOKENS[DEFAULT_MOD_FRAME_COLOR_TOKEN]!.frameColor);

export const resolveModElementColors = (
	bgColorToken: string,
	frameColorToken: string
) => ({
	bgColor: resolveModBgColor(bgColorToken),
	frameColor: resolveModFrameColor(frameColorToken),
});

export const getModElementClasses = (
	bgColorToken: string,
	frameColorToken: string
) => {
	const { bgColor, frameColor } = resolveModElementColors(
		bgColorToken,
		frameColorToken
	);

	return `bg-[${bgColor}] border-[${frameColor}]`;
};
