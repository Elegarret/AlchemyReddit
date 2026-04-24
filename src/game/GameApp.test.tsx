import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BASE_RULESET } from '../modding/base-ruleset';
import type { ActiveRuleset } from '../modding/types';
import { GameElementTile, GameRoot } from './GameApp';
import { getReactionClusterPositions } from './reaction-cluster';

const {
	clientContextMock,
	getPublishedQueryMock,
	initGetQueryMock,
	navigateToMock,
	openEntryMock,
	progressSaveMutateMock,
	readPlaytestRulesetMock,
	setEditorTargetModIdMock,
	showShareSheetMock,
	showToastMock,
} = vi.hoisted(() => ({
	clientContextMock: {
		postId: 't3_currentpost',
		username: null as string | null,
	},
	getPublishedQueryMock: vi.fn(),
	initGetQueryMock: vi.fn(),
	navigateToMock: vi.fn(),
	openEntryMock: vi.fn(),
	progressSaveMutateMock: vi.fn(),
	readPlaytestRulesetMock: vi.fn(),
	setEditorTargetModIdMock: vi.fn(),
	showShareSheetMock: vi.fn(),
	showToastMock: vi.fn(),
}));

vi.mock('@devvit/web/client', () => ({
	context: clientContextMock,
	navigateTo: navigateToMock,
	showShareSheet: showShareSheetMock,
	showToast: showToastMock,
}));

vi.mock('../trpc', () => ({
	trpc: {
		init: {
			get: {
				query: initGetQueryMock,
			},
		},
		mods: {
			getPublished: {
				query: getPublishedQueryMock,
			},
		},
		progress: {
			save: {
				mutate: progressSaveMutateMock,
			},
		},
	},
}));

vi.mock('../webview-navigation', () => ({
	openEntry: openEntryMock,
	setEditorTargetModId: setEditorTargetModIdMock,
}));

vi.mock('./playtest', () => ({
	readPlaytestRuleset: readPlaytestRulesetMock,
}));

const getLabelMetrics = (node: HTMLElement) => {
	if (node.dataset.elementLabel !== 'true') {
		return null;
	}

	const mode = node.dataset.elementLabelMode;
	const length = (node.textContent ?? '').trim().length;

	if (mode === 'default') {
		return {
			clientHeight: 16,
			clientWidth: 84,
			scrollHeight: 16,
			scrollWidth: length <= 10 ? 84 : 140,
		};
	}

	if (mode === 'expanded') {
		return {
			clientHeight: 34,
			clientWidth: 84,
			scrollHeight: length <= 26 ? 34 : 46,
			scrollWidth: 84,
		};
	}

	return {
		clientHeight: 32,
		clientWidth: 84,
		scrollHeight: length <= 44 ? 32 : 46,
		scrollWidth: 84,
	};
};

const createModRuleset = (): ActiveRuleset => ({
	...BASE_RULESET,
	kind: 'mod',
	rulesetId: 'mod-1',
	title: 'Storm Lab',
	summary: 'A custom realm.',
	storageScope: 'mod:mod-1',
	sourceModId: 'mod-1',
	ownerUsername: 'realmowner',
	publishedAt: '2026-03-01T00:00:00.000Z',
});

const createInitResponse = (overrides?: Record<string, unknown>) => ({
	activeModListing: null,
	activeRuleset: BASE_RULESET,
	isModerator: false,
	postId: clientContextMock.postId,
	progressScope: BASE_RULESET.storageScope,
	redditDiscovered: [],
	rulesetUnavailableReason: null,
	username: null,
	...overrides,
});

getPublishedQueryMock.mockResolvedValue(null);
initGetQueryMock.mockResolvedValue(createInitResponse());
progressSaveMutateMock.mockResolvedValue({ success: true });
readPlaytestRulesetMock.mockReturnValue(null);

const getRequiredElement = (parent: ParentNode, selector: string) => {
	const node = parent.querySelector(selector);
	if (!(node instanceof HTMLElement)) {
		throw new Error(`Expected element for selector ${selector}`);
	}
	return node;
};

const getButtonByText = (parent: ParentNode, label: string) =>
	Array.from(document.querySelectorAll('button')).find(
		(button) => button.textContent?.trim() === label
	) ?? null;

const clickElement = async (element: HTMLElement) => {
	await act(async () => {
		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	});
};

const focusElement = async (element: HTMLElement) => {
	await act(async () => {
		element.focus();
	});
};

