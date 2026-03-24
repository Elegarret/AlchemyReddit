import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { trpc } from './trpc';
import type { ActiveRuleset } from './modding/types';

export const ModSplash = () => {
	const [status, setStatus] = useState<'loading' | 'unavailable' | 'ready'>('loading');
	const [message, setMessage] = useState('');
	const [ruleset, setRuleset] = useState<ActiveRuleset | null>(null);

	useEffect(() => {
		trpc.init.get.query().then(response => {
			if (response.rulesetUnavailableReason) {
				setStatus('unavailable');
				setMessage(response.rulesetUnavailableReason);
				return;
			}
			setRuleset(response.activeRuleset || null);
			setStatus('ready');
		}).catch(error => {
			console.error(error);
			setStatus('unavailable');
			setMessage('Failed to load the Realm.');
		});
	}, []);

	if (status === 'loading') {
		return (
			<div className="flex min-h-screen items-center justify-center bg-table-gradient px-4 text-white">
				<div className="rounded-3xl border border-white/10 bg-white/6 px-6 py-8 text-center backdrop-blur-xl animate-pulse">
					<div className="mt-2 text-lg font-black text-cyan-200">Summoning Realm...</div>
				</div>
			</div>
		);
	}

	if (status === 'unavailable' || !ruleset) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-table-gradient px-4 text-white">
				<div className="max-w-md rounded-3xl border border-white/10 bg-white/6 p-8 text-center backdrop-blur-xl shadow-2xl">
					<div className="text-xs font-bold uppercase tracking-[0.24em] text-red-400">Realm Unavailable</div>
					<h1 className="mt-2 text-2xl font-black text-white">This custom realm cannot be loaded.</h1>
					<p className="mt-4 text-sm leading-relaxed text-white/70">{message}</p>
				</div>
			</div>
		);
	}

	const createdDate = ruleset.publishedAt ? new Date(ruleset.publishedAt).toLocaleDateString(undefined, {
		year: 'numeric', month: 'long', day: 'numeric'
	}) : 'Unknown date';

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-table-gradient relative overflow-hidden">
			{/* Decorative elements */}
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
			<div className="absolute top-1/4 left-1/4 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
			<div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

			<div className="flex flex-col items-center gap-3 mt-4 text-center px-6 w-full max-w-lg z-10">
				<div className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300 drop-shadow-md mb-2">User's Realm</div>
				<h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight drop-shadow-xl mb-1 px-4 leading-tight">{ruleset.title}</h1>
				
				{ruleset.summary && (
					<p className="text-slate-300 font-medium text-base sm:text-lg leading-relaxed mb-6 max-w-sm drop-shadow-md px-4">{ruleset.summary}</p>
				)}
				
				<div className="flex flex-col items-center gap-1 bg-black/30 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/10 w-full max-w-[280px] mb-4 shadow-xl">
					<span className="text-sm text-cyan-200 font-medium">Created by <span className="font-bold text-white drop-shadow-sm">u/{ruleset.ownerUsername || 'unknown'}</span></span>
					<span className="text-xs font-medium text-slate-400 mt-1">{createdDate}</span>
				</div>
			</div>

			<div className="mt-4 flex w-full max-w-[280px] px-4 z-10">
				<button
					className="w-full cursor-pointer rounded-full bg-gradient-to-tr from-cyan-600 to-blue-500 px-8 py-4 text-white font-black text-lg sm:text-xl shadow-[0_0_40px_-10px_rgba(6,182,212,0.6)] transition-all hover:scale-105 active:scale-95 ring-2 ring-cyan-400/30 uppercase tracking-[0.1em]"
					onClick={(e) => {
						if (ruleset.sourceModId) {
							localStorage.setItem('override-mod-id', ruleset.sourceModId);
						} else {
							localStorage.removeItem('override-mod-id');
						}
						requestExpandedMode(e.nativeEvent, 'game');
					}}
				>
					Enter The Realm
				</button>
			</div>

			<div className="absolute bottom-4 right-4 text-[10px] font-mono text-white/30 select-none tracking-wider uppercase z-10">
				Build {__BUILD_NUMBER__}
			</div>
		</div>
	);
};

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<ModSplash />
	</StrictMode>
);
