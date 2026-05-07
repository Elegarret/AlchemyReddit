import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { BASE_RULESET } from '../modding/base-ruleset';
import { buildRulesetFromDraft, getLocalStorageKeys } from '../modding/runtime';
import type { ActiveRuleset } from '../modding/types';
import { GameElementTile, GameRoot } from './GameApp';
import {
  areBoardElementBoundsIntersecting,
  getBoundedBoardElementPosition,
  getEdgeBouncedBoardElementPosition,
} from './board-position';
import { getReactionClusterPositions } from './reaction-cluster';

const {
  clientContextMock,
  getPublishedQueryMock,
  initGetQueryMock,
  navigateToMock,
  openEntryMock,
  progressCompleteMutateMock,
  progressSaveMutateMock,
  readPlaytestRulesetMock,
  setEditorTargetModIdMock,
  showShareSheetMock,
  showToastMock,
  submitReviewMutateMock,
} = vi.hoisted(() => ({
  clientContextMock: {
    postId: 't3_currentpost',
    username: null as string | null,
  },
  getPublishedQueryMock: vi.fn(),
  initGetQueryMock: vi.fn(),
  navigateToMock: vi.fn(),
  openEntryMock: vi.fn(),
  progressCompleteMutateMock: vi.fn(),
  progressSaveMutateMock: vi.fn(),
  readPlaytestRulesetMock: vi.fn(),
  setEditorTargetModIdMock: vi.fn(),
  showShareSheetMock: vi.fn(),
  showToastMock: vi.fn(),
  submitReviewMutateMock: vi.fn(),
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
      submitReview: {
        mutate: submitReviewMutateMock,
      },
    },
    progress: {
      complete: {
        mutate: progressCompleteMutateMock,
      },
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
progressCompleteMutateMock.mockResolvedValue({ success: true });
progressSaveMutateMock.mockResolvedValue({ success: true });
readPlaytestRulesetMock.mockReturnValue(null);
submitReviewMutateMock.mockResolvedValue({ success: true });

const getRequiredElement = (parent: ParentNode, selector: string) => {
  const node = parent.querySelector(selector);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Expected element for selector ${selector}`);
  }
  return node;
};

const getButtonByText = (label: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === label
  ) ?? null;

const clickElement = async (element: HTMLElement) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const changeTextarea = async (textarea: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    if (!valueSetter) {
      throw new Error('Expected textarea value setter to exist.');
    }

    valueSetter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const dispatchPointerEvent = async (
  element: HTMLElement,
  type: 'pointerdown' | 'pointerup',
  position: {
    x: number;
    y: number;
  }
) => {
  await act(async () => {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: position.x,
      clientY: position.y,
    });
    Object.defineProperty(event, 'pointerId', {
      value: 1,
    });
    element.dispatchEvent(event);
    await Promise.resolve();
  });
};

const focusElement = async (element: HTMLElement) => {
  await act(async () => {
    element.focus();
  });
};

const renderTile = async (props: {
  displayName: string;
  icon?: string | null;
  shape?: 'plank' | 'tile';
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
        icon={props.icon === undefined ? 'A' : props.icon}
        lightGlow=""
        reactiveClasses=""
        {...(props.shape ? { shape: props.shape } : {})}
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

  const iconNode = container.querySelector('[data-element-icon="true"]');

  return {
    container,
    icon: iconNode instanceof HTMLElement ? iconNode : null,
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
const originalSetPointerCapture = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'setPointerCapture'
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

  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  restoreProperty('clientWidth', originalClientWidth);
  restoreProperty('scrollWidth', originalScrollWidth);
  restoreProperty('clientHeight', originalClientHeight);
  restoreProperty('scrollHeight', originalScrollHeight);
  if (originalSetPointerCapture) {
    Object.defineProperty(
      HTMLElement.prototype,
      'setPointerCapture',
      originalSetPointerCapture
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
  }

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
  progressCompleteMutateMock.mockReset();
  progressCompleteMutateMock.mockResolvedValue({ success: true });
  progressSaveMutateMock.mockReset();
  progressSaveMutateMock.mockResolvedValue({ success: true });
  readPlaytestRulesetMock.mockReset();
  readPlaytestRulesetMock.mockReturnValue(null);
  setEditorTargetModIdMock.mockReset();
  showShareSheetMock.mockReset();
  showToastMock.mockReset();
  submitReviewMutateMock.mockReset();
  submitReviewMutateMock.mockResolvedValue({ success: true });
  localStorage.clear();
  sessionStorage.clear();
});

describe('GameElementTile', () => {
  it('keeps the original palette tile layout for short names', async () => {
    const tile = await renderTile({ displayName: 'Water', size: 'small' });
    const icon = tile.icon;
    if (!icon) {
      throw new Error('Expected tile icon to render.');
    }

    expect(tile.label.dataset.elementLabelMode).toBe('default');
    expect(tile.label.className).toContain('truncate');
    expect(tile.label.className).toContain('text-[10px]');
    expect(icon.className).toContain('pb-3');
    expect(tile.root.getAttribute('title')).toBeNull();

    await tile.unmount();
  });

  it('keeps the original board tile layout for short names', async () => {
    const tile = await renderTile({ displayName: 'Mountain', size: 'large' });
    const icon = tile.icon;
    if (!icon) {
      throw new Error('Expected tile icon to render.');
    }

    expect(tile.label.dataset.elementLabelMode).toBe('default');
    expect(tile.label.className).toContain('truncate');
    expect(tile.label.className).toContain('text-[11px]');
    expect(icon.className).toContain('pb-5');
    expect(tile.root.getAttribute('title')).toBeNull();

    await tile.unmount();
  });

  it('expands palette tiles to two lines when the name no longer fits', async () => {
    const tile = await renderTile({
      displayName: 'Crystal Garden',
      size: 'small',
    });
    const icon = tile.icon;
    if (!icon) {
      throw new Error('Expected tile icon to render.');
    }

    expect(tile.label.dataset.elementLabelMode).toBe('expanded');
    expect(tile.label.className).toContain('line-clamp-2');
    expect(icon.className).toContain('pb-5');
    expect(tile.root.getAttribute('title')).toBeNull();

    await tile.unmount();
  });

  it('expands board tiles to two lines before shrinking the font', async () => {
    const tile = await renderTile({
      displayName: 'Ancient Forest Spirit',
      size: 'large',
    });
    const icon = tile.icon;
    if (!icon) {
      throw new Error('Expected tile icon to render.');
    }

    expect(tile.label.dataset.elementLabelMode).toBe('expanded');
    expect(tile.label.className).toContain('line-clamp-2');
    expect(tile.label.className).toContain('text-[11px]');
    expect(icon.className).toContain('pb-7');
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

  it('renders large no-icon board elements as planks without an icon layer', async () => {
    const tile = await renderTile({
      displayName: 'Storm Journal',
      icon: null,
      shape: 'plank',
      size: 'large',
    });

    expect(tile.icon).toBeNull();
    expect(tile.root.className).toContain('rounded-full');
    expect(tile.label.className).toContain('truncate');

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

    expect(getButtonByText('Alchemy Hub')).toBeTruthy();
    expect(getButtonByText('Create my Alchemy!')).toBeTruthy();

    await game.unmount();
  });

  it('shows legacy Comments for the base game and opens the hardcoded post', async () => {
    const game = await renderGameRoot();
    const trigger = getRequiredElement(
      game.container,
      'button[aria-label="Open realm menu"]'
    );

    await clickElement(trigger);

    const commentsButton = getButtonByText('Comments');
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
    await clickElement(getButtonByText('Comments')!);

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
    await clickElement(getButtonByText('Share')!);

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

    expect(getButtonByText('Comments')).toBeNull();

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

    expect(getButtonByText('Comments')).toBeNull();

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

    expect(getButtonByText('Comments')).toBeNull();

    await game.unmount();
  });

  it('opens the catalog from Alchemy Hub and clears the editor target', async () => {
    const game = await renderGameRoot();
    const trigger = getRequiredElement(
      game.container,
      'button[aria-label="Open realm menu"]'
    );

    await clickElement(trigger);
    await clickElement(getButtonByText('Alchemy Hub')!);

    expect(setEditorTargetModIdMock).toHaveBeenCalledWith(null);
    expect(openEntryMock).toHaveBeenCalledWith(
      expect.any(MouseEvent),
      'mod-catalog'
    );

    await game.unmount();
  });

  it('opens the editor from Create my Alchemy! and clears the editor target', async () => {
    const game = await renderGameRoot();
    const trigger = getRequiredElement(
      game.container,
      'button[aria-label="Open realm menu"]'
    );

    await clickElement(trigger);
    await clickElement(getButtonByText('Create my Alchemy!')!);

    expect(setEditorTargetModIdMock).toHaveBeenCalledWith(null);
    expect(openEntryMock).toHaveBeenCalledWith(
      expect.any(MouseEvent),
      'mod-editor'
    );

    await game.unmount();
  });

  it('records a published realm completion when every gameplay element is discovered', async () => {
    const completeRuleset: ActiveRuleset = {
      ...createModRuleset(),
      elementEffects: {},
      elementIcons: {},
      elementStyles: {
        air: 'bg-blue-400 border-blue-600',
        water: 'bg-sky-200 border-sky-400',
      },
      keyItemData: {},
      keyItems: [],
      recipes: {},
      startingElements: ['air', 'water'],
    };
    initGetQueryMock.mockResolvedValue(
      createInitResponse({
        activeRuleset: completeRuleset,
        progressScope: completeRuleset.storageScope,
        redditDiscovered: ['air', 'water'],
      })
    );

    const game = await renderGameRoot();

    expect(progressCompleteMutateMock).toHaveBeenCalledWith({
      modId: 'mod-1',
    });

    await game.unmount();
  });

  it('posts a completion review and opens the upvote prompt', async () => {
    const completeRuleset: ActiveRuleset = {
      ...createModRuleset(),
      elementEffects: {},
      elementIcons: {},
      elementStyles: {
        air: 'bg-blue-400 border-blue-600',
        water: 'bg-sky-200 border-sky-400',
      },
      keyItemData: {},
      keyItems: [],
      recipes: {},
      startingElements: ['air', 'water'],
    };
    initGetQueryMock.mockResolvedValue(
      createInitResponse({
        activeModListing: {
          sharePostId: 't3_sharepost',
        },
        activeRuleset: completeRuleset,
        progressScope: completeRuleset.storageScope,
        redditDiscovered: ['air', 'water'],
        username: 'playerone',
      })
    );

    const game = await renderGameRoot();
    const textarea = game.container.querySelector('textarea');
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error('Expected review textarea to render.');
    }
    expect(textarea.placeholder).toBe('Leave a review for r/realmowner');

    await changeTextarea(textarea, 'Loved the puzzle arc.');
    await clickElement(getButtonByText('Post review')!);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(submitReviewMutateMock).toHaveBeenCalledWith({
      modId: 'mod-1',
      text: 'Loved the puzzle arc.',
    });
    expect(document.body.textContent).toContain('Review Posted');
    expect(document.body.textContent).toContain('upvote it from Reddit');
    expect(getButtonByText('Back to the Realms List')).toBeTruthy();
    expect(getButtonByText('Continue')).toBeNull();

    await game.unmount();
  });

  it('opens the next actions popup when a completion review is skipped', async () => {
    const completeRuleset: ActiveRuleset = {
      ...createModRuleset(),
      elementEffects: {},
      elementIcons: {},
      elementStyles: {
        air: 'bg-blue-400 border-blue-600',
        water: 'bg-sky-200 border-sky-400',
      },
      keyItemData: {},
      keyItems: [],
      recipes: {},
      startingElements: ['air', 'water'],
    };
    initGetQueryMock.mockResolvedValue(
      createInitResponse({
        activeModListing: {
          sharePostId: 't3_sharepost',
        },
        activeRuleset: completeRuleset,
        progressScope: completeRuleset.storageScope,
        redditDiscovered: ['air', 'water'],
        username: 'playerone',
      })
    );

    const game = await renderGameRoot();

    await clickElement(getButtonByText('Skip')!);

    expect(document.body.textContent).toContain('What Next?');
    expect(getButtonByText('Reset progress and start over')).toBeTruthy();
    expect(getButtonByText('Back to the Realms List')).toBeTruthy();
    expect(getButtonByText('Create My Realm')).toBeTruthy();
    expect(game.container.querySelector('textarea')).toBeNull();

    await game.unmount();
  });

  it('renders always event messages when gameplay reactions advance a counter to the threshold', async () => {
    const noiseRuleset = buildRulesetFromDraft({
      title: 'Noise Realm',
      summary: 'Counter events should surface during gameplay.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [
        {
          elementId: 'noise',
          initial: 0,
        },
      ],
      events: [
        {
          condition: 'count(Noise) >= 1',
          mode: 'once',
          script: 'message "Noise starts."',
        },
        {
          condition: 'count(Noise) >= 3',
          mode: 'always',
          script: 'message "Noise is loud."',
        },
      ],
      showPalette: true,
      elements: [
        {
          bgColorToken: 'sky',
          effect: 'none',
          emoji: 'A',
          frameColorToken: 'ocean',
          iconSource: 'emoji',
          id: 'air',
          message: '',
          name: 'Air',
          nonConsumable: true,
        },
        {
          bgColorToken: 'ember',
          effect: 'none',
          emoji: 'F',
          frameColorToken: 'sun',
          iconSource: 'emoji',
          id: 'fire',
          message: '',
          name: 'Fire',
          nonConsumable: true,
        },
        {
          bgColorToken: 'violet',
          effect: 'none',
          emoji: 'N',
          frameColorToken: 'ocean',
          iconSource: 'emoji',
          id: 'noise',
          message: '',
          name: 'Noise',
          nonConsumable: false,
        },
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: [],
          script: 'set Noise += 1\nmessage "Base reaction."',
        },
      ],
    });
    initGetQueryMock.mockResolvedValue(
      createInitResponse({
        activeRuleset: noiseRuleset,
        progressScope: noiseRuleset.storageScope,
        redditDiscovered: ['air', 'fire'],
      })
    );
    localStorage.setItem(
      getLocalStorageKeys(noiseRuleset).elements,
      JSON.stringify([
        { id: 'table-air', name: 'air', x: 220, y: 220 },
        { id: 'table-fire', name: 'fire', x: 250, y: 220 },
      ])
    );

    const game = await renderGameRoot();
    const rootElement = getRequiredElement(game.container, '.realm-page-plain');
    const getBoardElement = (label: string) => {
      const element = Array.from(
        game.container.querySelectorAll(
          'div.absolute.pointer-events-auto.select-none.touch-none'
        )
      ).find((node) => node.textContent?.includes(label));
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Expected board element ${label}.`);
      }
      return element;
    };
    const runReaction = async () => {
      await dispatchPointerEvent(getBoardElement('Air'), 'pointerdown', {
        x: 220,
        y: 220,
      });
      await dispatchPointerEvent(rootElement, 'pointerup', {
        x: 220,
        y: 220,
      });
    };

    await runReaction();
    await runReaction();
    await runReaction();

    expect(game.container.textContent).toContain('Noise is loud.');

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
    expect(getButtonByText('Alchemy Hub')).toBeTruthy();

    await clickElement(trigger);
    expect(getButtonByText('Alchemy Hub')).toBeNull();

    await clickElement(trigger);
    await clickElement(getButtonByText('Create my Alchemy!')!);

    expect(getButtonByText('Alchemy Hub')).toBeNull();

    await game.unmount();
  });

  it('keeps persisted board elements with ruleset icons on square wrappers', async () => {
    localStorage.setItem(
      getLocalStorageKeys(BASE_RULESET).elements,
      JSON.stringify([{ id: 'el-1', name: 'air', x: 160, y: 180 }])
    );

    const game = await renderGameRoot();
    const boardElementWrapper = game.container.querySelector(
      'div.absolute.pointer-events-auto.select-none.touch-none'
    );
    if (!(boardElementWrapper instanceof HTMLElement)) {
      throw new Error('Expected a persisted board element to render.');
    }

    expect(boardElementWrapper.className).toContain('h-20');
    expect(boardElementWrapper.className).toContain('w-20');
    expect(boardElementWrapper.className).toContain('ml-[-40px]');
    expect(boardElementWrapper.className).toContain('mt-[-40px]');

    await game.unmount();
  });

  it('uses palette-sized wrappers for compact board elements', async () => {
    const compactRuleset: ActiveRuleset = {
      ...BASE_RULESET,
      compactElements: true,
    };
    initGetQueryMock.mockResolvedValue(
      createInitResponse({ activeRuleset: compactRuleset })
    );
    localStorage.setItem(
      getLocalStorageKeys(BASE_RULESET).elements,
      JSON.stringify([{ id: 'el-1', name: 'air', x: 160, y: 180 }])
    );

    const game = await renderGameRoot();
    const boardElementWrapper = game.container.querySelector(
      'div.absolute.pointer-events-auto.select-none.touch-none'
    );
    if (!(boardElementWrapper instanceof HTMLElement)) {
      throw new Error('Expected a compact board element to render.');
    }
    const label = getRequiredElement(
      boardElementWrapper,
      '[data-element-label="true"]'
    );

    expect(boardElementWrapper.className).not.toContain('h-20');
    expect(boardElementWrapper.style.width).toBe('64px');
    expect(boardElementWrapper.style.height).toBe('64px');
    expect(boardElementWrapper.style.marginLeft).toBe('-32px');
    expect(boardElementWrapper.style.marginTop).toBe('-32px');
    expect(label.className).toContain('text-[10px]');

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

describe('areBoardElementBoundsIntersecting', () => {
  const baseBounds = {
    bottom: 80,
    height: 80,
    left: 0,
    right: 80,
    top: 0,
    width: 80,
  };

  it('does not count nearby separated tiles as intersecting', () => {
    expect(
      areBoardElementBoundsIntersecting(baseBounds, {
        bottom: 80,
        height: 80,
        left: 90,
        right: 170,
        top: 0,
        width: 80,
      })
    ).toBe(false);
  });

  it('does not count edge-touching tiles as intersecting', () => {
    expect(
      areBoardElementBoundsIntersecting(baseBounds, {
        bottom: 80,
        height: 80,
        left: 80,
        right: 160,
        top: 0,
        width: 80,
      })
    ).toBe(false);
  });

  it('counts tiles as intersecting only after their bounds overlap', () => {
    expect(
      areBoardElementBoundsIntersecting(baseBounds, {
        bottom: 80,
        height: 80,
        left: 79,
        right: 159,
        top: 0,
        width: 80,
      })
    ).toBe(true);
  });
});

describe('board element positioning', () => {
  const footprint = {
    height: 80,
    width: 80,
  };
  const viewport = {
    height: 300,
    width: 400,
  };

  it('keeps element footprints inside the viewport', () => {
    expect(
      getBoundedBoardElementPosition({ x: -20, y: 360 }, footprint, viewport)
    ).toEqual({
      x: 40,
      y: 260,
    });
  });

  it('bounces overshoot back inward before clamping far overshoots', () => {
    expect(
      getEdgeBouncedBoardElementPosition({ x: 20, y: 280 }, footprint, viewport)
    ).toEqual({
      x: 60,
      y: 240,
    });

    expect(
      getEdgeBouncedBoardElementPosition(
        { x: -999, y: 999 },
        footprint,
        viewport
      )
    ).toEqual({
      x: 360,
      y: 40,
    });
  });
});
