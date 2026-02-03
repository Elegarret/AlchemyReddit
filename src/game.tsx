import './index.css';

import { StrictMode, useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ELEMENT_COLORS, ELEMENT_ICONS } from './data/elements';
import { getRecipeResult } from './data/recipes';
import { trpc } from './trpc';

type Element = {
	id: string;
	name: string;
	x: number;
	y: number;
};

const STORAGE_KEYS = {
	DISCOVERED: 'alchemy-discovered',
	ELEMENTS: 'alchemy-table-elements',
	PAGE: 'alchemy-current-page',
};

let elementIdCounter = 0;
const createElementId = () => `el-${++elementIdCounter}`;

const ITEMS_PER_PAGE = 12;

export const App = () => {
	const [discovered, setDiscovered] = useState<string[]>(() => {
		try {
			const saved = localStorage.getItem(STORAGE_KEYS.DISCOVERED);
			return saved ? JSON.parse(saved) : ['air', 'fire', 'earth', 'water'];
		} catch {
			return ['air', 'fire', 'earth', 'water'];
		}
	});

	const [elements, setElements] = useState<Element[]>(() => {
		try {
			const saved = localStorage.getItem(STORAGE_KEYS.ELEMENTS);
			if (saved) {
				const parsed = JSON.parse(saved) as Element[];
				const maxId = parsed.reduce((max, el) => {
					const idNum = parseInt(el.id.replace('el-', ''));
					return isNaN(idNum) ? max : Math.max(max, idNum);
				}, 0);
				elementIdCounter = Math.max(elementIdCounter, maxId);
				return parsed;
			}
		} catch (e) {
			console.error('Failed to load elements', e);
		}
		return [];
	});

	const [loadingReddit, setLoadingReddit] = useState(true);
	const [syncComplete, setSyncComplete] = useState(false);

	const [dragging, setDragging] = useState<string | null>(null);
	const [reactiveIDs, setReactiveIDs] = useState<string[]>([]);
	const [shakingIDs, setShakingIDs] = useState<Record<string, boolean>>({});
	const [flash, setFlash] = useState<{ x: number, y: number, id: number } | null>(null);

	const dragOffset = useRef({ x: 0, y: 0 });
	const containerRef = useRef<HTMLDivElement>(null);
	const flashCounter = useRef(0);

	// Palette Swipe State
	const [currentPage, setCurrentPage] = useState(() => {
		try {
			const saved = localStorage.getItem(STORAGE_KEYS.PAGE);
			return saved ? parseInt(saved, 10) : 0;
		} catch {
			return 0;
		}
	});
	const [paletteTranslate, setPaletteTranslate] = useState(0);
	const isGesturingPalette = useRef<'none' | 'swiping' | 'spawning'>('none');
	const gestureStart = useRef({ x: 0, y: 0, name: '' });

	const pagesCount = Math.ceil(discovered.length / ITEMS_PER_PAGE);
	const prevPagesCount = useRef(pagesCount);

	useEffect(() => {
		if (pagesCount > prevPagesCount.current) {
			setCurrentPage(pagesCount - 1);
		}
		prevPagesCount.current = pagesCount;
	}, [pagesCount]);

	// Persistence Effects
	useEffect(() => {
		localStorage.setItem(STORAGE_KEYS.DISCOVERED, JSON.stringify(discovered));
	}, [discovered]);

	// Reddit Progress Fetch
	useEffect(() => {
		const loadRedditProgress = async () => {
			try {
				const response = await trpc.init.get.query();
				const prog = response.redditProgress;

				if (prog) {
					// 1. Merge discovered items
					if (prog.discovered.length > 0) {
						setDiscovered((prev) => {
							const combined = Array.from(new Set([...prev, ...prog.discovered]));
							return combined;
						});
					}

					// 2. Load elements (only if local is empty/defaults)
					// This prevents Device B (new) from overwriting Reddit with [] 
					// while allowing Device A (old) to keep its more complete local state
					if (prog.elements.length > 0) {
						setElements((prev) => {
							if (prev.length === 0) {
								const maxId = prog.elements.reduce((max, el) => {
									const idNum = parseInt(el.id.replace('el-', ''));
									return isNaN(idNum) ? max : Math.max(max, idNum);
								}, 0);
								elementIdCounter = Math.max(elementIdCounter, maxId);
								return prog.elements;
							}
							return prev;
						});
					}
				}
			} catch (err) {
				console.error('[Sync] Load failed:', err);
			} finally {
				// We Mark sync as complete even on error so that the user can still play
				setLoadingReddit(false);
				setSyncComplete(true);
			}
		};
		loadRedditProgress();
	}, []);

	// Reddit Progress Save (Discovery or Table changes)
	const prevDiscoveredCount = useRef(discovered.length);
	useEffect(() => {
		// CRITICAL: Never save back to reddit until we've finished the initial load/merge
		if (!syncComplete || loadingReddit) return;

		const saveToReddit = () => {
			trpc.progress.save.mutate({
				discovered,
				elements: elements.slice(-20)
			}).catch((err) => {
				console.error('[Sync] Save failed:', err);
			});
		};

		// Discovery is higher priority
		if (discovered.length > prevDiscoveredCount.current) {
			console.log('[Sync] New discovery, saving to Reddit...');
			saveToReddit();
			prevDiscoveredCount.current = discovered.length;
			return;
		}

		// Debounce table changes
		const timeout = setTimeout(() => {
			console.log('[Sync] Debounced table save to Reddit...');
			saveToReddit();
		}, 3000);

		return () => clearTimeout(timeout);
	}, [discovered, elements, syncComplete, loadingReddit]);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEYS.ELEMENTS, JSON.stringify(elements));
	}, [elements]);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEYS.PAGE, currentPage.toString());
	}, [currentPage]);

	const bringToFront = (id: string) => {
		setElements((prev) => {
			const index = prev.findIndex((el) => el.id === id);
			if (index === -1) return prev;
			const newArr = [...prev];
			const [item] = newArr.splice(index, 1);
			if (item) newArr.push(item);
			return newArr;
		});
	};

	const handlePointerDown = (e: React.PointerEvent, id: string) => {
		e.preventDefault();
		const el = elements.find((el) => el.id === id);
		if (!el) return;

		bringToFront(id);
		dragOffset.current = {
			x: e.clientX - el.x,
			y: e.clientY - el.y,
		};
		setDragging(id);
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	};

	const spawnFromPalette = (e: React.PointerEvent, name: string) => {
		const id = createElementId();
		const newElement: Element = {
			id,
			name,
			x: e.clientX,
			y: e.clientY,
		};

		setElements((prev) => [...prev, newElement]);
		setDragging(id);
		dragOffset.current = { x: 0, y: 0 };
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (dragging) {
			const newX = e.clientX - dragOffset.current.x;
			const newY = e.clientY - dragOffset.current.y;

			setElements((prev) =>
				prev.map((el) => (el.id === dragging ? { ...el, x: newX, y: newY } : el))
			);

			const draggedEl = elements.find((el) => el.id === dragging);
			if (draggedEl) {
				const MERGE_DISTANCE = 60;
				const targetEl = elements.find((el) => {
					if (el.id === dragging) return false;
					const dx = el.x - draggedEl.x;
					const dy = el.y - draggedEl.y;
					return Math.sqrt(dx * dx + dy * dy) < MERGE_DISTANCE;
				});

				if (targetEl && getRecipeResult(draggedEl.name, targetEl.name)) {
					if (!reactiveIDs.includes(draggedEl.id) || !reactiveIDs.includes(targetEl.id)) {
						setReactiveIDs([draggedEl.id, targetEl.id]);
					}
				} else if (reactiveIDs.length > 0) {
					setReactiveIDs([]);
				}
			}
		}
	};

	const handlePointerUp = (e: React.PointerEvent) => {
		if (!dragging) return;

		// Check if released over palette area (bottom 256px)
		if (e.clientX > 0 && e.clientY > window.innerHeight - 256) {
			setElements((prev) => prev.filter((el) => el.id !== dragging));
			setDragging(null);
			setReactiveIDs([]);
			return;
		}

		const draggedEl = elements.find((el) => el.id === dragging);
		if (!draggedEl) {
			setDragging(null);
			setReactiveIDs([]);
			return;
		}

		const MERGE_DISTANCE = 60;
		const targetEl = elements.find((el) => {
			if (el.id === dragging) return false;
			const dx = el.x - draggedEl.x;
			const dy = el.y - draggedEl.y;
			return Math.sqrt(dx * dx + dy * dy) < MERGE_DISTANCE;
		});

		if (targetEl) {
			const result = getRecipeResult(draggedEl.name, targetEl.name);
			if (result) {
				const midX = (draggedEl.x + targetEl.x) / 2;
				const midY = (draggedEl.y + targetEl.y) / 2;

				// Trigger Flash
				setFlash({ x: midX, y: midY, id: ++flashCounter.current });
				setTimeout(() => setFlash(null), 500);

				const filteredElements = elements.filter(
					(el) => el.id !== dragging && el.id !== targetEl.id
				);

				const newResultElements = result.map((name) => ({
					id: createElementId(),
					name,
					x: midX,
					y: midY,
				}));

				// Update discovered list
				setDiscovered((prev) => {
					let next = [...prev];
					result.forEach((name) => {
						if (!next.includes(name)) next.push(name);
					});
					return next;
				});

				// Step 1: Place at center
				setElements([...filteredElements, ...newResultElements]);

				// Step 2: Bounce away if more than one result
				if (newResultElements.length > 1) {
					setTimeout(() => {
						setElements((prev) =>
							prev.map((el) => {
								const resIdx = newResultElements.findIndex((r) => r.id === el.id);
								if (resIdx !== -1) {
									const angle = (resIdx / result.length) * Math.PI * 2;
									const dist = 50;
									return {
										...el,
										x: midX + Math.cos(angle) * dist,
										y: midY + Math.sin(angle) * dist,
									};
								}
								return el;
							})
						);
					}, 50);
				} else if (newResultElements.length === 1) {
					// Just shift by a tiny bit to trigger transition if needed or keep at center
				}
			} else {
				// 1. Trigger shake first at current position
				setShakingIDs({ [draggedEl.id]: true, [targetEl.id]: true });

				// 2. Calculate bounce vector
				const dx = draggedEl.x - targetEl.x;
				const dy = draggedEl.y - targetEl.y;
				const dist = Math.sqrt(dx * dx + dy * dy) || 1;
				const pushForce = 40;

				const moveX = (dx / dist) * pushForce;
				const moveY = (dy / dist) * pushForce;

				// 3. After shake animation (400ms), bounce away and clear shake
				setTimeout(() => {
					setElements((prev) =>
						prev.map((el) => {
							if (el.id === draggedEl.id) return { ...el, x: el.x + moveX, y: el.y + moveY };
							if (el.id === targetEl.id) return { ...el, x: el.x - moveX, y: el.y - moveY };
							return el;
						})
					);
					setShakingIDs({});
				}, 400);
			}
		}

		setDragging(null);
		setReactiveIDs([]);
	};

	// Palette Gesture Handlers
	const onPaletteDown = (e: React.PointerEvent, name?: string) => {
		gestureStart.current = { x: e.clientX, y: e.clientY, name: name || '' };
		isGesturingPalette.current = 'none';
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const onPaletteMove = (e: React.PointerEvent) => {
		if (gestureStart.current.x === 0 && gestureStart.current.y === 0) return;

		const dx = e.clientX - gestureStart.current.x;
		const dy = e.clientY - gestureStart.current.y;

		if (isGesturingPalette.current === 'none') {
			const horizontalThreshold = 15;
			const verticalThreshold = 8;

			if (dy < -verticalThreshold && Math.abs(dy) > Math.abs(dx) && gestureStart.current.name) {
				isGesturingPalette.current = 'spawning';
				spawnFromPalette(e, gestureStart.current.name);
			} else if (Math.abs(dx) > horizontalThreshold) {
				isGesturingPalette.current = 'swiping';
			}
		} else if (isGesturingPalette.current === 'swiping') {
			setPaletteTranslate(dx);
		}
	};

	const onPaletteUp = (e: React.PointerEvent) => {
		if (isGesturingPalette.current === 'swiping') {
			const dx = e.clientX - gestureStart.current.x;
			const threshold = 50;

			if (dx > threshold && currentPage > 0) {
				setCurrentPage((p) => p - 1);
			} else if (dx < -threshold && currentPage < pages.length - 1) {
				setCurrentPage((p) => p + 1);
			}
		}

		setPaletteTranslate(0);
		gestureStart.current = { x: 0, y: 0, name: '' };
		isGesturingPalette.current = 'none';
	};

	// Chunk elements into pages
	const pages = [];
	for (let i = 0; i < discovered.length; i += ITEMS_PER_PAGE) {
		pages.push(discovered.slice(i, i + ITEMS_PER_PAGE));
	}

	return (
		<div
			className="flex h-screen w-screen flex-col overflow-hidden bg-slate-900 text-white font-sans select-none touch-none"
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
		>
			{/* Worktable Area */}
			<div
				ref={containerRef}
				className="relative flex-1 bg-gradient-to-b from-slate-800 to-slate-900"
			>
				<div className="absolute left-6 top-6 pointer-events-none z-10">
					<h1 className="text-2xl font-bold tracking-tight text-white/50">Alchemy Game</h1>
					<p className="text-slate-500">Combine elements to discover new ones</p>
				</div>
			</div>

			{/* Palette Area */}
			<div className="h-60 border-t border-slate-700 bg-slate-800 flex flex-col z-10">
				<div className="pt-3 px-4 pb-1 flex items-center justify-between">
					<h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
						Palette
					</h2>
					<span className="text-[10px] text-slate-500">
						{discovered.length} Discovered • Page {currentPage + 1}/{pages.length}
					</span>
				</div>

				<div
					className="flex-1 overflow-hidden relative"
					onPointerDown={(e) => onPaletteDown(e)}
					onPointerMove={onPaletteMove}
					onPointerUp={onPaletteUp}
				>
					<div
						className={`flex h-full transition-transform duration-300 ease-out`}
						style={{
							transform: `translateX(calc(-${currentPage * 100}% + ${paletteTranslate}px))`,
							transitionProperty: isGesturingPalette.current === 'swiping' ? 'none' : 'transform'
						}}
					>
						{pages.map((page, pageIdx) => (
							<div key={pageIdx} className="min-w-full grid grid-cols-4 grid-rows-3 gap-1.5 px-4 pb-2">
								{page.map((name) => {
									const colorClass = ELEMENT_COLORS[name] ?? 'bg-gray-300 border-gray-500';
									const weightMatch = colorClass.match(/-(\d{3})/);
									const weight = weightMatch ? parseInt(weightMatch[1] || '500') : 500;
									const textColor = weight < 500 ? 'text-black/70' : 'text-white/90';
									const Icon = ELEMENT_ICONS[name];

									return (
										<div
											key={`${pageIdx}-${name}`}
											className={`relative flex flex-col h-11 items-center justify-end pb-1 rounded-lg border-2 text-[10px] font-black shadow-sm active:scale-95 select-none overflow-hidden ${colorClass} ${textColor}`}
											onPointerDown={(e) => {
												e.stopPropagation();
												onPaletteDown(e, name);
											}}
										>
											{Icon && (
												<div className={`absolute inset-x-0 top-0.5 flex justify-center opacity-30 pointer-events-none ${weight < 500 ? 'text-black' : 'text-white'}`}>
													<Icon size={24} />
												</div>
											)}
											<span className="relative z-10 px-1 text-center truncate w-full drop-shadow-sm leading-[1.1]">{name}</span>
										</div>
									);
								})}
							</div>
						))}
					</div>
				</div>

				<div className="flex justify-center gap-2 pb-3">
					{pages.map((_, i) => (
						<div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === currentPage ? 'bg-orange-500' : 'bg-slate-700'}`} />
					))}
				</div>
			</div>

			{/* Elements Layer */}
			<div className="pointer-events-none absolute inset-0 z-20">
				{elements.map((el) => {
					const isDragging = dragging === el.id;
					const isReactive = reactiveIDs.includes(el.id);
					const isShaking = shakingIDs[el.id];
					const colorClass = ELEMENT_COLORS[el.name] ?? 'bg-gray-300 border-gray-500';

					// Quick contrast fix: parse the tailwind weight (e.g., 200, 600)
					const weightMatch = colorClass.match(/-(\d{3})/);
					const weight = weightMatch ? parseInt(weightMatch[1] || '500') : 500;
					const textColor = weight < 500 ? 'text-black/70' : 'text-white/90';
					const Icon = ELEMENT_ICONS[el.name];

					return (
						<div
							key={el.id}
							className={`absolute flex flex-col h-16 w-20 ml-[-40px] mt-[-32px] cursor-grab items-center justify-end pb-1.5 rounded-lg border-2 text-[13px] font-black shadow-lg pointer-events-auto select-none touch-none transition-shadow overflow-hidden ${colorClass} ${textColor} ${isDragging ? 'z-[100] scale-110 cursor-grabbing' : 'z-50'} ${isReactive ? 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-slate-900 animate-pulse' : ''} ${isShaking ? 'animate-shake' : ''} ${!isDragging ? 'transition-[left,top,box-shadow,ring,transform] duration-300 ease-out' : ''}`}
							style={{ left: el.x, top: el.y }}
							onPointerDown={(e) => handlePointerDown(e, el.id)}
						>
							{Icon && (
								<div className={`absolute inset-x-0 top-1.5 flex justify-center opacity-30 pointer-events-none ${weight < 500 ? 'text-black' : 'text-white'}`}>
									<Icon size={36} />
								</div>
							)}
							<span className="relative z-10 px-1 text-center drop-shadow-sm leading-tight">{el.name}</span>
						</div>
					);
				})}

				{/* Success Flash Overlay */}
				{flash && (
					<div
						key={`flash-${flash.id}`}
						className="absolute w-32 h-32 ml-[-64px] mt-[-64px] rounded-full bg-white animate-flash z-[200] pointer-events-none blur-xl"
						style={{ left: flash.x, top: flash.y }}
					/>
				)}
			</div>
		</div>
	);
};

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
);