const renderTile = async (props: {
	displayName: string;
	size: 'small' | 'large';
}) => {
	const container = document.createElement('div');
	document.body.appendChild(container);
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<GameElementTile
				colorClass="bg-blue-500 border-blue-700"
				displayName={props.displayName}
				icon="A"
				lightGlow=""
				reactiveClasses=""
				showOverlay={true}
				size={props.size}
				style={{}}
				weight={500}
			/>
		);
	});

	await act(async () => {
		await Promise.resolve();
	});

	return {
		container,
		icon: getRequiredElement(container, '[data-element-icon="true"]'),
		label: getRequiredElement(container, '[data-element-label="true"]'),
		root: getRequiredElement(container, 'div'),
		unmount: async () => {
			await act(async () => {
				root.unmount();
			});
		},
	};
};

const renderGameRoot = async () => {
	const container = document.createElement('div');
	document.body.appendChild(container);
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	const root = createRoot(container);

	await act(async () => {
		root.render(<GameRoot />);
	});

	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});

	return {
		container,
		unmount: async () => {
			await act(async () => {
				root.unmount();
			});
		},
	};
};

const originalClientWidth = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	'clientWidth'
);
const originalScrollWidth = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	'scrollWidth'
);
const originalClientHeight = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	'clientHeight'
);
const originalScrollHeight = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	'scrollHeight'
);
const originalMatchMedia = window.matchMedia;
let hoverMatches = true;

const restoreProperty = (
	name: 'clientWidth' | 'scrollWidth' | 'clientHeight' | 'scrollHeight',
	descriptor: PropertyDescriptor | undefined
) => {
	if (descriptor) {
		Object.defineProperty(HTMLElement.prototype, name, descriptor);
		return;
	}

	delete HTMLElement.prototype[name];
};

beforeAll(() => {
	Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
		configurable: true,
		get() {
			const metrics = getLabelMetrics(this);
			if (metrics) {
				return metrics.clientWidth;
			}
			return originalClientWidth?.get?.call(this) ?? 0;
		},
	});

	Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
		configurable: true,
		get() {
			const metrics = getLabelMetrics(this);
			if (metrics) {
				return metrics.scrollWidth;
			}
			return originalScrollWidth?.get?.call(this) ?? 0;
		},
	});

	Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
		configurable: true,
		get() {
			const metrics = getLabelMetrics(this);
			if (metrics) {
				return metrics.clientHeight;
			}
			return originalClientHeight?.get?.call(this) ?? 0;
		},
	});

	Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
		configurable: true,
		get() {
			const metrics = getLabelMetrics(this);
			if (metrics) {
				return metrics.scrollHeight;
			}
			return originalScrollHeight?.get?.call(this) ?? 0;
		},
	});

	Object.defineProperty(window, 'matchMedia', {
		configurable: true,
		writable: true,
		value: vi.fn((query: string) => ({
			matches: query === '(hover: hover)' ? hoverMatches : false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});
});

afterAll(() => {
	restoreProperty('clientWidth', originalClientWidth);
	restoreProperty('scrollWidth', originalScrollWidth);
	restoreProperty('clientHeight', originalClientHeight);
	restoreProperty('scrollHeight', originalScrollHeight);

	if (originalMatchMedia) {
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			writable: true,
			value: originalMatchMedia,
		});
		return;
	}

	Object.defineProperty(window, 'matchMedia', {
		configurable: true,
		writable: true,
		value: undefined,
	});
});

afterEach(() => {
	document.body.innerHTML = '';
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
	clientContextMock.postId = 't3_currentpost';
	clientContextMock.username = null;
	hoverMatches = true;
	getPublishedQueryMock.mockReset();
	getPublishedQueryMock.mockResolvedValue(null);
	initGetQueryMock.mockReset();
	initGetQueryMock.mockResolvedValue(createInitResponse());
	navigateToMock.mockReset();
	openEntryMock.mockReset();
	progressSaveMutateMock.mockReset();
	progressSaveMutateMock.mockResolvedValue({ success: true });
	readPlaytestRulesetMock.mockReset();
	readPlaytestRulesetMock.mockReturnValue(null);
	setEditorTargetModIdMock.mockReset();
	showShareSheetMock.mockReset();
	showToastMock.mockReset();
	localStorage.clear();
	sessionStorage.clear();
});

