import './index.css';

import { StrictMode, useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ELEMENT_COLORS, ELEMENT_ICONS, KEY_ITEMS, KEY_ITEMS_DATA, ELEMENT_MESSAGES } from './data/elements';
import { getRecipeResult, RECIPES } from './data/recipes';
import { IoSettingsSharp, IoCloseSharp, IoSearchSharp } from 'react-icons/io5';
import { trpc } from './trpc';

type Element = {
	id: string;
	name: string;
	x: number;
	y: number;
	icon?: any;
	hint?: string;
};

// No longer needed, icons moved to elements.ts

const STORAGE_KEYS = {
	DISCOVERED: 'alchemy-discovered',
	ELEMENTS: 'alchemy-table-elements',
	PAGE: 'alchemy-current-page',
};

let elementIdCounter = 0;
const createElementId = () => `el-${++elementIdCounter}`;

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
	const [layoutCols, setLayoutCols] = useState(6);

	useEffect(() => {
		const handleResize = () => {
			const width = window.innerWidth;
			// px-4 is 16px. Total horizontal padding is 32px.
			// Gap is 1.5 (6px).
			// We want minimum item width to be around 80-90px.
			const availableWidth = width - 32;
			const cols = Math.floor(availableWidth / 64);
			setLayoutCols(Math.max(5, cols)); // Start with at least 5 columns (mobile)
		};

		handleResize();
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	const [dragging, setDragging] = useState<string | null>(null);
	const [reactiveIDs, setReactiveIDs] = useState<string[]>([]);
	const [shakingIDs, setShakingIDs] = useState<Record<string, boolean>>({});
	const [flash, setFlash] = useState<{ x: number, y: number, id: number } | null>(null);
	const [explodingIDs, setExplodingIDs] = useState<Record<string, boolean>>({});
	const [pushedElements, setPushedElements] = useState<Record<string, { x: number, y: number }>>({});
	const [showOptions, setShowOptions] = useState(false);
	const [username, setUsername] = useState<string | null>(null);
	const [discoveryPopup, setDiscoveryPopup] = useState<string | null>(null);
	const [confirmWipe, setConfirmWipe] = useState(false);
	const [infoPopup, setInfoPopup] = useState<string | null>(null);
	const [filterQuery, setFilterQuery] = useState('');
	const [showMobileFilter, setShowMobileFilter] = useState(false);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.altKey || e.metaKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

			if (e.key === 'Escape' || e.key === 'Backspace') {
				setFilterQuery('');
				return;
			}

			if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
				setFilterQuery(e.key.toLowerCase());
				setCurrentPage(0);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

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

	const itemsPerPage = layoutCols * 3;
	const pagesCount = Math.ceil(discovered.length / itemsPerPage);
	const prevPagesCount = useRef(pagesCount);
	const prevDiscoveredLen = useRef(discovered.length);

	useEffect(() => {
		// Only jump to new page if we actually discovered something new
		if (pagesCount > prevPagesCount.current && discovered.length > prevDiscoveredLen.current) {
			setCurrentPage(pagesCount - 1);
		}
		// If resize caused page count to drop and we are out of bounds, fix it
		if (currentPage >= pagesCount && pagesCount > 0) {
			setCurrentPage(pagesCount - 1);
		}

		prevPagesCount.current = pagesCount;
		prevDiscoveredLen.current = discovered.length;
	}, [pagesCount, discovered.length, currentPage]);

	// Persistence Effects
	useEffect(() => {
		localStorage.setItem(STORAGE_KEYS.DISCOVERED, JSON.stringify(discovered));
	}, [discovered]);

	// Reddit Progress Fetch
	useEffect(() => {
		const loadRedditProgress = async () => {
			try {
				const response = await trpc.init.get.query();
				const remoteDiscovered = response.redditDiscovered;

				if (remoteDiscovered && remoteDiscovered.length > 0) {
					setDiscovered((prev) => {
						const combined = Array.from(new Set([...prev, ...remoteDiscovered]));
						return combined;
					});
				}
				if (response.username) {
					setUsername(response.username);
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

	// Reddit Progress Save (Discovery only)
	const prevDiscoveredCount = useRef(discovered.length);
	useEffect(() => {
		// CRITICAL: Never save back to reddit until we've finished the initial load/merge
		if (!syncComplete || loadingReddit) return;

		// Only save to reddit if we have more items than before
		if (discovered.length > prevDiscoveredCount.current) {
			console.log('[Sync] New discovery, saving to Reddit...');
			trpc.progress.save.mutate(discovered).catch((err) => {
				console.error('[Sync] Save failed:', err);
			});
			prevDiscoveredCount.current = discovered.length;
		}
	}, [discovered, syncComplete, loadingReddit]);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEYS.ELEMENTS, JSON.stringify(elements));
	}, [elements]);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEYS.PAGE, currentPage.toString());
	}, [currentPage]);

	// Explosion Effect Logic
	useEffect(() => {
		const explodeEl = elements.find(el => el.name === 'explode' && !explodingIDs[el.id]);
		if (explodeEl) {
			const currentExplodeId = explodeEl.id;
			setExplodingIDs(prev => ({ ...prev, [currentExplodeId]: true }));

			// Start explosion sequence after shake
			setTimeout(() => {
				// Flash at the explosion site
				setFlash({ x: explodeEl.x, y: explodeEl.y, id: ++flashCounter.current });

				setElements(currentElements => {
					// Calculate push vectors for ALL elements currently on table
					const pushData: Record<string, { x: number, y: number }> = {};
					currentElements.forEach(el => {
						if (el.id === currentExplodeId) return;
						const dx = el.x - explodeEl.x;
						const dy = el.y - explodeEl.y;
						const dist = Math.sqrt(dx * dx + dy * dy) || 1;
						const force = 1000;
						pushData[el.id] = {
							x: (dx / dist) * force,
							y: (dy / dist) * force
						};
					});
					setPushedElements(pushData);
					return [...currentElements]; // Return new array to ensure re-render
				});

				// Final cleanup: remove everything after animation
				setTimeout(() => {
					setElements([]);
					setExplodingIDs({});
					setPushedElements({});
					setFlash(null);
				}, 500);
			}, 1500);
		}
	}, [elements, explodingIDs]);

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

	const getRandomTableIcon = (name: string) => {
		const rawIcon = ELEMENT_ICONS[name];
		if (!Array.isArray(rawIcon)) return undefined;
		if (rawIcon.length <= 1) return rawIcon[0];
		// Pick a random icon starting from index 1
		return rawIcon[1 + Math.floor(Math.random() * (rawIcon.length - 1))];
	};

	const getRandomHint = (currentDiscovered: string[] = discovered) => {
		const possible: string[] = [];
		for (const [key, outputs] of Object.entries(RECIPES)) {
			const [a, b] = key.split('+');
			if (a && b && currentDiscovered.includes(a) && currentDiscovered.includes(b)) {
				for (const out of outputs) {
					if (!currentDiscovered.includes(out) && !possible.includes(out)) {
						possible.push(out);
					}
				}
			}
		}
		if (possible.length === 0) return undefined;
		return possible[Math.floor(Math.random() * possible.length)];
	};

	const closeHint = (id: string) => {
		setElements((prev) =>
			prev.map((el) => {
				if (el.id === id) {
					const { hint, ...rest } = el;
					return rest;
				}
				return el;
			})
		);
	};

	const spawnFromPalette = (e: React.PointerEvent, name: string) => {
		const id = createElementId();
		const icon = getRandomTableIcon(name);
		const hint = name === 'scientist' ? (getRandomHint() ?? 'nothing') : undefined;

		const newElement: Element = {
			id,
			name,
			x: e.clientX,
			y: e.clientY,
			icon,
			...(hint ? { hint } : {}),
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

				// Prepare next discovery state to correctly generate hints
				let nextDiscovered = [...discovered];
				let newlyDiscoveredKeyItem = null;
				let newlyDiscoveredInfoItem = null;
				result.forEach((name) => {
					if (!nextDiscovered.includes(name)) {
						nextDiscovered.push(name);
						if (KEY_ITEMS.includes(name)) {
							newlyDiscoveredKeyItem = name;
						} else if (ELEMENT_MESSAGES[name]) {
							newlyDiscoveredInfoItem = name;
						}
					}
				});

				// Recalculate hints for ALL existing scientists on the table given the new discoveries
				const updatedFilteredElements = filteredElements.map(el => {
					if (el.name === 'scientist') {
						return {
							...el,
							hint: getRandomHint(nextDiscovered) ?? 'nothing'
						};
					}
					return el;
				});

				const newResultElements = result.map((name) => {
					const icon = getRandomTableIcon(name);
					const hint = name === 'scientist' ? (getRandomHint(nextDiscovered) ?? 'nothing') : undefined;
					return {
						id: createElementId(),
						name,
						x: midX,
						y: midY,
						icon,
						...(hint ? { hint } : {}),
					};
				});

				// Update discovered list
				if (nextDiscovered.length > discovered.length) {
					setDiscovered(nextDiscovered);
					if (newlyDiscoveredKeyItem) {
						setDiscoveryPopup(newlyDiscoveredKeyItem);
					} else if (newlyDiscoveredInfoItem) {
						setInfoPopup(newlyDiscoveredInfoItem);
					}
				}

				// Step 1: Place at center
				setElements([...updatedFilteredElements, ...newResultElements]);

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

			// If only one page, lock swiping and make any drag spawn the element
			if (pages.length <= 1) {
				if ((Math.abs(dx) > 5 || Math.abs(dy) > 5) && gestureStart.current.name) {
					isGesturingPalette.current = 'spawning';
					spawnFromPalette(e, gestureStart.current.name);
				}
				return;
			}

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
	const filteredDiscovered = filterQuery
		? discovered.filter((name) => name.toLowerCase().startsWith(filterQuery))
		: discovered;

	const pages: string[][] = [];
	for (let i = 0; i < filteredDiscovered.length; i += itemsPerPage) {
		pages.push(filteredDiscovered.slice(i, i + itemsPerPage));
	}
	if (pages.length === 0 && filterQuery) {
		pages.push([]);
	}

	const nextKeyItem = KEY_ITEMS.find((item) => !discovered.includes(item));
	const totalElementsCount = Object.keys(ELEMENT_COLORS).length;


	return (
		<div
			className="flex h-screen w-screen flex-col overflow-hidden bg-main text-primary font-sans select-none touch-none"
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
		>
			{/* Worktable Area */}
			<div
				ref={containerRef}
				className="relative flex-1 bg-table-gradient"
			>
				{/* Background Decoration */}
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none overflow-hidden mt-[-10%]">
					<span className="text-[60vh] font-serif leading-none">☿</span>
				</div>
				<div className="absolute inset-x-0 top-12 flex flex-col items-center pointer-events-none z-10 text-center px-6 opacity-50">
					{discovered.length === 4 ? (
						<h2 className="text-2xl font-black tracking-tight text-primary animate-bounce-subtle">
							Welcome to the Alchemy! Drag elements here to combine them and create the world!
						</h2>
					) : (
						<>
							<h1 className="text-xl font-bold tracking-tight text-primary opacity-40 mb-1">Alchemy Game</h1>
							<p className="text-tertiary text-lg">
								{nextKeyItem ? (
									<>
										Next key element: <span className="font-bold text-secondary capitalize">{nextKeyItem.replace('-', ' ')}</span>
									</>
								) : (
									'All key items discovered!'
								)}
							</p>
						</>
					)}
				</div>

				<button
					onClick={() => setShowOptions(true)}
					className="absolute right-2 top-2 z-30 p-2 rounded-full bg-black/20 hover:bg-black/40 text-primary transition-colors backdrop-blur-sm border border-white/10 shadow-lg cursor-pointer"
					title="Options"
				>
					<IoSettingsSharp size={24} />
				</button>
			</div>

			{/* Palette Area */}
			<div className="h-60 border-t border-palette bg-palette flex flex-col z-10">
				<div className="pt-3 px-4 pb-1 relative">
					{showMobileFilter ? (
						<div
							className="flex items-center gap-1 pb-1 w-full"
							onPointerDown={(e) => e.stopPropagation()}
						>
							<button
								onClick={() => {
									setFilterQuery('');
									setShowMobileFilter(false);
									setCurrentPage(0);
								}}
								className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center mr-1 active:scale-90 transition-transform"
							>
								<IoCloseSharp size={18} />
							</button>
							<div className="flex items-center gap-1 overflow-x-auto no-scrollbar touch-pan-x w-full">
								{'abcdefghijklmnopqrstuvwxyz'.split('')
									.filter(char => discovered.some(el => el.toLowerCase().startsWith(char)))
									.map((char) => (
										<button
											key={char}
											onClick={() => {
												setFilterQuery(char);
												setCurrentPage(0);
											}}
											className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm uppercase transition-all active:scale-95 ${filterQuery === char
												? 'bg-blue-500 text-white shadow-lg scale-105'
												: 'bg-slate-800 text-slate-400 hover:bg-slate-700'
												}`}
										>
											{char}
										</button>
									))}
							</div>
						</div>
					) : (
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<h2 className="text-xs font-bold uppercase tracking-wider text-secondary">
									{filterQuery ? `Elements (${filterQuery.toUpperCase()})` : 'Elements'}
								</h2>
								{/* Mobile Filter Button */}
								<button
									onClick={() => setShowMobileFilter(true)}
									className="sm:hidden p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-tertiary hover:text-primary transition-colors active:scale-95"
								>
									<IoSearchSharp size={14} />
								</button>
								{/* Desktop Hint - Leaned to caption */}
								<span className="text-[11px] text-tertiary opacity-40  hidden sm:inline-block ml-2">
									{filterQuery
										? 'Press ESC to cancel filter'
										: pages.length > 1
											? 'Type any letter to filter'
											: ''}
								</span>
							</div>

							<div className="flex items-center gap-3">
								<span className="text-[10px] text-tertiary">
									{discovered.length}/{totalElementsCount} Discovered
								</span>
							</div>
						</div>
					)}
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
							<div
								key={pageIdx}
								className="min-w-full h-full grid grid-rows-3 gap-1.5 px-4 pb-2"
								style={{ gridTemplateColumns: `repeat(${layoutCols}, minmax(0, 1fr))` }}
							>
								{page.map((name) => {
									const colorClass = ELEMENT_COLORS[name] ?? 'bg-gray-300 border-gray-500';
									const weightMatch = colorClass.match(/-(\d{3})/);
									const weight = weightMatch ? parseInt(weightMatch[1] || '500') : 500;
									const Icon = ELEMENT_ICONS[name];

									return (
										<div
											key={`${pageIdx}-${name}`}
											className={`relative flex flex-col h-full items-center justify-end rounded-lg border-2 text-[10px] font-black shadow-sm active:scale-95 select-none overflow-hidden ${colorClass}`}
											onPointerDown={(e) => {
												e.stopPropagation();
												onPaletteDown(e, name);
											}}
										>
											{Icon && (
												<div className={`absolute inset-0 flex items-center justify-center pointer-events-none pb-2`}>
													{(() => {
														const displayIcon = Array.isArray(Icon) ? Icon[0] : Icon;
														if (typeof displayIcon === 'string') {
															if (displayIcon.startsWith('/') || displayIcon.startsWith('http')) {
																return <img src={displayIcon} alt="" className="w-9 h-9 object-contain drop-shadow-md" />;
															}
															return <span className="text-[34px] leading-none drop-shadow-md">{displayIcon}</span>;
														}
														const IconComp = displayIcon;
														return (
															<div className={`${weight < 500 ? 'text-black/50' : 'text-white/50'}`}>
																<IconComp size={30} />
															</div>
														);
													})()}
												</div>
											)}
											<span className="relative z-10 text-center truncate w-full bg-black/40 py-0.5 text-[10px] backdrop-blur-sm text-white/95">{name}</span>
										</div>
									);
								})}
								{pageIdx === 0 && discovered.length >= 6 && discovered.length < 12 && (
									<div className="col-span-6 row-start-3 flex items-center justify-center pointer-events-none opacity-30 text-[9px] font-bold uppercase tracking-[0.2em] text-primary italic">
										drag elements here to discard them
									</div>
								)}
							</div>
						))}
					</div>
				</div>

				{pages.length > 1 && (
					<div className="flex justify-center gap-2 pb-3">
						{pages.map((_, i) => (
							<div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === currentPage ? 'palette-dot-active' : 'palette-dot'}`} />
						))}
					</div>
				)}
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
					const Icon = el.icon ?? ELEMENT_ICONS[el.name];
					const isExploding = explodingIDs[el.id];
					const pushVector = pushedElements[el.id];

					return (
						<div
							key={el.id}
							className={`absolute h-20 w-20 ml-[-40px] mt-[-40px] pointer-events-auto select-none touch-none ${isDragging ? 'z-[100] cursor-grabbing scale-110' : 'z-50 cursor-grab'} ${isShaking ? 'animate-shake' : ''} ${isExploding ? 'animate-explode-shake z-[150]' : ''} ${pushVector ? 'animate-push-out' : ''} ${!isDragging && !isExploding && !pushVector ? 'element-transition' : ''}`}
							style={{
								left: el.x,
								top: el.y,
								'--push-x': pushVector ? `${pushVector.x}px` : '0px',
								'--push-y': pushVector ? `${pushVector.y}px` : '0px',
							} as any}
							onPointerDown={(e) => handlePointerDown(e, el.id)}
						>
							<div className={`absolute inset-0 flex flex-col items-center justify-end rounded-xl border-2 text-[11px] font-bold shadow-2xl drop-shadow-2xl overflow-hidden ${colorClass} ${isReactive ? 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-[var(--ring-offset)] animate-pulse' : ''}`}>
								{/* Background Darkener for contrast */}
								<div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'var(--element-overlay)' }} />

								{Icon && (
									<div className="absolute inset-x-0 top-0 bottom-6 flex items-center justify-center pointer-events-none">
										{(() => {
											const displayIcon = Array.isArray(Icon) ? Icon[0] : Icon;
											if (typeof displayIcon === 'string') {
												if (displayIcon.startsWith('/') || displayIcon.startsWith('http')) {
													return <img src={displayIcon} alt="" className="w-14 h-14 object-contain drop-shadow-xl" />;
												}
												return <span className="text-[52px] leading-none drop-shadow-xl">{displayIcon}</span>;
											}
											const IconComp = displayIcon;
											return (
												<div className={`${weight < 500 ? 'text-black/50' : 'text-white/50'}`}>
													<IconComp size={44} />
												</div>
											);
										})()}
									</div>
								)}
								<span className="relative z-10 px-1 py-0.5 text-center bg-black/40 backdrop-blur-md w-full text-white/95 truncate leading-tight border-t border-white/5">{el.name}</span>
							</div>

							{/* Scientist Hint Bubble */}
							{el.hint && el.name === 'scientist' && (
								<div
									className="absolute -top-24 left-1/2 -translate-x-1/2 z-[200] cursor-pointer animate-bounce-subtle pointer-events-auto"
									onPointerDown={(e) => {
										e.stopPropagation();
										closeHint(el.id);
									}}
								>
									<div className="relative bg-white text-black p-3 rounded-2xl shadow-xl border-2 border-slate-200 min-w-[140px] text-center filter drop-shadow-lg">
										{el.hint === 'nothing' ? (
											<span className="font-bold text-sm">No discoveries left!</span>
										) : (
											<div className="flex flex-col items-center">
												{(() => {
													const idNum = parseInt(el.id.replace('el-', '')) || 0;
													const phrases = [
														"I'm sure you could create:",
														"Theory suggests crafting:",
														"Have you tried making:"
													];
													const phrase = phrases[idNum % phrases.length];
													return (
														<span className="text-[10px] text-gray-500 font-medium mb-1 uppercase tracking-wide leading-tight px-2">{phrase}</span>
													);
												})()}
												<span className="text-lg font-black text-secondary capitalize leading-none pb-1">{el.hint?.replace(/-/g, ' ')}</span>
											</div>
										)}
										{/* Triangle arrow */}
										<div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-white" />
									</div>
								</div>
							)}
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

			{showOptions && (
				<div
					className="absolute inset-0 z-[1000] flex items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-md animate-fade-in"
					onPointerDown={(e) => e.stopPropagation()}
				>
					<div
						className="relative w-full max-w-sm rounded-2xl bg-[var(--card-bg)] p-8 shadow-2xl border border-white/10 animate-scale-in"
						onPointerDown={(e) => e.stopPropagation()}
					>
						<button
							onClick={() => {
								setShowOptions(false);
								setConfirmWipe(false);
							}}
							className="absolute right-4 top-4 p-2 text-tertiary hover:text-primary transition-colors cursor-pointer"
						>
							<IoCloseSharp size={28} />
						</button>

						<h2 className="mb-6 text-2xl font-bold text-primary">Options</h2>

						<div className="space-y-6">
							<div className="flex flex-col gap-1">
								<span className="text-sm font-medium text-secondary">Author</span>
								<span className="text-lg font-bold text-primary">Elegar</span>
							</div>

							<div className="h-px bg-white/10" />

							<div className="space-y-3">
								<button
									onClick={() => {
										if (!confirmWipe) {
											setConfirmWipe(true);
											return;
										}
										const basic = ['air', 'fire', 'earth', 'water'];
										setDiscovered(basic);
										setElements([]);
										setCurrentPage(0);
										localStorage.setItem(STORAGE_KEYS.DISCOVERED, JSON.stringify(basic));
										localStorage.setItem(STORAGE_KEYS.ELEMENTS, JSON.stringify([]));
										localStorage.setItem(STORAGE_KEYS.PAGE, '0');
										trpc.progress.save.mutate(basic).catch(console.error);
										setShowOptions(false);
										setConfirmWipe(false);
									}}
									onMouseLeave={() => setConfirmWipe(false)}
									className={`w-full rounded-xl py-3 font-bold text-white transition-all hover:scale-[1.02] active:scale-95 shadow-lg ${confirmWipe
										? 'bg-orange-600 hover:bg-orange-700 animate-pulse'
										: 'bg-[var(--button-danger)] hover:bg-[var(--button-danger-hover)]'
										}`}
								>
									{confirmWipe ? 'Are you sure? Click again' : 'Wipe All Progress'}
								</button>

								{username === 'Elegar' && (
									<button
										onClick={() => {
											const allElements = Object.keys(ELEMENT_COLORS);
											setDiscovered(allElements);
											trpc.progress.save.mutate(allElements).catch(console.error);
											setShowOptions(false);
										}}
										className="w-full rounded-xl bg-[var(--button-primary)] py-3 font-bold text-white transition-all hover:bg-[var(--button-primary-hover)] hover:scale-[1.02] active:scale-95 shadow-lg"
									>
										Unlock All Elements
									</button>
								)}
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Discovery Popup */}
			{discoveryPopup && (
				<div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-fade-in">
					<div className="relative w-full max-w-md mx-4 rounded-3xl bg-slate-800 p-8 shadow-[0_0_50px_rgba(255,255,255,0.1)] border border-white/20 text-center animate-scale-in overflow-hidden">
						{/* Celebrational Decor */}
						<div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
						<div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
						<div className="absolute inset-0 border-2 border-dashed border-white/5 rounded-3xl m-2 pointer-events-none" />

						<div className="relative z-10">
							<div className="mb-2 text-sm font-bold uppercase tracking-widest text-blue-400">
								New Key Item Discovered!
							</div>
							<h2 className="mb-6 text-4xl font-black text-white capitalize">{discoveryPopup.replace('-', ' ')}</h2>

							<div className="flex justify-center mb-8 relative">
								<div className="absolute inset-0 bg-white/10 blur-2xl rounded-full scale-150 animate-pulse" />
								<div
									className={`relative flex h-32 w-32 items-center justify-center rounded-2xl border-4 ${ELEMENT_COLORS[discoveryPopup] ?? 'bg-gray-300 border-gray-500'} shadow-2xl rotate-3`}
								>
									{(() => {
										const rawIcon = ELEMENT_ICONS[discoveryPopup];
										const Icon = Array.isArray(rawIcon) ? rawIcon[0] : rawIcon;
										const colorClass = ELEMENT_COLORS[discoveryPopup] ?? 'bg-gray-300 border-gray-500';
										const weightMatch = colorClass.match(/-(\d{3})/);
										const weight = weightMatch ? parseInt(weightMatch[1] || '500') : 500;
										if (typeof Icon === 'string') {
											if (Icon.startsWith('/') || Icon.startsWith('http')) {
												return <img src={Icon} alt="" className="w-20 h-20 object-contain" />;
											}
											return <span className="text-7xl leading-none drop-shadow-2xl">{Icon}</span>;
										} else if (Icon) {
											const IconComp = Icon;
											return (
												<IconComp size={80} className={weight < 500 ? 'text-black/50' : 'text-white/50'} />
											);
										}
										return null;
									})()}
								</div>
							</div>

							<div className="space-y-4 mb-8 px-2">
								<p className="text-lg text-white font-medium leading-relaxed italic">
									"{KEY_ITEMS_DATA[discoveryPopup]?.description}"
								</p>
								<p className="text-blue-200 text-sm opacity-90 leading-snug">
									{KEY_ITEMS_DATA[discoveryPopup]?.motivation}
								</p>
							</div>

							<button
								onClick={() => setDiscoveryPopup(null)}
								className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 py-4 font-black text-white transition-all hover:scale-[1.02] active:scale-95 shadow-[0_4px_20px_rgba(59,130,246,0.5)] cursor-pointer"
							>
								AWESOME!
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Info Popup */}
			{infoPopup && (
				<div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-md animate-fade-in">
					<div className="relative w-full max-w-sm mx-4 rounded-2xl bg-slate-900 p-6 shadow-xl border border-white/10 text-center animate-scale-in">
						<div className="relative z-10">
							<div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
								Discovery Note
							</div>
							<h3 className="mb-4 text-2xl font-bold text-white capitalize">{infoPopup.replace('-', ' ')}</h3>

							<div className="flex justify-center mb-6">
								<div
									className={`flex h-20 w-20 items-center justify-center rounded-xl border-2 ${ELEMENT_COLORS[infoPopup] ?? 'bg-gray-300 border-gray-500'} shadow-lg`}
								>
									{(() => {
										const rawIcon = ELEMENT_ICONS[infoPopup];
										const Icon = Array.isArray(rawIcon) ? rawIcon[0] : rawIcon;
										const colorClass = ELEMENT_COLORS[infoPopup] ?? 'bg-gray-300 border-gray-500';
										const weightMatch = colorClass.match(/-(\d{3})/);
										const weight = weightMatch ? parseInt(weightMatch[1] || '500') : 500;
										if (typeof Icon === 'string') {
											if (Icon.startsWith('/') || Icon.startsWith('http')) {
												return <img src={Icon} alt="" className="w-12 h-12 object-contain" />;
											}
											return <span className="text-4xl leading-none drop-shadow-lg">{Icon}</span>;
										} else if (Icon) {
											const IconComp = Icon;
											return (
												<IconComp size={40} className={weight < 500 ? 'text-black/50' : 'text-white/50'} />
											);
										}
										return null;
									})()}
								</div>
							</div>

							<p className="text-sm text-slate-300 leading-relaxed mb-6 px-4">
								{ELEMENT_MESSAGES[infoPopup]}
							</p>

							<button
								onClick={() => setInfoPopup(null)}
								className="w-full rounded-xl bg-slate-800 py-3 font-bold text-white transition-all hover:bg-slate-700 active:scale-95 border border-white/5 cursor-pointer"
							>
								Understood
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
);
