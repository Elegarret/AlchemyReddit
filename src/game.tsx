import './index.css';

import { StrictMode, useState, useRef, useEffect, type ComponentType, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { context } from '@devvit/web/client';
import { IoCreateOutline, IoSettingsSharp, IoCloseSharp, IoSearchSharp } from 'react-icons/io5';
import { BASE_RULESET } from './modding/base-ruleset';
import {
	getLocalStorageKeys,
	getProgressScope,
	getRecipeResultForRuleset,
	getRecipesForElementInRuleset,
	getValidDiscoveredItems,
	PLAYTEST_RULESET_STORAGE_KEY,
} from './modding/runtime';
import {
	LEGACY_ELEMENT_EFFECTS,
	type ActiveRuleset,
	type ModElementEffect,
} from './modding/types';
import { trpc } from './trpc';
import { openEntry, setEditorTargetModId } from './webview-navigation';

type Element = {
	id: string;
	name: string;
	x: number;
	y: number;
	icon?: ElementIcon;
	hint?: string;
};

type ElementIcon = string | ComponentType<{ size?: number }>;

type SnowBackdropFlakeStyle = CSSProperties & {
	'--snow-opacity': string;
	'--snow-mid-x': string;
	'--snow-mid-y': string;
	'--snow-end-x': string;
	'--snow-end-y': string;
	'--snow-scale-start': string;
	'--snow-scale-peak': string;
	'--snow-scale-end': string;
};

const createSnowBackdropFlakes = (): SnowBackdropFlakeStyle[] =>
	Array.from({ length: 34 }, () => {
		const size = 3 + Math.random() * 5;
		const blur = Math.random() * 1.1;

		return {
			left: `${Math.random() * 100}%`,
			top: `${8 + Math.random() * 76}%`,
			width: `${size}px`,
			height: `${size}px`,
			filter: `blur(${blur.toFixed(2)}px)`,
			animationDelay: `${(-1 * Math.random() * 26).toFixed(2)}s`,
			animationDuration: `${18 + Math.random() * 18}s`,
			'--snow-opacity': `${(0.28 + Math.random() * 0.4).toFixed(2)}`,
			'--snow-mid-x': `${(-18 + Math.random() * 36).toFixed(1)}px`,
			'--snow-mid-y': `${(10 + Math.random() * 18).toFixed(1)}px`,
			'--snow-end-x': `${(-28 + Math.random() * 56).toFixed(1)}px`,
			'--snow-end-y': `${(28 + Math.random() * 34).toFixed(1)}px`,
			'--snow-scale-start': `${(0.74 + Math.random() * 0.18).toFixed(2)}`,
			'--snow-scale-peak': `${(0.96 + Math.random() * 0.22).toFixed(2)}`,
			'--snow-scale-end': `${(0.82 + Math.random() * 0.16).toFixed(2)}`,
		};
	});

const createSnowPaletteHills = (): CSSProperties[] => [
	{
		left: '-8%',
		width: '33%',
		height: '58px',
		animationDelay: '0s',
		animationDuration: '24s',
	},
	{
		left: '15%',
		width: '29%',
		height: '44px',
		animationDelay: '0.24s',
		animationDuration: '21s',
	},
	{
		left: '35%',
		width: '36%',
		height: '68px',
		animationDelay: '0.08s',
		animationDuration: '26s',
	},
	{
		left: '60%',
		width: '26%',
		height: '48px',
		animationDelay: '0.32s',
		animationDuration: '23s',
	},
	{
		right: '-7%',
		width: '30%',
		height: '56px',
		animationDelay: '0.14s',
		animationDuration: '25s',
	},
];

// No longer needed, icons moved to elements.ts

let elementIdCounter = 0;
const createElementId = () => `el-${++elementIdCounter}`;

type GameSessionProps = {
	ruleset: ActiveRuleset;
	initialUsername: string | null;
	initialDiscovered: string[];
	progressScope: string;
	isPlaytest: boolean;
};

type PersistedRuleset = {
	kind?: ActiveRuleset['kind'];
	rulesetId: string;
	title?: string;
	summary?: string;
	intro?: string;
	storageScope: string;
	startingElements: string[];
	recipes: ActiveRuleset['recipes'];
	elementNames?: ActiveRuleset['elementNames'];
	elementStyles: ActiveRuleset['elementStyles'];
	elementIcons: ActiveRuleset['elementIcons'];
	elementEffects?: ActiveRuleset['elementEffects'];
	keyItems?: ActiveRuleset['keyItems'];
	keyItemData?: ActiveRuleset['keyItemData'];
	elementMessages?: ActiveRuleset['elementMessages'];
	sourceModId?: string;
	publishedHash?: string;
	ownerUsername?: string;
	publishedAt?: string;
};

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const isRulesetRecord = (value: unknown): value is PersistedRuleset => {
	if (!isUnknownRecord(value)) {
		return false;
	}

	return (
		typeof value.rulesetId === 'string' &&
		typeof value.storageScope === 'string' &&
		Array.isArray(value.startingElements) &&
		isUnknownRecord(value.recipes) &&
		isUnknownRecord(value.elementStyles) &&
		isUnknownRecord(value.elementIcons)
	);
};

const readPlaytestRuleset = (): ActiveRuleset | null => {
	try {
		const saved = localStorage.getItem(PLAYTEST_RULESET_STORAGE_KEY);
		if (!saved) {
			return null;
		}

		const parsed = JSON.parse(saved);
		if (!isRulesetRecord(parsed)) {
			return null;
		}

		const kind: ActiveRuleset['kind'] =
			parsed.kind === 'mod' ? 'mod' : 'base';

		return {
			kind,
			rulesetId: parsed.rulesetId,
			title: parsed.title ?? 'Alchemy',
			summary: parsed.summary ?? '',
			intro: parsed.intro ?? '',
			storageScope: parsed.storageScope,
			startingElements: parsed.startingElements,
			recipes: parsed.recipes,
			elementStyles: parsed.elementStyles,
			elementIcons: parsed.elementIcons,
			elementEffects: parsed.elementEffects ?? {},
			keyItems: parsed.keyItems ?? [],
			keyItemData: parsed.keyItemData ?? {},
			elementMessages: parsed.elementMessages ?? {},
			...(parsed.elementNames ? { elementNames: parsed.elementNames } : {}),
			...(parsed.sourceModId ? { sourceModId: parsed.sourceModId } : {}),
			...(parsed.publishedHash
				? { publishedHash: parsed.publishedHash }
				: {}),
			...(parsed.ownerUsername ? { ownerUsername: parsed.ownerUsername } : {}),
			...(parsed.publishedAt ? { publishedAt: parsed.publishedAt } : {}),
		};
	} catch {
		return null;
	}
};

const GameSession = ({ ruleset, initialUsername, initialDiscovered, progressScope, isPlaytest }: GameSessionProps) => {
	const storageKeys = getLocalStorageKeys(ruleset);
	const introStorageKey = `${storageKeys.discovered}-intro-dismissed`;
	const [discovered, setDiscovered] = useState<string[]>(() => {
		try {
			const saved = localStorage.getItem(storageKeys.discovered);
			const items = saved ? JSON.parse(saved) : ruleset.startingElements;
			return getValidDiscoveredItems(ruleset, [...items, ...initialDiscovered]);
		} catch {
			return getValidDiscoveredItems(ruleset, initialDiscovered);
		}
	});

	const [elements, setElements] = useState<Element[]>(() => {
		const validNames = new Set(Object.keys(ruleset.elementStyles));

		try {
			const saved = localStorage.getItem(storageKeys.elements);
			if (saved) {
				const parsed = (JSON.parse(saved) as Element[]).filter(el => validNames.has(el.name));
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
	const username = initialUsername;
	const authorUsername = ruleset.ownerUsername ?? 'Unknown';
	const isAuthor = !!username && username === ruleset.ownerUsername;
	const [discoveryPopup, setDiscoveryPopup] = useState<string | null>(null);
	const [confirmWipe, setConfirmWipe] = useState(false);
	const [infoPopup, setInfoPopup] = useState<string | null>(null);
	const [computerPopup, setComputerPopup] = useState<string | null>(null);
	const [filterQuery, setFilterQuery] = useState('');
	const [showMobileFilter, setShowMobileFilter] = useState(false);
	const [isQuaking, setIsQuaking] = useState(false);
	const [stormFlashVisible, setStormFlashVisible] = useState(false);
	const [showRealmIntro, setShowRealmIntro] = useState(() => {
		if (!ruleset.intro.trim()) {
			return false;
		}

		try {
			return localStorage.getItem(introStorageKey) !== '1';
		} catch {
			return true;
		}
	});

	const getElementDisplayName = (elementId: string) =>
		ruleset.elementNames?.[elementId] ?? elementId;

	const getElementEffect = (elementId: string): ModElementEffect =>
		ruleset.elementEffects[elementId] ??
		LEGACY_ELEMENT_EFFECTS[elementId] ??
		'none';

	const hasElementEffect = (elementId: string, effect: ModElementEffect) =>
		getElementEffect(elementId) === effect;

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
	const wheelTimeout = useRef<number | null>(null);
	const elementsRef = useRef<Element[]>(elements);
	const explosionStartTimeouts = useRef<Record<string, number>>({});
	const explosionCleanupTimeouts = useRef<Record<string, number>>({});
	const quakeTimeout = useRef<number | null>(null);
	const stormLoopTimeout = useRef<number | null>(null);
	const stormFlashTimeouts = useRef<number[]>([]);
	const hadStorm = useRef(false);
	const previousEarthquakeIds = useRef<Set<string>>(new Set());
	const initializedEarthquakeTracking = useRef(false);

	// Palette Swipe State
	const [currentPage, setCurrentPage] = useState(() => {
		try {
			const saved = localStorage.getItem(storageKeys.page);
			return saved ? parseInt(saved, 10) : 0;
		} catch {
			return 0;
		}
	});
	const [paletteTranslate, setPaletteTranslate] = useState(0);
	const isGesturingPalette = useRef<'none' | 'swiping' | 'spawning'>('none');
	const gestureStart = useRef({ x: 0, y: 0, name: '' });

	const itemsPerPage = layoutCols * 3;
	const hasStorm = elements.some(el => hasElementEffect(el.name, 'storm'));
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
		localStorage.setItem(storageKeys.discovered, JSON.stringify(discovered));
	}, [discovered]);

	// Reddit Progress Save (Discovery only)
	const prevDiscoveredCount = useRef(discovered.length);
	useEffect(() => {
		if (isPlaytest) return;

		if (discovered.length > prevDiscoveredCount.current) {
			console.log('[Sync] New discovery, saving to Reddit...');
			trpc.progress.save.mutate({ discovered, progressScope }).catch((err) => {
				console.error('[Sync] Save failed:', err);
			});
			prevDiscoveredCount.current = discovered.length;
		}
	}, [discovered, isPlaytest, progressScope]);

	useEffect(() => {
		localStorage.setItem(storageKeys.elements, JSON.stringify(elements));
	}, [elements]);

	useEffect(() => {
		localStorage.setItem(storageKeys.page, currentPage.toString());
	}, [currentPage]);

	useEffect(() => {
		elementsRef.current = elements;
	}, [elements]);

	useEffect(() => {
		const currentEarthquakeIds = new Set(
			elements
				.filter((el) => hasElementEffect(el.name, 'earthquake'))
				.map((el) => el.id)
		);

		if (!initializedEarthquakeTracking.current) {
			previousEarthquakeIds.current = currentEarthquakeIds;
			initializedEarthquakeTracking.current = true;
			return;
		}

		const hasNewEarthquake = [...currentEarthquakeIds].some(
			(id) => !previousEarthquakeIds.current.has(id)
		);

		previousEarthquakeIds.current = currentEarthquakeIds;

		if (hasNewEarthquake) {
			triggerTableEarthquake();
		}
	}, [elements]);

	const clearExplosionTimeouts = (id: string) => {
		const startTimeout = explosionStartTimeouts.current[id];
		if (startTimeout !== undefined) {
			window.clearTimeout(startTimeout);
			delete explosionStartTimeouts.current[id];
		}

		const cleanupTimeout = explosionCleanupTimeouts.current[id];
		if (cleanupTimeout !== undefined) {
			window.clearTimeout(cleanupTimeout);
			delete explosionCleanupTimeouts.current[id];
		}
	};

	const cancelExplosion = (id: string) => {
		clearExplosionTimeouts(id);
		setExplodingIDs(prev => {
			if (!prev[id]) return prev;
			const next = { ...prev };
			delete next[id];
			return next;
		});
		setPushedElements({});
		setFlash(null);
	};

	const triggerTableEarthquake = () => {
		if (quakeTimeout.current !== null) {
			window.clearTimeout(quakeTimeout.current);
		}

		setIsQuaking(true);
		quakeTimeout.current = window.setTimeout(() => {
			setIsQuaking(false);
			quakeTimeout.current = null;
		}, 2000);
	};

	const clearStormTimeouts = () => {
		if (stormLoopTimeout.current !== null) {
			window.clearTimeout(stormLoopTimeout.current);
			stormLoopTimeout.current = null;
		}

		stormFlashTimeouts.current.forEach((timeoutId) => {
			window.clearTimeout(timeoutId);
		});
		stormFlashTimeouts.current = [];
	};

	const triggerStormFlash = (duration = 150) => {
		setStormFlashVisible(true);

		const timeoutId = window.setTimeout(() => {
			setStormFlashVisible(false);
			stormFlashTimeouts.current = stormFlashTimeouts.current.filter((activeId) => activeId !== timeoutId);
		}, duration);

		stormFlashTimeouts.current.push(timeoutId);
	};

	// Explosion Effect Logic
	useEffect(() => {
		const explodeEl = elements.find(
			el => hasElementEffect(el.name, 'explode') && !explodingIDs[el.id]
		);
		if (explodeEl) {
			const currentExplodeId = explodeEl.id;
			setExplodingIDs(prev => ({ ...prev, [currentExplodeId]: true }));

			// Start explosion sequence after shake
			explosionStartTimeouts.current[currentExplodeId] = window.setTimeout(() => {
				const currentExplodeEl = elementsRef.current.find(el => el.id === currentExplodeId);
				if (!currentExplodeEl) {
					cancelExplosion(currentExplodeId);
					return;
				}

				const explosionX = currentExplodeEl.x;
				const explosionY = currentExplodeEl.y;

				// Flash at the current explosion site
				setFlash({ x: explosionX, y: explosionY, id: ++flashCounter.current });

				// Calculate push vectors for ALL elements currently on table
				const pushData: Record<string, { x: number, y: number }> = {};
				elementsRef.current.forEach(el => {
					if (el.id === currentExplodeId) return;
					const dx = el.x - explosionX;
					const dy = el.y - explosionY;
					const dist = Math.sqrt(dx * dx + dy * dy) || 1;
					const force = 1000;
					pushData[el.id] = {
						x: (dx / dist) * force,
						y: (dy / dist) * force
					};
				});
				setPushedElements(pushData);

				// Final cleanup: remove everything after animation
				explosionCleanupTimeouts.current[currentExplodeId] = window.setTimeout(() => {
					const stillExists = elementsRef.current.some(el => el.id === currentExplodeId);
					if (!stillExists) {
						cancelExplosion(currentExplodeId);
						return;
					}

					clearExplosionTimeouts(currentExplodeId);
					setElements(currentElements => currentElements.filter(el => el.name === 'space'));
					setExplodingIDs({});
					setPushedElements({});
					setFlash(null);
				}, 500);
			}, 1500);
		}
	}, [elements, explodingIDs]);

	useEffect(() => {
		Object.keys(explodingIDs).forEach(id => {
			if (!elements.some(el => el.id === id)) {
				cancelExplosion(id);
			}
		});
	}, [elements, explodingIDs]);

	useEffect(() => {
		return () => {
			Object.keys(explosionStartTimeouts.current).forEach(id => {
				window.clearTimeout(explosionStartTimeouts.current[id]);
			});
			Object.keys(explosionCleanupTimeouts.current).forEach(id => {
				window.clearTimeout(explosionCleanupTimeouts.current[id]);
			});
			if (quakeTimeout.current !== null) {
				window.clearTimeout(quakeTimeout.current);
			}
			clearStormTimeouts();
		};
	}, []);

	useEffect(() => {
		if (!hasStorm) {
			hadStorm.current = false;
			setStormFlashVisible(false);
			clearStormTimeouts();
			return;
		}

		clearStormTimeouts();

		if (!hadStorm.current) {
			[180, 620].forEach((delay) => {
				const timeoutId = window.setTimeout(() => {
					triggerStormFlash();
				}, delay);
				stormFlashTimeouts.current.push(timeoutId);
			});
		}

		hadStorm.current = true;

		const scheduleAmbientFlash = (delay: number) => {
			stormLoopTimeout.current = window.setTimeout(() => {
				triggerStormFlash(130);
				scheduleAmbientFlash(7000 + Math.random() * 6000);
			}, delay);
		};

		scheduleAmbientFlash(7000);

		return () => {
			clearStormTimeouts();
			setStormFlashVisible(false);
		};
	}, [hasStorm]);

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
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const getRandomTableIcon = (name: string) => {
		const rawIcon = ruleset.elementIcons[name];
		if (!Array.isArray(rawIcon)) return undefined;
		if (rawIcon.length <= 1) return rawIcon[0];
		// Pick a random icon starting from index 1
		return rawIcon[1 + Math.floor(Math.random() * (rawIcon.length - 1))];
	};

	const renderElementWidget = (
		name: string,
		size: 'small' | 'large' = 'small',
		isHidden: boolean = false,
		isReactive: boolean = false,
		iconOverride?: ElementIcon,
	) => {
		const colorClass = isHidden ? 'bg-slate-900 border-slate-800' : (ruleset.elementStyles[name] ?? 'bg-gray-300 border-gray-500');
		const customBg = !isHidden ? colorClass.split(' ').find(c => c.startsWith('bg-[_#'))?.replace('bg-[_', '').slice(0, -1) || colorClass.split(' ').find(c => c.startsWith('bg-[#'))?.slice(4, -1) : undefined;
		const customFrame = !isHidden ? colorClass.split(' ').find(c => c.startsWith('border-[_#'))?.replace('border-[_', '').slice(0, -1) || colorClass.split(' ').find(c => c.startsWith('border-[#'))?.slice(8, -1) : undefined;
		
		const style: React.CSSProperties = {
			...(customBg ? { backgroundColor: customBg } : {}),
			...(customFrame ? { borderColor: customFrame } : {})
		};

		const weightMatch = colorClass.match(/-(\d{3})/);
		const weight = weightMatch ? parseInt(weightMatch[1] || '500') : 500;
		const Icon = isHidden ? null : (iconOverride ?? ruleset.elementIcons[name]);
		const displayName = isHidden ? '???' : getElementDisplayName(name);

		const sizeClasses = size === 'small'
			? 'h-full w-full rounded-lg border-2 text-[10px] pb-0'
			: 'h-full w-full rounded-xl border-2 text-[11px] pb-0';

		const reactiveClasses = isReactive ? 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-[var(--ring-offset)] animate-pulse' : '';
		const lightGlow = hasElementEffect(name, 'light') && !isHidden ? 'shadow-[0_0_40px_15px_rgba(255,255,150,0.8)] z-20' : '';

		return (
			<div className={`relative flex flex-col items-center justify-end select-none overflow-hidden ${sizeClasses} ${colorClass} ${reactiveClasses} ${lightGlow}`} style={style}>
				{!isHidden && <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'var(--element-overlay)' }} />}
				{Icon && (
					<div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-[1] ${size === 'small' ? 'pb-3' : 'pb-5'}`}>
						{(() => {
							const displayIcon = Array.isArray(Icon) ? Icon[0] : Icon;
							if (typeof displayIcon === 'string') {
								if (displayIcon.startsWith('/') || displayIcon.startsWith('http')) {
									return <img src={displayIcon} alt="" className={`${size === 'small' ? 'w-9 h-9' : 'w-14 h-14'} object-contain drop-shadow-md`} />;
								}
								return <span className={`${size === 'small' ? 'text-[34px]' : 'text-[52px]'} leading-none drop-shadow-md`}>{displayIcon}</span>;
							}
							const IconComp = displayIcon;
							if (!IconComp) {
								return null;
							}
							return (
								<div className={`${weight < 500 ? 'text-black/50' : 'text-white/50'}`}>
									<IconComp size={size === 'small' ? 30 : 44} />
								</div>
							);
						})()}
					</div>
				)}
				<span className={`relative z-10 text-center truncate w-full bg-black/40 py-0.5 backdrop-blur-sm text-white/95 leading-tight ${size === 'small' ? 'text-[10px]' : 'text-[11px] font-bold border-t border-white/5'}`}>
					{displayName}
				</span>
			</div>
		);
	};

	const getRandomHint = (currentDiscovered: string[] = discovered) => {
		const possible: string[] = [];
		for (const [key, outputs] of Object.entries(ruleset.recipes)) {
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
		const hint = hasElementEffect(name, 'hint') ? (getRandomHint() ?? 'nothing') : undefined;

		const newElement: Element = {
			id,
			name,
			x: e.clientX,
			y: e.clientY,
			...(hint ? { hint } : {}),
			...(icon ? { icon } : {}),
		};

		setElements((prev) => [...prev, newElement]);
		setDragging(id);
		dragOffset.current = { x: 0, y: 0 };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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

				if (
					targetEl &&
					(
						getRecipeResultForRuleset(ruleset, draggedEl.name, targetEl.name) ||
						hasElementEffect(draggedEl.name, 'computer') ||
						hasElementEffect(targetEl.name, 'computer')
					)
				) {
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
			const isComputerAction =
				hasElementEffect(draggedEl.name, 'computer') ||
				hasElementEffect(targetEl.name, 'computer');
			if (isComputerAction) {
				const elementToShow = hasElementEffect(draggedEl.name, 'computer')
					? targetEl.name
					: draggedEl.name;
				setComputerPopup(elementToShow);
			}

			const result = getRecipeResultForRuleset(ruleset, draggedEl.name, targetEl.name);
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
						if (ruleset.keyItems.includes(name)) {
							newlyDiscoveredKeyItem = name;
						} else if (ruleset.elementMessages[name]) {
							newlyDiscoveredInfoItem = name;
						}
					}
				});

				// Recalculate hints for ALL existing scientists on the table given the new discoveries
				const updatedFilteredElements = filteredElements.map(el => {
					if (hasElementEffect(el.name, 'hint')) {
						return {
							...el,
							hint: getRandomHint(nextDiscovered) ?? 'nothing'
						};
					}
					return el;
				});

				const newResultElements = result.map((name) => {
					const icon = getRandomTableIcon(name);
					const hint = hasElementEffect(name, 'hint')
						? (getRandomHint(nextDiscovered) ?? 'nothing')
						: undefined;
					return {
						id: createElementId(),
						name,
						x: midX,
						y: midY,
						...(hint ? { hint } : {}),
						...(icon ? { icon } : {}),
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

				if (showRealmIntro) {
					setShowRealmIntro(false);
					try {
						localStorage.setItem(introStorageKey, '1');
					} catch {
						// ignore storage failures
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
			} else if (!isComputerAction) {
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
			} else {
				// Computer action but no result - just bounce back without shake
				const dx = draggedEl.x - targetEl.x;
				const dy = draggedEl.y - targetEl.y;
				const dist = Math.sqrt(dx * dx + dy * dy) || 1;
				const pushForce = 40;
				const moveX = (dx / dist) * pushForce;
				const moveY = (dy / dist) * pushForce;

				setTimeout(() => {
					setElements((prev) =>
						prev.map((el) => {
							if (el.id === draggedEl.id) return { ...el, x: el.x + moveX, y: el.y + moveY };
							if (el.id === targetEl.id) return { ...el, x: el.x - moveX, y: el.y - moveY };
							return el;
						})
					);
				}, 50);
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

	const onPaletteWheel = (e: React.WheelEvent) => {
		if (pages.length <= 1) return;
		if (wheelTimeout.current !== null) return;

		const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
		
		if (Math.abs(delta) > 5) {
			if (delta > 0 && currentPage < pages.length - 1) {
				setCurrentPage((p) => p + 1);
				wheelTimeout.current = window.setTimeout(() => { wheelTimeout.current = null; }, 250);
			} else if (delta < 0 && currentPage > 0) {
				setCurrentPage((p) => p - 1);
				wheelTimeout.current = window.setTimeout(() => { wheelTimeout.current = null; }, 250);
			}
		}
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

	const nextKeyItem = ruleset.keyItems.find((item) => !discovered.includes(item));
	const totalElementsCount = Object.keys(ruleset.elementStyles).length;

	const starDrops = useRef(Array.from({ length: 20 }).map(() => ({
		top: `${Math.random() * 100}%`,
		left: `${Math.random() * 100}%`,
		width: `${Math.random() * 3 + 2}px`,
		height: `${Math.random() * 3 + 2}px`,
		animationDelay: `${Math.random() * 2}s`
	})));
	const snowBackdropFlakes = useRef<SnowBackdropFlakeStyle[]>(createSnowBackdropFlakes());
	const snowPaletteHills = useRef<CSSProperties[]>(createSnowPaletteHills());
	const hasStar = elements.some(el => el.name === 'star');
	const hasSnow = elements.some(el => el.name === 'snow');

	return (
		<div
			className="realm-page-plain flex h-screen w-screen flex-col overflow-hidden bg-main text-primary font-sans select-none touch-none"
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
		>
			{/* Worktable Area */}
			<div
				ref={containerRef}
				className={`relative flex-1 bg-table-gradient ${isPlaytest ? 'pt-8' : ''}`}
			>
				{isPlaytest && (
					<div className="catalog-title-font absolute inset-x-0 top-0 z-[5000] flex items-center justify-between gap-3 border-b border-cyan-300/20 bg-slate-950/92 px-4 py-1.5 text-xs font-bold text-cyan-50 shadow-[0_10px_24px_rgba(2,6,23,0.35)] backdrop-blur-xl">
						<span>Playtesting draft mod</span>
						<button
							onClick={(event) => {
								localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
								if (ruleset.sourceModId) {
									setEditorTargetModId(ruleset.sourceModId);
								}
								openEntry(event.nativeEvent, 'mod-editor');
							}}
							className="cursor-pointer rounded-full border border-cyan-200/25 bg-cyan-400/12 px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-50 transition-colors hover:bg-cyan-400/20"
						>
							Return to Editor
						</button>
					</div>
				)}
				{hasStorm && (
					<div className="absolute inset-0 z-[1] pointer-events-none bg-slate-950/35 transition-opacity duration-700" />
				)}
				{hasSnow && (
					<div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
						<div className="snow-backdrop-mist absolute inset-0" />
						{snowBackdropFlakes.current.map((style, i) => (
							<div
								key={`snow-bg-${i}`}
								className="snow-backdrop-flake absolute rounded-full"
								style={style}
							/>
						))}
					</div>
				)}
				{hasStar && (
					<div className="absolute inset-0 pointer-events-none overflow-hidden mix-blend-screen">
						{starDrops.current.map((style, i) => (
							<div
								key={`star-${i}`}
								className="absolute bg-white rounded-full animate-pulse shadow-[0_0_10px_2px_rgba(255,255,255,0.8)]"
								style={style}
							/>
						))}
					</div>
				)}
				{stormFlashVisible && (
					<div className="storm-flash absolute inset-0 z-10 pointer-events-none" />
				)}
				{/* Background Decoration */}
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none overflow-hidden mt-[-10%]">
					<span className="text-[60vh] font-serif leading-none">☿</span>
				</div>
				{hasSnow && (
					<div className="absolute inset-x-0 bottom-0 z-[8] h-24 pointer-events-none overflow-visible">
						<div className="snow-palette-glow absolute inset-x-0 bottom-0 h-16" />
						<div className="snow-palette-ridge absolute inset-x-0 bottom-0 h-3" />
						{snowPaletteHills.current.map((style, i) => (
							<div
								key={`snow-hill-${i}`}
								className="snow-palette-hill absolute bottom-0"
								style={style}
							/>
						))}
					</div>
				)}
				<div className="absolute inset-x-0 top-12 z-10 flex flex-col items-center px-6 text-center pointer-events-none">
					{showRealmIntro ? (
						<div className="max-w-3xl rounded-[2rem] border border-white/8 bg-slate-950/18 px-6 py-5 shadow-[0_14px_44px_rgba(15,23,42,0.18)] backdrop-blur-sm">
							<h1 className="mb-3 text-2xl font-black tracking-tight text-primary opacity-65">
								{ruleset.title}
							</h1>
							<p className="text-base leading-relaxed text-slate-100/72 sm:text-xl">
								{ruleset.intro}
							</p>
						</div>
					) : ruleset.kind === 'base' && discovered.length === 4 ? (
						<h2 className="text-2xl font-black tracking-tight text-primary animate-bounce-subtle">
							Welcome to the Alchemy! Drag elements here to combine them and create the world!
						</h2>
					) : ruleset.kind === 'base' ? (
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
					) : (
						<h1 className="text-xl font-bold tracking-tight text-primary opacity-60">
							{ruleset.title}
						</h1>
					)}
				</div>

				<button
					onClick={() => setShowOptions(true)}
					className="realm-button-muted absolute right-2 top-2 z-30 cursor-pointer rounded-full p-2 transition-colors shadow-lg backdrop-blur-sm"
					title="Options"
				>
					<IoSettingsSharp size={24} />
				</button>
			</div>

			{/* Palette Area */}
			<div className="realm-panel relative z-10 flex h-60 flex-col overflow-hidden border-t border-palette bg-palette">
				<div className="pt-3 px-4 pb-1 relative z-10">
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
					className="flex-1 overflow-hidden relative z-10"
					style={{ height: 0 }}
					onPointerDown={(e) => onPaletteDown(e)}
					onPointerMove={onPaletteMove}
					onPointerUp={onPaletteUp}
					onWheel={onPaletteWheel}
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
								{page.map((name) => (
									<div
										key={`${pageIdx}-${name}`}
										className="relative h-full active:scale-95 cursor-pointer"
										onPointerDown={(e) => {
											e.stopPropagation();
											onPaletteDown(e, name);
										}}
									>
										{renderElementWidget(name)}
									</div>
								))}
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
					<div className="relative z-10 flex justify-center gap-2 pb-3">
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
					const isExploding = explodingIDs[el.id];
					const pushVector = pushedElements[el.id];
					const motionClass = isExploding
						? 'animate-explode-shake z-[150]'
						: pushVector
							? 'animate-push-out'
							: isQuaking
								? 'animate-earthquake'
								: isShaking
									? 'animate-shake'
									: '';

					return (
						<div
							key={el.id}
							className={`absolute h-20 w-20 ml-[-40px] mt-[-40px] pointer-events-auto select-none touch-none ${isDragging ? 'z-[100] cursor-grabbing scale-110' : 'z-50 cursor-grab'} ${motionClass} ${!isDragging && !isExploding && !pushVector ? 'element-transition' : ''}`}
							style={{
								left: el.x,
								top: el.y,
								'--push-x': pushVector ? `${pushVector.x}px` : '0px',
								'--push-y': pushVector ? `${pushVector.y}px` : '0px',
							} as any}
							onPointerDown={(e) => handlePointerDown(e, el.id)}
						>
							{renderElementWidget(el.name, 'large', false, isReactive, el.icon)}

							{/* Scientist Hint Bubble */}
							{el.hint && hasElementEffect(el.name, 'hint') && (
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
								<span className="text-lg font-bold text-primary">{authorUsername}</span>
							</div>
							<a href="https://www.flaticon.com/free-icons/sand" title="sand icons">Sand icons created by Freepik - Flaticon</a>

							<div className="h-px bg-white/10" />

							<div className="space-y-3">
								{isAuthor && ruleset.sourceModId && (
									<button
										onClick={(event) => {
											setEditorTargetModId(ruleset.sourceModId ?? null);
											localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
											setShowOptions(false);
											openEntry(event.nativeEvent, 'mod-editor');
										}}
										className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3 font-bold text-slate-950 transition-all hover:scale-[1.02] active:scale-95 shadow-lg"
									>
										<IoCreateOutline />
										Edit Realm
									</button>
								)}

								<button
									onClick={() => {
										if (!confirmWipe) {
											setConfirmWipe(true);
											return;
										}
										const basic = ruleset.startingElements;
										setDiscovered(basic);
										setElements([]);
										setCurrentPage(0);
										localStorage.setItem(storageKeys.discovered, JSON.stringify(basic));
										localStorage.setItem(storageKeys.elements, JSON.stringify([]));
										localStorage.setItem(storageKeys.page, '0');
										localStorage.removeItem(introStorageKey);
										setShowRealmIntro(Boolean(ruleset.intro.trim()));
										if (!isPlaytest) {
											trpc.progress.save.mutate({ discovered: basic, progressScope }).catch(console.error);
										}
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

								{isAuthor && (
									<button
										onClick={() => {
											const allElements = Object.keys(ruleset.elementStyles);
											setDiscovered(allElements);
											if (!isPlaytest) {
												trpc.progress.save.mutate({ discovered: allElements, progressScope }).catch(console.error);
											}
											setShowOptions(false);
										}}
										className="w-full cursor-pointer rounded-xl bg-[var(--button-primary)] py-3 font-bold text-white transition-all hover:bg-[var(--button-primary-hover)] hover:scale-[1.02] active:scale-95 shadow-lg"
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
									className={`relative flex h-32 w-32 items-center justify-center rounded-2xl border-4 ${ruleset.elementStyles[discoveryPopup] ?? 'bg-gray-300 border-gray-500'} shadow-2xl rotate-3`}
								>
									{(() => {
										const rawIcon = ruleset.elementIcons[discoveryPopup];
										const Icon = Array.isArray(rawIcon) ? rawIcon[0] : rawIcon;
										const colorClass = ruleset.elementStyles[discoveryPopup] ?? 'bg-gray-300 border-gray-500';
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
												<div className={weight < 500 ? 'text-black/50' : 'text-white/50'}>
													<IconComp size={80} />
												</div>
											);
										}
										return null;
									})()}
								</div>
							</div>

							<div className="space-y-4 mb-8 px-2">
								<p className="text-lg text-white font-medium leading-relaxed italic">
									"{ruleset.keyItemData[discoveryPopup]?.description}"
								</p>
								<p className="text-blue-200 text-sm opacity-90 leading-snug">
									{ruleset.keyItemData[discoveryPopup]?.motivation}
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

			{/* Computer Popup */}
			{computerPopup && (
				<div className="absolute inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-xl animate-fade-in">
					<div className="relative w-full max-w-lg mx-4 max-h-[90vh] rounded-[2rem] bg-[#0f172a] p-8 shadow-[0_0_100px_rgba(30,144,255,0.2)] border border-blue-500/20 animate-scale-in text-white flex flex-col">
						{/* Glow effects */}
						<div className="absolute -top-32 -left-32 w-64 h-64 bg-blue-600/10 rounded-full blur-[100px]" />
						<div className="absolute -bottom-32 -right-32 w-64 h-64 bg-cyan-600/10 rounded-full blur-[100px]" />

						<button
							onClick={() => setComputerPopup(null)}
							className="absolute right-6 top-6 p-2 text-blue-300/50 hover:text-white transition-colors cursor-pointer z-20"
						>
							<IoCloseSharp size={28} />
						</button>

						<div className="relative z-10 flex flex-col h-full overflow-hidden">
							<div className="flex-shrink-0">
								<div className="flex items-center justify-center gap-6 mb-8">
									<div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-900/30 border border-blue-400/30 shadow-[0_0_20px_rgba(59,130,246,0.2)]">
										<span className="text-5xl drop-shadow-lg">💻</span>
									</div>
									<div className="h-px w-8 bg-blue-400/20" />
									<div
										className={`flex h-20 w-20 items-center justify-center rounded-2xl border-2 ${ruleset.elementStyles[computerPopup] ?? 'bg-gray-300 border-gray-500'} shadow-xl`}
									>
										{(() => {
											const rawIcon = ruleset.elementIcons[computerPopup];
											const Icon = Array.isArray(rawIcon) ? rawIcon[0] : rawIcon;
											const colorClass = ruleset.elementStyles[computerPopup] ?? 'bg-gray-300 border-gray-500';
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
													<div className={weight < 500 ? 'text-black/50' : 'text-white/50'}>
														<IconComp size={40} />
													</div>
												);
											}
											return null;
										})()}
									</div>
								</div>

								<h3 className="text-center text-3xl font-black mb-1 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cyan-200">
									{getElementDisplayName(computerPopup)}
								</h3>
								<p className="text-center text-blue-300/60 text-sm font-medium uppercase tracking-[0.2em] mb-8">
									Reaction Database
								</p>
							</div>

							<div className="flex-1 overflow-hidden min-h-0 flex flex-col">
								<div className="bg-black/40 rounded-2xl border border-white/5 overflow-y-auto custom-scrollbar flex-1 min-h-0">
									<div className="divide-y divide-white/5">
										{getRecipesForElementInRuleset(ruleset, computerPopup).length === 0 && (
											<div className="py-12 px-6 text-center">
												<p className="text-blue-300/40 text-sm font-bold uppercase tracking-widest italic">
													Primary Elemental Force
												</p>
												<p className="text-blue-400/20 text-[10px] mt-2">
													This element exists since the beginning of time.<br />No synthesis patterns detected.
												</p>
											</div>
										)}
										{getRecipesForElementInRuleset(ruleset, computerPopup).map((recipe, idx) => {
											const a = recipe[0];
											const b = recipe[1];
											if (!a || !b) return null;

											const aFound = discovered.includes(a);
											const bFound = discovered.includes(b);

											return (
												<div key={idx} className="flex items-center justify-center gap-4 py-8 px-4 hover:bg-white/5 transition-colors">
													<div className="h-16 w-16">
														{renderElementWidget(a, 'small', !aFound)}
													</div>
													<span className="text-blue-400 font-black text-2xl drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]">+</span>
													<div className="h-16 w-16">
														{renderElementWidget(b, 'small', !bFound)}
													</div>
													<span className="text-blue-400 font-black text-2xl drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]">=</span>
													<div className="h-16 w-16">
														{renderElementWidget(computerPopup, 'small')}
													</div>
												</div>
											);
										})}
									</div>
								</div>
							</div>

							<div className="flex-shrink-0 mt-8">
								<button
									onClick={() => setComputerPopup(null)}
									className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 py-4 font-bold text-white shadow-lg shadow-blue-900/40 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
								>
									CLOSE DATABASE
								</button>
							</div>
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
							<h3 className="mb-4 text-2xl font-bold text-white">
								{getElementDisplayName(infoPopup)}
							</h3>

							<div className="flex justify-center mb-6">
								<div
									className={`flex h-20 w-20 items-center justify-center rounded-xl border-2 ${ruleset.elementStyles[infoPopup] ?? 'bg-gray-300 border-gray-500'} shadow-lg`}
								>
									{(() => {
										const rawIcon = ruleset.elementIcons[infoPopup];
										const Icon = Array.isArray(rawIcon) ? rawIcon[0] : rawIcon;
										const colorClass = ruleset.elementStyles[infoPopup] ?? 'bg-gray-300 border-gray-500';
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
												<div className={weight < 500 ? 'text-black/50' : 'text-white/50'}>
													<IconComp size={40} />
												</div>
											);
										}
										return null;
									})()}
								</div>
							</div>

							<p className="text-sm text-slate-300 leading-relaxed mb-6 px-4">
								{ruleset.elementMessages[infoPopup]}
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

const GameRoot = () => {
	const [state, setState] = useState<
		| {
				status: 'loading';
		  }
		| {
				status: 'unavailable';
				message: string;
		  }
		| {
				status: 'ready';
				ruleset: ActiveRuleset;
				username: string | null;
				redditDiscovered: string[];
				progressScope: string;
				isPlaytest: boolean;
		  }
	>({ status: 'loading' });

	useEffect(() => {
		const playtestRuleset = readPlaytestRuleset();
		if (playtestRuleset) {
			setState({
				status: 'ready',
				ruleset: playtestRuleset,
				username: context.username ?? null,
				redditDiscovered: [],
				progressScope: getProgressScope(playtestRuleset),
				isPlaytest: true,
			});
			return;
		}

		let overrideModId: string | undefined;
		try {
			overrideModId = localStorage.getItem('override-mod-id') ?? undefined;
		} catch (e) {
			// ignore
		}

		trpc.init.get
			.query(overrideModId ? { modId: overrideModId } : undefined)
			.then((response) => {
				if (response.rulesetUnavailableReason) {
					setState({
						status: 'unavailable',
						message: response.rulesetUnavailableReason,
					});
					return;
				}

				setState({
					status: 'ready',
					ruleset: response.activeRuleset ?? BASE_RULESET,
					username: response.username ?? null,
					redditDiscovered: response.redditDiscovered ?? [],
					progressScope: response.progressScope,
					isPlaytest: false,
				});
			})
			.catch((error) => {
				console.error(error);
				setState({
					status: 'ready',
					ruleset: BASE_RULESET,
					username: context.username ?? null,
					redditDiscovered: [],
					progressScope: 'base',
					isPlaytest: false,
				});
			});
	}, []);

	if (state.status === 'loading') {
		return (
			<div className="realm-page-plain flex min-h-screen items-center justify-center">
				<div className="realm-panel rounded-3xl px-6 py-5 text-center backdrop-blur-xl">
					<div className="catalog-title-font realm-text-muted text-xs font-bold uppercase tracking-[0.24em]">Alchemy</div>
					<div className="mt-2 text-lg font-black">Loading ruleset...</div>
				</div>
			</div>
		);
	}

	if (state.status === 'unavailable') {
		return (
			<div className="realm-page-plain flex min-h-screen items-center justify-center px-4">
				<div className="realm-panel max-w-md rounded-3xl p-8 text-center backdrop-blur-xl">
					<div className="catalog-title-font realm-text-muted text-xs font-bold uppercase tracking-[0.24em]">Mod Unavailable</div>
					<h1 className="catalog-title-font realm-text-ink mt-2 text-3xl font-black">This shared mod cannot be loaded here.</h1>
					<p className="realm-text-soft mt-4 text-sm leading-relaxed">{state.message}</p>
				</div>
			</div>
		);
	}

	return (
		<GameSession
			key={state.ruleset.storageScope}
			ruleset={state.ruleset}
			initialUsername={state.username}
			initialDiscovered={state.redditDiscovered}
			progressScope={state.progressScope}
			isPlaytest={state.isPlaytest}
		/>
	);
};

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<GameRoot />
	</StrictMode>
);