describe('GameElementTile', () => {
	it('keeps the original palette tile layout for short names', async () => {
		const tile = await renderTile({ displayName: 'Water', size: 'small' });

		expect(tile.label.dataset.elementLabelMode).toBe('default');
		expect(tile.label.className).toContain('truncate');
		expect(tile.label.className).toContain('text-[10px]');
		expect(tile.icon.className).toContain('pb-3');
		expect(tile.root.getAttribute('title')).toBeNull();

		await tile.unmount();
	});

	it('keeps the original board tile layout for short names', async () => {
		const tile = await renderTile({ displayName: 'Mountain', size: 'large' });

		expect(tile.label.dataset.elementLabelMode).toBe('default');
		expect(tile.label.className).toContain('truncate');
		expect(tile.label.className).toContain('text-[11px]');
		expect(tile.icon.className).toContain('pb-5');
		expect(tile.root.getAttribute('title')).toBeNull();

		await tile.unmount();
	});

	it('expands palette tiles to two lines when the name no longer fits', async () => {
		const tile = await renderTile({
			displayName: 'Crystal Garden',
			size: 'small',
		});

		expect(tile.label.dataset.elementLabelMode).toBe('expanded');
		expect(tile.label.className).toContain('line-clamp-2');
		expect(tile.icon.className).toContain('pb-5');
		expect(tile.root.getAttribute('title')).toBeNull();

		await tile.unmount();
	});

	it('expands board tiles to two lines before shrinking the font', async () => {
		const tile = await renderTile({
			displayName: 'Ancient Forest Spirit',
			size: 'large',
		});

		expect(tile.label.dataset.elementLabelMode).toBe('expanded');
		expect(tile.label.className).toContain('line-clamp-2');
		expect(tile.label.className).toContain('text-[11px]');
		expect(tile.icon.className).toContain('pb-7');
		expect(tile.root.getAttribute('title')).toBeNull();

		await tile.unmount();
	});

	it('shrinks the font slightly for very long names that still overflow in two lines', async () => {
		const tile = await renderTile({
			displayName: 'Hyperdimensional Planetary Forge Reactor',
			size: 'large',
		});

		expect(tile.label.dataset.elementLabelMode).toBe('compact');
		expect(tile.label.className).toContain('line-clamp-2');
		expect(tile.label.className).toContain('text-[10px]');
		expect(tile.root.getAttribute('title')).toBeNull();

		await tile.unmount();
	});

	it('adds the full-name tooltip only when the final compact label still truncates', async () => {
		const displayName =
			'Hyperdimensional Planetary Forge Reactor of the Celestial Foundry';
		const tile = await renderTile({
			displayName,
			size: 'large',
		});

		expect(tile.label.dataset.elementLabelMode).toBe('compact');
		expect(tile.root.getAttribute('title')).toBe(displayName);

		await tile.unmount();
	});
});

