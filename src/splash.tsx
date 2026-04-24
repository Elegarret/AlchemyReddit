import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ELEMENT_COLORS } from './data/elements';
import {
	getInlineViewCacheKey,
	isUnknownRecord,
	readInlineViewCache,
	writeInlineViewCache,
} from './inline-view-cache';
import { PLAYTEST_RULESET_STORAGE_KEY } from './modding/runtime';
import { trpc } from './trpc';

const STORAGE_KEY = 'alchemy-discovered';
type SplashProgress = {
	discovered: number;
	total: number;
};

const isSplashProgress = (value: unknown): value is SplashProgress => {
	if (!isUnknownRecord(value)) {
		return false;
	}

	return (
		typeof Reflect.get(value, 'discovered') === 'number' &&
		typeof Reflect.get(value, 'total') === 'number'
	);
};

const getSplashProgressCacheKey = () => getInlineViewCacheKey('splash-progress');

const readCachedSplashProgress = () =>
	readInlineViewCache(getSplashProgressCacheKey(), (value) =>
		isSplashProgress(value) ? value : null
	);

export const Splash = () => {
	const [progress, setProgress] = useState<SplashProgress | null>(() =>
		readCachedSplashProgress()
	);

	useEffect(() => {
		const totalItems = Object.keys(ELEMENT_COLORS).length;
		let isDisposed = false;
		let isRemoteLoadInFlight = false;

		const updateProgress = (next: SplashProgress) => {
			if (isDisposed) {
				return;
			}

			writeInlineViewCache(getSplashProgressCacheKey(), next);
			setProgress((current) =>
				current?.discovered === next.discovered && current.total === next.total ? current : next
			);
		};

		// 1. Immediately show local storage data
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const discoveredItems = JSON.parse(saved) as string[];
				if (discoveredItems.length > 0) {
					updateProgress({ discovered: discoveredItems.length, total: totalItems });
				}
			}
		} catch (e) {
			console.error('Failed to load local progress', e);
		}

		// 2. Then update with Reddit progress if greater
		const loadRemoteProgress = async () => {
			if (isRemoteLoadInFlight) {
				return;
			}

			isRemoteLoadInFlight = true;

			try {
				const response = await trpc.init.get.query();
				if (isDisposed || !response.redditDiscovered || response.redditDiscovered.length === 0) {
					return;
				}

				setProgress((prev) => {
					const localCount = prev?.discovered ?? 0;
					if (response.redditDiscovered.length > localCount) {
						const next = { discovered: response.redditDiscovered.length, total: totalItems };
						writeInlineViewCache(getSplashProgressCacheKey(), next);
						return next;
					}
					return prev;
				});
			} catch (e) {
				console.error('Failed to load remote progress', e);
			} finally {
				isRemoteLoadInFlight = false;
			}
		};

		const handleFocus = () => {
			void loadRemoteProgress();
		};

		void loadRemoteProgress();
		window.addEventListener('focus', handleFocus);

		return () => {
			isDisposed = true;
			window.removeEventListener('focus', handleFocus);
		};
	}, []);

	return (
		<div className="realm-page flex h-screen flex-col items-center justify-center gap-5 overflow-hidden px-4 py-4">
			<div className="splash-orbit-compact relative mt-4 flex h-56 w-56 items-center justify-center">
				<div className="splash-orbit-scene absolute inset-0">
					<div
						className="splash-orbit-plane splash-orbit-plane-x"
					>
						<div
							className="splash-orbit-ring splash-orbit-ring-inner splash-orbit-spin-forward"
						>
							{[
								{
									backgroundClassName: 'bg-blue-400 border-blue-600 ring-[var(--ring-offset)]/50',
									emoji: '☁️',
								},
								{
									backgroundClassName: 'bg-orange-300 border-orange-500 ring-[var(--ring-offset)]/50',
									emoji: '🔥',
								},
							].map((item, index) => (
								<div
									key={item.emoji}
									className="splash-orbit-slot"
									style={{
										transform: `translate(-50%, -50%) rotate(${index * 180}deg) translateX(56px)`,
									}}
								>
									<div className="splash-orbit-face splash-orbit-face-plane-x">
										<div
											className="splash-orbit-face-angle"
											style={{ transform: `rotate(${-index * 180}deg)` }}
										>
											<div className="splash-orbit-face-spin-forward">
												<div
													className={`splash-orbit-element flex h-10 w-10 items-center justify-center rounded-lg border-2 text-xl shadow-lg ring-3 sm:h-11 sm:w-11 sm:text-2xl ${item.backgroundClassName}`}
												>
													{item.emoji}
												</div>
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
					<div
						className="splash-orbit-plane splash-orbit-plane-y"
					>
						<div
							className="splash-orbit-ring splash-orbit-ring-outer splash-orbit-spin-reverse"
						>
							{[
								{
									backgroundClassName: 'bg-sky-200 border-sky-400 ring-[var(--ring-offset)]/50',
									emoji: '💧',
								},
								{
									backgroundClassName: 'bg-stone-500 border-stone-700 ring-[var(--ring-offset)]/50',
									emoji: '⛰️',
								},
							].map((item, index) => (
								<div
									key={item.emoji}
									className="splash-orbit-slot"
									style={{
										transform: `translate(-50%, -50%) rotate(${index * 180}deg) translateX(78px)`,
									}}
								>
									<div className="splash-orbit-face splash-orbit-face-plane-y">
										<div
											className="splash-orbit-face-angle"
											style={{ transform: `rotate(${-index * 180}deg)` }}
										>
											<div className="splash-orbit-face-spin-reverse">
												<div
													className={`splash-orbit-element flex h-10 w-10 items-center justify-center rounded-lg border-2 text-xl shadow-lg ring-3 sm:h-11 sm:w-11 sm:text-2xl ${item.backgroundClassName}`}
												>
													{item.emoji}
												</div>
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="absolute inset-0 z-10 flex items-center justify-center">
					<div className="absolute h-28 w-28 rounded-full mercury-glow blur-2xl" />
					<div className="realm-title-backdrop relative flex flex-col items-center gap-1 rounded-[1.75rem] px-5 py-3 shadow-xl">
						<span className="text-3xl leading-none mercury-symbol">☿</span>
						<h1 className="catalog-title-font text-3xl font-black tracking-tight text-primary drop-shadow-md">
							Alchemy
						</h1>
					</div>
				</div>
			</div>

			<div className="mt-2 flex flex-col items-center gap-2 text-center">
				<p className="catalog-body-font realm-text-soft px-4 text-base font-medium leading-relaxed">
					Combine elements to discover the world!
				</p>
				{progress && (
					<div className="realm-panel-soft mt-2 rounded-full px-4 py-1.5 backdrop-blur-sm">
						<span className="catalog-title-font text-sm font-bold realm-text-ink">Progress: {progress.discovered}/{progress.total}</span>
					</div>
				)}
			</div>

			<div className="mt-4 flex w-full max-w-sm flex-col gap-3">
				<button
					className="realm-button-accent catalog-title-font flex min-h-16 w-full items-center justify-center whitespace-nowrap rounded-full px-8 py-4 text-base font-bold shadow-xl transition-all hover:scale-105 active:scale-95 sm:text-lg animate-pulsate"
					onClick={(e) => {
						localStorage.removeItem('override-mod-id');
						localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
						requestExpandedMode(e.nativeEvent, 'game');
					}}
				>
					{progress ? 'Continue discovery' : 'Play Now'}
				</button>
				<button
					className="realm-button-muted catalog-title-font cursor-pointer rounded-full px-10 py-3 text-sm font-bold tracking-[0.14em] uppercase transition-all hover:scale-[1.02] active:scale-[0.98]"
					onClick={(e) => {
						localStorage.removeItem('override-mod-id');
						localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
						requestExpandedMode(e.nativeEvent, 'mod-catalog');
					}}
				>
					Alchemy Hub
				</button>
			</div>

			<div className="realm-text-muted pointer-events-none absolute bottom-0 right-3 text-[8px] leading-none font-mono select-none tracking-[0.2em] uppercase">
				Build {__BUILD_NUMBER__}
			</div>
		</div>
	);
};

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<Splash />
	</StrictMode>
);
