import {
	GiWhirlwind,
	GiFlame,
	GiMountainCave,
	GiWaterDrop,
	GiSteam,
	GiElectric,
	GiDustCloud,
	GiLava,
	GiSwamp,
	GiWineGlass,
	GiStoneBlock,
	GiSandsOfTime,
	GiMetalBar
} from 'react-icons/gi';

export const ELEMENT_COLORS: Record<string, string> = {
	air: 'bg-sky-200 border-sky-400',
	fire: 'bg-orange-300 border-orange-500',
	earth: 'bg-amber-600 border-amber-800',
	water: 'bg-blue-400 border-blue-600',
	steam: 'bg-gray-200 border-gray-400',
	energy: 'bg-yellow-300 border-yellow-500',
	dust: 'bg-stone-300 border-stone-500',
	lava: 'bg-red-500 border-red-700',
	swamp: 'bg-green-700 border-green-900',
	alcohol: 'bg-purple-300 border-purple-500',
	stone: 'bg-slate-400 border-slate-600',
	sand: 'bg-yellow-200 border-yellow-400',
	metal: 'bg-zinc-400 border-zinc-600',
};

export const ELEMENT_ICONS: Record<string, any> = {
	air: GiWhirlwind,
	fire: GiFlame,
	earth: GiMountainCave,
	water: GiWaterDrop,
	steam: GiSteam,
	energy: GiElectric,
	dust: GiDustCloud,
	lava: GiLava,
	swamp: GiSwamp,
	alcohol: GiWineGlass,
	stone: GiStoneBlock,
	sand: GiSandsOfTime,
	metal: GiMetalBar,
};
