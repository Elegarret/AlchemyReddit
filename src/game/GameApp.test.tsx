import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GameElementTile } from './GameApp';
import { getReactionClusterPositions } from './reaction-cluster';

vi.mock('@devvit/web/client', () => ({
	context: { username: null },
	showToast: vi.fn(),
}));

vi.mock('../trpc', () => ({
	trpc: {
		init: {
			get: {
				query: vi.fn(),
			},
		},
	},
}));

vi.mock('../webview-navigation', () => ({
	openEntry: vi.fn(),
	setEditorTargetModId: vi.fn(),
}));

vi.mock('./playtest', () => ({
	readPlaytestRuleset: vi.fn(),
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

const getRequiredElement = (parent: ParentNode, selector: string) => {
	const node = parent.querySelector(selector);
	if (!(node instanceof HTMLElement)) {
		throw new Error(`Expected element for selector ${selector}`);
	}
	return node;
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
});

afterAll(() => {
	restoreProperty('clientWidth', originalClientWidth);
	restoreProperty('scrollWidth', originalScrollWidth);
	restoreProperty('clientHeight', originalClientHeight);
	restoreProperty('scrollHeight', originalScrollHeight);
});

afterEach(() => {
	document.body.innerHTML = '';
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
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
