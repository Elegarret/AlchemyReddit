import './index.css';

import { StrictMode, useEffect, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { trpc } from './trpc';
import type { ModListItem } from './modding/types';

export const Catalog = () => {
	const [mods, setMods] = useState<ModListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState('');
	const [allPage, setAllPage] = useState(0);
	const ALL_PAGE_SIZE = 15;

	useEffect(() => {
		const fetchMods = async () => {
			try {
				const response = await trpc.mods.listCatalog.query();
				setMods(response);
			} catch (e) {
				console.error('Failed to load mods catalog', e);
			} finally {
				setLoading(false);
			}
		};

		fetchMods();
	}, []);

	const sortedByUpvotes = useMemo(() => {
		return [...mods].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0)).slice(0, 10);
	}, [mods]);

	const sortedByRecent = useMemo(() => {
		return [...mods].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 10);
	}, [mods]);

	const allModsFiltered = useMemo(() => {
		if (!searchQuery) return mods;
		return mods.filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase()) || m.ownerUsername.toLowerCase().includes(searchQuery.toLowerCase()));
	}, [mods, searchQuery]);

	const allModsPage = useMemo(() => {
		return allModsFiltered.slice(allPage * ALL_PAGE_SIZE, (allPage + 1) * ALL_PAGE_SIZE);
	}, [allModsFiltered, allPage]);

	const totalPages = Math.ceil(allModsFiltered.length / ALL_PAGE_SIZE);

	const renderModWidget = (mod: ModListItem) => {
		const url = mod.sharePostId ? `https://www.reddit.com/comments/${mod.sharePostId.replace('t3_', '')}` : '#';
		return (
			<div key={mod.id} className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-3 flex flex-row items-center gap-3 transition-colors hover:bg-black/50 shadow-md">
				<div className="flex-1 min-w-0">
					<h3 className="font-black text-base text-white truncate drop-shadow-sm">{mod.title}</h3>
					<div className="flex items-center gap-2 mt-0.5">
						<span className="text-[10px] font-medium text-cyan-300 truncate">u/{mod.ownerUsername}</span>
						<span className="text-[10px] font-medium text-orange-400">👍 {mod.upvotes || 0}</span>
					</div>
					<p className="text-[11px] text-slate-300 leading-tight mt-1 opacity-90 line-clamp-2">
						{mod.summary || 'No description provided.'}
					</p>
				</div>
				<a
					href={url}
					target="_blank"
					className="flex-shrink-0 cursor-pointer rounded-full bg-gradient-to-br from-[#ff4500] to-[#ff6600] w-10 h-10 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 transition-transform hover:scale-105 active:scale-95"
					title="Play Mod Post"
				>
					▶
				</a>
			</div>
		);
	};

	return (
		<div className="flex min-h-screen flex-col items-center bg-table-gradient px-3 py-6 overflow-y-auto w-full">
			<div className="flex flex-col items-center gap-1 mb-6 text-center w-full max-w-2xl px-2">
				<h1 className="text-3xl font-black text-[#ff4500] tracking-tight drop-shadow-md uppercase">Users Realms</h1>
				<div className="flex gap-2 mt-2">
					<button className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-cyan-50 font-bold text-xs shadow-sm hover:bg-cyan-400/20" onClick={() => window.location.reload()}>
						Refresh Realms
					</button>
				</div>
			</div>

			<div className="w-full max-w-2xl flex flex-col gap-6 pb-12 px-2">
				{loading ? (
					<div className="text-center font-bold text-white/50 py-8 animate-pulse text-sm">Loading realms...</div>
				) : mods.length === 0 ? (
					<div className="text-center text-white/50 bg-black/20 p-6 rounded-xl border border-white/10 text-sm">No realms published yet.</div>
				) : (
					<>
						{sortedByUpvotes.length > 0 && (
							<div className="flex flex-col gap-3">
								<h2 className="text-lg font-bold text-amber-400 drop-shadow-sm px-1">💎 Best Realms</h2>
								<div className="grid grid-cols-2 gap-2 sm:gap-3">
									{sortedByUpvotes.map(renderModWidget)}
								</div>
							</div>
						)}

						{sortedByRecent.length > 0 && (
							<div className="flex flex-col gap-3">
								<h2 className="text-lg font-bold text-cyan-300 drop-shadow-sm px-1">✨ Recent Realms</h2>
								<div className="grid grid-cols-2 gap-2 sm:gap-3">
									{sortedByRecent.map(renderModWidget)}
								</div>
							</div>
						)}

						<div className="flex flex-col gap-3 mt-4 border-t border-white/10 pt-6">
							<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
								<h2 className="text-lg font-bold text-white drop-shadow-sm">🌍 All Realms</h2>
								<input 
									type="text" 
									placeholder="Search realms..." 
									value={searchQuery}
									onChange={(e) => { setSearchQuery(e.target.value); setAllPage(0); }}
									className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-cyan-400 transition-colors w-full sm:w-auto outline-none"
								/>
							</div>
							
							{allModsFiltered.length === 0 ? (
								<div className="text-center text-white/50 py-4 text-sm">No realms found matching "{searchQuery}"</div>
							) : (
								<>
									<div className="grid grid-cols-2 gap-2 sm:gap-3">
										{allModsPage.map(renderModWidget)}
									</div>
									{totalPages > 1 && (
										<div className="flex justify-center items-center gap-4 mt-4">
											<button 
												disabled={allPage === 0}
												onClick={() => setAllPage(p => p - 1)}
												className="px-4 py-1.5 rounded-lg bg-slate-800 disabled:opacity-50 text-white font-bold text-sm cursor-pointer"
											>
												Prev
											</button>
											<span className="text-slate-400 text-xs font-medium">Page {allPage + 1} of {totalPages}</span>
											<button 
												disabled={allPage === totalPages - 1}
												onClick={() => setAllPage(p => p + 1)}
												className="px-4 py-1.5 rounded-lg bg-slate-800 disabled:opacity-50 text-white font-bold text-sm cursor-pointer"
											>
												Next
											</button>
										</div>
									)}
								</>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);
};

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<Catalog />
	</StrictMode>
);
