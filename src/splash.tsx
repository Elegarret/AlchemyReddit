import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ELEMENT_COLORS } from './data/elements';
import { trpc } from './trpc';

const STORAGE_KEY = 'alchemy-discovered';

export const Splash = () => {
	const [progress, setProgress] = useState<{ discovered: number; total: number } | null>(null);

	useEffect(() => {
		const totalItems = Object.keys(ELEMENT_COLORS).length;

		// 1. Immediately show local storage data
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const discoveredItems = JSON.parse(saved) as string[];
				if (discoveredItems.length > 0) {
					setProgress({ discovered: discoveredItems.length, total: totalItems });
				}
			}
		} catch (e) {
			console.error('Failed to load local progress', e);
		}

		// 2. Then update with Reddit progress if greater
		const loadRemoteProgress = async () => {
			try {
				const response = await trpc.init.get.query();
				if (response.redditDiscovered && response.redditDiscovered.length > 0) {
					setProgress((prev) => {
						const localCount = prev?.discovered ?? 0;
						if (response.redditDiscovered!.length > localCount) {
							return { discovered: response.redditDiscovered!.length, total: totalItems };
						}
						return prev;
					});
				}
			} catch (e) {
				console.error('Failed to load remote progress', e);
			}
		};

		loadRemoteProgress();
	}, []);

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-table-gradient">
			<div className="relative w-48 h-48 mt-4 flex items-center justify-center">
				{/* Orbiting elements */}
				<div className="absolute flex flex-col items-center animate-orbit" style={{ animationDelay: '0s' }}>
					<div className="w-14 h-14 rounded-xl bg-blue-400 border-2 border-blue-600 flex items-center justify-center text-3xl shadow-lg ring-4 ring-[var(--ring-offset)]/50">☁️</div>
				</div>
				<div className="absolute flex flex-col items-center animate-orbit" style={{ animationDelay: '-3.75s' }}>
					<div className="w-14 h-14 rounded-xl bg-orange-300 border-2 border-orange-500 flex items-center justify-center text-3xl shadow-lg ring-4 ring-[var(--ring-offset)]/50">🔥</div>
				</div>
				<div className="absolute flex flex-col items-center animate-orbit" style={{ animationDelay: '-7.5s' }}>
					<div className="w-14 h-14 rounded-xl bg-sky-200 border-2 border-sky-400 flex items-center justify-center text-3xl shadow-lg ring-4 ring-[var(--ring-offset)]/50">💧</div>
				</div>
				<div className="absolute flex flex-col items-center animate-orbit" style={{ animationDelay: '-11.25s' }}>
					<div className="w-14 h-14 rounded-xl bg-stone-500 border-2 border-stone-700 flex items-center justify-center text-3xl shadow-lg ring-4 ring-[var(--ring-offset)]/50">⛰️</div>
				</div>

				{/* Centered Mercury Symbol with Glow */}
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="absolute w-24 h-24 mercury-glow blur-2xl rounded-full" />
					<span className="text-6xl mercury-symbol">☿</span>
				</div>
			</div>

			<div className="flex flex-col items-center gap-2 mt-4 text-center">
				<h1 className="text-4xl font-black text-primary tracking-tight drop-shadow-md">Alchemy</h1>
				<p className="text-secondary font-medium px-4">Combine elements to discover the world!</p>
				{progress && (
					<div className="mt-2 px-4 py-1.5 bg-black/20 backdrop-blur-sm rounded-full border border-white/10">
						<span className="text-sm font-bold text-orange-400">Progress: {progress.discovered}/{progress.total}</span>
					</div>
				)}
			</div>

			<button
				className="mt-6 cursor-pointer rounded-full bg-[#ff4500] px-10 py-4 text-white font-bold text-lg shadow-xl transition-all hover:scale-105 active:scale-95 hover:bg-[#ff5500] ring-4 ring-orange-500/20 animate-pulsate"
				onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
			>
				{progress ? 'Continue discovery' : 'Play Now'}
			</button>
		</div>
	);
};

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<Splash />
	</StrictMode>
);