describe('GameRoot realm menu', () => {
	it('renders the Mercury trigger, opens the menu, and offsets the glyph upward', async () => {
		const game = await renderGameRoot();
		const trigger = getRequiredElement(
			game.container,
			'button[aria-label="Open realm menu"]'
		);

		expect(trigger.textContent).toContain('☿');
		expect(trigger.querySelector('span')?.className).toContain('-top-[4px]');

		await focusElement(trigger);

		expect(getButtonByText(game.container, 'Alchemy Hub')).toBeTruthy();
		expect(getButtonByText(game.container, 'Create my Alchemy!')).toBeTruthy();

		await game.unmount();
	});

	it('shows legacy Comments for the base game and opens the hardcoded post', async () => {
		const game = await renderGameRoot();
		const trigger = getRequiredElement(
			game.container,
			'button[aria-label="Open realm menu"]'
		);

		await clickElement(trigger);

		const commentsButton = getButtonByText(game.container, 'Comments');
		expect(commentsButton).toBeTruthy();

		await clickElement(commentsButton!);

		expect(navigateToMock).toHaveBeenCalledWith(
			'https://www.reddit.com/r/AlchemyGame/comments/1qwhma7/alchemygame/'
		);

		await game.unmount();
	});

	it('shows Comments for a published mod realm and uses its share post id', async () => {
		initGetQueryMock.mockResolvedValue(
			createInitResponse({
				activeModListing: { sharePostId: 't3_sharepost' },
				activeRuleset: createModRuleset(),
			})
		);

		const game = await renderGameRoot();
		const trigger = getRequiredElement(
			game.container,
			'button[aria-label="Open realm menu"]'
		);

		await clickElement(trigger);
		await clickElement(getButtonByText(game.container, 'Comments')!);

		expect(navigateToMock).toHaveBeenCalledWith(
			'https://www.reddit.com/comments/sharepost/'
		);

		await game.unmount();
	});

	it('shows Share for a published mod realm and opens the native share sheet', async () => {
		initGetQueryMock.mockResolvedValue(
			createInitResponse({
				activeModListing: { sharePostId: 't3_sharepost' },
				activeRuleset: createModRuleset(),
			})
		);

		const game = await renderGameRoot();
		const trigger = getRequiredElement(
			game.container,
			'button[aria-label="Open realm menu"]'
		);

		await clickElement(trigger);
		await clickElement(getButtonByText(game.container, 'Share')!);

		expect(showShareSheetMock).toHaveBeenCalledWith({
			title: 'Storm Lab',
			text: 'https://www.reddit.com/comments/sharepost/',
			data: 'https://www.reddit.com/comments/sharepost/',
		});

		await game.unmount();
	});

	it('hides Comments when the current post is already the target share post', async () => {
		clientContextMock.postId = 't3_sharepost';
		initGetQueryMock.mockResolvedValue(
			createInitResponse({
				activeModListing: { sharePostId: 't3_sharepost' },
				activeRuleset: createModRuleset(),
				postId: 't3_sharepost',
			})
		);

		const game = await renderGameRoot();
		const trigger = getRequiredElement(
			game.container,
			'button[aria-label="Open realm menu"]'
		);

		await clickElement(trigger);

		expect(getButtonByText(game.container, 'Comments')).toBeNull();

		await game.unmount();
	});

	it('hides Comments for a mod realm without a share post', async () => {
		initGetQueryMock.mockResolvedValue(
			createInitResponse({
				activeRuleset: createModRuleset(),
			})
		);

		const game = await renderGameRoot();
		const trigger = getRequiredElement(
			game.container,
			'button[aria-label="Open realm menu"]'
		);

		await clickElement(trigger);

		expect(getButtonByText(game.container, 'Comments')).toBeNull();

		await game.unmount();
	});

	it('hides Comments in playtest mode', async () => {
		readPlaytestRulesetMock.mockReturnValue(createModRuleset());

		const game = await renderGameRoot();
		const trigger = getRequiredElement(
			game.container,
			'button[aria-label="Open realm menu"]'
		);

		await clickElement(trigger);

		expect(getButtonByText(game.container, 'Comments')).toBeNull();

		await game.unmount();
	});

	it('opens the catalog from Alchemy Hub and clears the editor target', async () => {
		const game = await renderGameRoot();
		const trigger = getRequiredElement(
			game.container,
			'button[aria-label="Open realm menu"]'
		);

		await clickElement(trigger);
		await clickElement(getButtonByText(game.container, 'Alchemy Hub')!);

		expect(setEditorTargetModIdMock).toHaveBeenCalledWith(null);
		expect(openEntryMock).toHaveBeenCalledWith(expect.any(MouseEvent), 'mod-catalog');

		await game.unmount();
	});

	it('opens the editor from Create my Alchemy! and clears the editor target', async () => {
		const game = await renderGameRoot();
		const trigger = getRequiredElement(
			game.container,
			'button[aria-label="Open realm menu"]'
		);

		await clickElement(trigger);
		await clickElement(getButtonByText(game.container, 'Create my Alchemy!')!);

		expect(setEditorTargetModIdMock).toHaveBeenCalledWith(null);
		expect(openEntryMock).toHaveBeenCalledWith(expect.any(MouseEvent), 'mod-editor');

		await game.unmount();
	});

	it('toggles the menu on touch devices and closes it after a selection', async () => {
		hoverMatches = false;

		const game = await renderGameRoot();
		const trigger = getRequiredElement(
			game.container,
			'button[aria-label="Open realm menu"]'
		);

		await clickElement(trigger);
		expect(getButtonByText(game.container, 'Alchemy Hub')).toBeTruthy();

		await clickElement(trigger);
		expect(getButtonByText(game.container, 'Alchemy Hub')).toBeNull();

		await clickElement(trigger);
		await clickElement(getButtonByText(game.container, 'Create my Alchemy!')!);

		expect(getButtonByText(game.container, 'Alchemy Hub')).toBeNull();

		await game.unmount();
	});
});

describe('getReactionClusterPositions', () => {
	it('keeps a single element centered', () => {
		expect(getReactionClusterPositions(120, 240, 1)).toEqual([
			{ x: 120, y: 240 },
		]);
	});

	it('widens the cluster radius as more elements are added', () => {
		const smallCluster = getReactionClusterPositions(0, 0, 3);
		const largeCluster = getReactionClusterPositions(0, 0, 6);
		const smallRadius = Math.hypot(
			smallCluster[0]?.x ?? 0,
			smallCluster[0]?.y ?? 0
		);
		const largeRadius = Math.hypot(
			largeCluster[0]?.x ?? 0,
			largeCluster[0]?.y ?? 0
		);

		expect(smallRadius).toBe(50);
		expect(largeRadius).toBeGreaterThan(smallRadius);
		expect(largeRadius).toBeCloseTo(80.214, 3);
	});
});
