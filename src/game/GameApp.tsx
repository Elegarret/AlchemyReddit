import {
  context,
  navigateTo,
  showShareSheet,
  showToast,
} from '@devvit/web/client';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  IoAddSharp,
  IoAlbumsSharp,
  IoCloseSharp,
  IoCreateOutline,
  IoOpenOutline,
  IoSearchSharp,
  IoSendSharp,
  IoSettingsSharp,
} from 'react-icons/io5';
import { BASE_RULESET } from '../modding/base-ruleset';
import { MarkdownBody } from '../MarkdownBody';
import {
  getAutoRemovedReactionElementIds,
  getLocalStorageKeys,
  getProgressScope,
  getRecipesForElementInRuleset,
  getRulesetCounterValues,
  getRulesetStartingCounterNames,
  getValidDiscoveredItems,
  hasReactionForRuleset,
  PLAYTEST_RULESET_STORAGE_KEY,
  resolveReactionForRuleset,
} from '../modding/runtime';
import {
  LEGACY_ELEMENT_EFFECTS,
  type ActiveRuleset,
  type ElementIconValue,
  type ModElementEffect,
} from '../modding/types';
import type { ReactionScriptPopupEvent } from '../modding/reaction-script';
import {
  createEmptyReactionScriptEventState,
  getReactionScriptEventId,
  type ReactionScriptEventState,
} from '../modding/reaction-script';
import { trpc } from '../trpc';
import { openEntry, setEditorTargetModId } from '../webview-navigation';
import { readPlaytestRuleset } from './playtest';
import { getReactionClusterPositions } from './reaction-cluster';
import {
  type Element,
  type ElementIcon,
  type SnowBackdropFlakeStyle,
} from './types';
import { createSnowBackdropFlakes, createSnowPaletteHills } from './visuals';

type GameSessionProps = {
  ruleset: ActiveRuleset;
  initialUsername: string | null;
  isModerator: boolean;
  initialDiscovered: string[];
  progressScope: string;
  isPlaytest: boolean;
  currentPostId: string | null;
  currentSharePostId: string | null;
};

type RealmReviewSource = 'completion' | 'scriptedTerminal';

type ElementPreviewIconSize = 'chip' | 'compact' | 'hero';

type ModalElementCardSize = Exclude<ElementPreviewIconSize, 'chip'>;

type CounterChipDelta = {
  counterName: string;
  delta: number;
  id: number;
};

let elementIdCounter = 0;
const createElementId = () => `el-${++elementIdCounter}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const BOARD_TILE_SIZE = 80;
const BOARD_COMPACT_TILE_SIZE = 64;
const BOARD_PLANK_HEIGHT = 44;
const BOARD_PLANK_HORIZONTAL_PADDING = 32;
const BOARD_PLANK_MIN_WIDTH = 112;
const BOARD_PLANK_MAX_WIDTH = 196;
const STARTER_ELEMENT_SIZE = BOARD_TILE_SIZE;
const STARTER_ELEMENT_GAP = 28;
const STARTER_EDGE_MARGIN = 56;
const HIDDEN_PLAYTEST_COUNTER_HINT =
  'This counter is hidden, you can see it only in the playtest mode';

type FixedMenuPosition = {
  left: number;
  top: number;
};
const LEGACY_COMMENTS_POST_ID = '1qwhma7';
const LEGACY_COMMENTS_URL =
  'https://www.reddit.com/r/AlchemyGame/comments/1qwhma7/alchemygame/';

type ElementTileSize = 'small' | 'large';
type ElementTileShape = 'tile' | 'plank';

type ElementLabelMode = 'default' | 'expanded' | 'compact';

type ElementLabelLayout = {
  iconPaddingClass: string;
  labelClassName: string;
  labelOverflowClassName: string;
};

type BoardElementFootprint = {
  height: number;
  isPlank: boolean;
  width: number;
};

type BoardElementBounds = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type BoardElementWrapperStyle = CSSProperties & {
  '--push-x': string;
  '--push-y': string;
};

const normalizeCounterKey = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeRedditPostId = (postId: string) => postId.replace(/^t3_/, '');

const getBoardElementFootprint = (
  displayName: string,
  icon: ElementIcon | null | undefined,
  isCompact: boolean = false
): BoardElementFootprint => {
  if (icon) {
    const tileSize = isCompact ? BOARD_COMPACT_TILE_SIZE : BOARD_TILE_SIZE;
    return {
      height: tileSize,
      isPlank: false,
      width: tileSize,
    };
  }

  const normalizedLength = Math.max(displayName.trim().length, 1);
  return {
    height: BOARD_PLANK_HEIGHT,
    isPlank: true,
    width: Math.min(
      BOARD_PLANK_MAX_WIDTH,
      Math.max(
        BOARD_PLANK_MIN_WIDTH,
        normalizedLength * 9 + BOARD_PLANK_HORIZONTAL_PADDING
      )
    ),
  };
};

export const areBoardElementBoundsIntersecting = (
  leftBounds: BoardElementBounds,
  rightBounds: BoardElementBounds
) =>
  leftBounds.left < rightBounds.right &&
  leftBounds.right > rightBounds.left &&
  leftBounds.top < rightBounds.bottom &&
  leftBounds.bottom > rightBounds.top;

const supportsHoverInput = () => {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return true;
  }

  return window.matchMedia('(hover: hover)').matches;
};

const ELEMENT_LABEL_LAYOUTS: Record<
  ElementTileSize,
  Record<ElementLabelMode, ElementLabelLayout>
> = {
  small: {
    default: {
      iconPaddingClass: 'pb-3',
      labelClassName: 'py-0.5 text-[10px] leading-tight',
      labelOverflowClassName: 'truncate',
    },
    expanded: {
      iconPaddingClass: 'pb-5',
      labelClassName: 'min-h-[1.95rem] px-1 py-0.5 text-[10px] leading-[1.05]',
      labelOverflowClassName: 'line-clamp-2 [overflow-wrap:anywhere]',
    },
    compact: {
      iconPaddingClass: 'pb-5',
      labelClassName:
        'min-h-[1.9rem] px-1 py-0.5 text-[9px] font-semibold leading-[1.05]',
      labelOverflowClassName: 'line-clamp-2 [overflow-wrap:anywhere]',
    },
  },
  large: {
    default: {
      iconPaddingClass: 'pb-5',
      labelClassName: 'py-0.5 text-[11px] font-bold leading-tight',
      labelOverflowClassName: 'truncate',
    },
    expanded: {
      iconPaddingClass: 'pb-7',
      labelClassName:
        'min-h-[2.2rem] px-1 py-1 text-[11px] font-bold leading-[1.05]',
      labelOverflowClassName: 'line-clamp-2 [overflow-wrap:anywhere]',
    },
    compact: {
      iconPaddingClass: 'pb-7',
      labelClassName:
        'min-h-[2.1rem] px-1 py-1 text-[10px] font-bold leading-[1.05]',
      labelOverflowClassName: 'line-clamp-2 [overflow-wrap:anywhere]',
    },
  },
};

const getElementLabelLayout = (size: ElementTileSize, mode: ElementLabelMode) =>
  ELEMENT_LABEL_LAYOUTS[size][mode];

const isLabelOverflowing = (node: HTMLElement) =>
  node.scrollWidth - node.clientWidth > 1 ||
  node.scrollHeight - node.clientHeight > 1;

type ElementTileProps = {
  colorClass: string;
  displayName: string;
  icon: ElementIconValue | null;
  lightGlow: string;
  reactiveClasses: string;
  shape?: ElementTileShape;
  size: ElementTileSize;
  showOverlay: boolean;
  style: CSSProperties;
  weight: number;
};

export const GameElementTile = ({
  colorClass,
  displayName,
  icon,
  lightGlow,
  reactiveClasses,
  shape = 'tile',
  size,
  showOverlay,
  style,
  weight,
}: ElementTileProps) => {
  const [labelMode, setLabelMode] = useState<ElementLabelMode>('default');
  const [isTruncated, setIsTruncated] = useState(false);
  const labelRef = useRef<HTMLSpanElement>(null);
  const labelLayout = getElementLabelLayout(size, labelMode);
  const isLarge = size === 'large';

  useLayoutEffect(() => {
    const labelNode = labelRef.current;
    if (!labelNode) {
      return;
    }

    const overflowed = isLabelOverflowing(labelNode);
    if (shape === 'plank') {
      if (labelMode !== 'default') {
        setLabelMode('default');
        return;
      }

      if (isTruncated !== overflowed) {
        setIsTruncated(overflowed);
      }
      return;
    }

    if (labelMode === 'default') {
      if (overflowed) {
        setLabelMode('expanded');
      }
      return;
    }

    if (labelMode === 'expanded') {
      if (overflowed) {
        setLabelMode('compact');
        return;
      }

      if (isTruncated) {
        setIsTruncated(false);
      }
      return;
    }

    if (isTruncated !== overflowed) {
      setIsTruncated(overflowed);
    }
  }, [isTruncated, labelMode, shape]);

  if (shape === 'plank') {
    return (
      <div
        className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 px-4 text-center ${colorClass} ${reactiveClasses} ${lightGlow}`}
        style={style}
        title={isTruncated ? displayName : undefined}
      >
        {showOverlay && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: 'var(--element-overlay)' }}
          />
        )}
        <span
          ref={labelRef}
          data-element-label="true"
          data-element-label-mode="default"
          className="relative z-10 block w-full truncate text-sm leading-none font-bold text-white/95"
        >
          {displayName}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-end overflow-hidden select-none ${
        isLarge
          ? 'h-full w-full rounded-xl border-2'
          : 'h-full w-full rounded-lg border-2'
      } ${colorClass} ${reactiveClasses} ${lightGlow}`}
      style={style}
      title={isTruncated ? displayName : undefined}
    >
      {showOverlay && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: 'var(--element-overlay)' }}
        />
      )}
      {icon && (
        <div
          data-element-icon="true"
          className={`pointer-events-none absolute inset-0 z-[1] flex items-center justify-center ${labelLayout.iconPaddingClass}`}
        >
          {(() => {
            const displayIcon = Array.isArray(icon) ? icon[0] : icon;
            if (typeof displayIcon === 'string') {
              if (
                displayIcon.startsWith('/') ||
                displayIcon.startsWith('http')
              ) {
                return (
                  <img
                    src={displayIcon}
                    alt=""
                    className={`${
                      size === 'small' ? 'h-9 w-9' : 'h-14 w-14'
                    } object-contain drop-shadow-md`}
                  />
                );
              }
              return (
                <span
                  className={`${
                    size === 'small' ? 'text-[34px]' : 'text-[52px]'
                  } leading-none drop-shadow-md`}
                >
                  {displayIcon}
                </span>
              );
            }
            const IconComponent = displayIcon;
            if (!IconComponent) {
              return null;
            }
            return (
              <div
                className={`${
                  weight < 500 ? 'text-black/50' : 'text-white/50'
                }`}
              >
                <IconComponent size={size === 'small' ? 30 : 44} />
              </div>
            );
          })()}
        </div>
      )}
      <span
        ref={labelRef}
        data-element-label="true"
        data-element-label-mode={labelMode}
        className={`relative z-10 flex w-full items-center justify-center overflow-hidden bg-black/40 text-center text-white/95 backdrop-blur-sm ${labelLayout.labelOverflowClassName} ${labelLayout.labelClassName} ${
          isLarge ? 'border-t border-white/5' : ''
        }`}
      >
        {displayName}
      </span>
    </div>
  );
};

const getDefaultVisibleCounterNames = (ruleset: ActiveRuleset) =>
  getRulesetStartingCounterNames(ruleset);

const getPersistedVisibleCounterNames = (
  ruleset: ActiveRuleset,
  value: unknown
) => {
  if (!Array.isArray(value)) {
    return getDefaultVisibleCounterNames(ruleset);
  }

  const byKey = new Map(
    ruleset.counterDefinitions.map((counter) => [
      normalizeCounterKey(counter.name),
      counter.name,
    ])
  );

  return Array.from(
    new Set(
      value.flatMap((entry) => {
        if (typeof entry !== 'string') {
          return [];
        }

        const canonicalName = byKey.get(normalizeCounterKey(entry));
        return canonicalName ? [canonicalName] : [];
      })
    )
  );
};

const getPersistedEventState = (
  ruleset: ActiveRuleset,
  value: unknown
): ReactionScriptEventState => {
  if (!isRecord(value)) {
    return createEmptyReactionScriptEventState();
  }

  const validEventIds = new Set(
    ruleset.events.map((event) => getReactionScriptEventId(event))
  );
  const normalizeEventIds = (entry: unknown) =>
    Array.isArray(entry)
      ? Array.from(
          new Set(
            entry.flatMap((eventId) =>
              typeof eventId === 'string' && validEventIds.has(eventId)
                ? [eventId]
                : []
            )
          )
        )
      : [];

  return {
    activeEventIds: normalizeEventIds(value.activeEventIds),
    firedEventIds: normalizeEventIds(value.firedEventIds),
  };
};

const applyCounterVisibilityChanges = (params: {
  currentVisibleCounterNames: string[];
  hiddenCounterNames: string[];
  shownCounterNames: string[];
}) => {
  const visibleCounterNames = new Set(params.currentVisibleCounterNames);
  params.hiddenCounterNames.forEach((counterName) => {
    visibleCounterNames.delete(counterName);
  });
  params.shownCounterNames.forEach((counterName) => {
    visibleCounterNames.add(counterName);
  });
  return Array.from(visibleCounterNames);
};

const getStarterElementIcon = (ruleset: ActiveRuleset, elementId: string) => {
  const rawIcon = ruleset.elementIcons[elementId];
  if (Array.isArray(rawIcon)) {
    return rawIcon[0];
  }

  return rawIcon;
};

const createStarterTableElements = (ruleset: ActiveRuleset): Element[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const starterCount = ruleset.startingElements.length;
  if (starterCount === 0) {
    return [];
  }

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  if (starterCount === 1) {
    const onlyElementId = ruleset.startingElements[0];
    if (!onlyElementId) {
      return [];
    }

    const icon = getStarterElementIcon(ruleset, onlyElementId);
    return [
      {
        id: createElementId(),
        name: onlyElementId,
        x: centerX,
        y: centerY,
        ...(icon ? { icon } : {}),
      },
    ];
  }

  const starterFootprints = ruleset.startingElements.map((elementId) =>
    getBoardElementFootprint(
      ruleset.elementNames?.[elementId] ?? elementId,
      getStarterElementIcon(ruleset, elementId),
      ruleset.compactElements
    )
  );
  const minimumCircumference = starterFootprints.reduce(
    (total, footprint) =>
      total + Math.max(footprint.width, footprint.height) + STARTER_ELEMENT_GAP,
    0
  );
  const maxStarterHalfExtent = starterFootprints.reduce(
    (maxValue, footprint) =>
      Math.max(maxValue, Math.max(footprint.width, footprint.height) / 2),
    STARTER_ELEMENT_SIZE / 2
  );
  const desiredRadius = minimumCircumference / (2 * Math.PI);
  const maxRadius = Math.max(
    0,
    Math.min(window.innerWidth, window.innerHeight) / 2 -
      STARTER_EDGE_MARGIN -
      maxStarterHalfExtent
  );
  const radius = Math.min(desiredRadius, maxRadius);

  return ruleset.startingElements.map((elementId, index) => {
    const angle = (index / starterCount) * Math.PI * 2;
    const icon = getStarterElementIcon(ruleset, elementId);
    return {
      id: createElementId(),
      name: elementId,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      ...(icon ? { icon } : {}),
    };
  });
};

const GameSession = ({
  ruleset,
  initialUsername,
  isModerator,
  initialDiscovered,
  progressScope,
  isPlaytest,
  currentPostId,
  currentSharePostId,
}: GameSessionProps) => {
  const storageKeys = getLocalStorageKeys(ruleset);
  const introStorageKey = `${storageKeys.discovered}-intro-dismissed`;
  const completionStorageKey = `${storageKeys.discovered}-completion-dismissed`;
  const realmMenuAnchorRef = useRef<HTMLDivElement>(null);
  const realmMenuPanelRef = useRef<HTMLDivElement>(null);
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
        const parsed = (JSON.parse(saved) as Element[]).filter((el) =>
          validNames.has(el.name)
        );
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
    return ruleset.showPalette ? [] : createStarterTableElements(ruleset);
  });
  const [counterValues, setCounterValues] = useState<Record<string, number>>(
    () => {
      try {
        const saved = localStorage.getItem(storageKeys.counters);
        if (!saved) {
          return getRulesetCounterValues(ruleset);
        }

        const parsed = JSON.parse(saved);
        if (!isRecord(parsed)) {
          return getRulesetCounterValues(ruleset);
        }

        const persistedCounters: Record<string, number> = {};
        Object.entries(parsed).forEach(([key, value]) => {
          if (typeof value === 'number') {
            persistedCounters[key] = value;
          }
        });
        return getRulesetCounterValues(ruleset, persistedCounters);
      } catch (error) {
        console.error('Failed to load counters', error);
        return getRulesetCounterValues(ruleset);
      }
    }
  );
  const [visibleCounterNames, setVisibleCounterNames] = useState<string[]>(
    () => {
      try {
        const saved = localStorage.getItem(storageKeys.counterVisibility);
        if (!saved) {
          return getDefaultVisibleCounterNames(ruleset);
        }

        return getPersistedVisibleCounterNames(ruleset, JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load counter visibility', error);
        return getDefaultVisibleCounterNames(ruleset);
      }
    }
  );
  const [eventState, setEventState] = useState<ReactionScriptEventState>(() => {
    try {
      const saved = localStorage.getItem(storageKeys.events);
      if (!saved) {
        return createEmptyReactionScriptEventState();
      }

      return getPersistedEventState(ruleset, JSON.parse(saved));
    } catch (error) {
      console.error('Failed to load event state', error);
      return createEmptyReactionScriptEventState();
    }
  });
  const [pulsingCounterTokens, setPulsingCounterTokens] = useState<
    Record<string, number>
  >({});
  const [counterChipDeltas, setCounterChipDeltas] = useState<
    CounterChipDelta[]
  >([]);
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
  const [flash, setFlash] = useState<{
    x: number;
    y: number;
    id: number;
  } | null>(null);
  const [explodingIDs, setExplodingIDs] = useState<Record<string, boolean>>({});
  const [pushedElements, setPushedElements] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [showOptions, setShowOptions] = useState(false);
  const username = initialUsername;
  const authorUsername = ruleset.ownerUsername ?? 'Unknown';
  const isAuthor = !!username && username === ruleset.ownerUsername;
  const canCopyModData =
    ruleset.kind === 'mod' &&
    !!ruleset.sourceModId &&
    (isAuthor || isModerator);
  const [discoveryPopup, setDiscoveryPopup] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [infoPopup, setInfoPopup] = useState<string | null>(null);
  const [computerPopup, setComputerPopup] = useState<string | null>(null);
  const [reactionMessages, setReactionMessages] = useState<string[]>([]);
  const [visibleReactionMessageCount, setVisibleReactionMessageCount] =
    useState(0);
  const [scriptedPopupQueue, setScriptedPopupQueue] = useState<
    ReactionScriptPopupEvent[]
  >([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [showMobileFilter, setShowMobileFilter] = useState(false);
  const [isQuaking, setIsQuaking] = useState(false);
  const [stormFlashVisible, setStormFlashVisible] = useState(false);
  const [showRealmMenu, setShowRealmMenu] = useState(false);
  const [realmMenuPosition, setRealmMenuPosition] =
    useState<FixedMenuPosition | null>(null);
  const [hoverSupported, setHoverSupported] = useState(supportsHoverInput);
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
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  const [realmReviewText, setRealmReviewText] = useState('');
  const [isRealmReviewSubmitting, setIsRealmReviewSubmitting] =
    useState(false);
  const [realmReviewError, setRealmReviewError] = useState<string | null>(null);
  const [showReviewThanksPopup, setShowReviewThanksPopup] = useState(false);
  const [showReviewActionsPopup, setShowReviewActionsPopup] = useState(false);

  useEffect(() => {
    if (reactionMessages.length === 0) {
      setVisibleReactionMessageCount(0);
      return;
    }

    setVisibleReactionMessageCount(1);
    const timeoutIds = reactionMessages.slice(1).map((_, index) =>
      window.setTimeout(
        () => {
          setVisibleReactionMessageCount(index + 2);
        },
        (index + 1) * 500
      )
    );

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [reactionMessages]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const mediaQuery = window.matchMedia('(hover: hover)');
    const updateHoverSupport = (matches: boolean) => {
      setHoverSupported(matches);
    };
    updateHoverSupport(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      updateHoverSupport(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleChange);
      return () => {
        mediaQuery.removeListener(handleChange);
      };
    }
  }, []);

  useEffect(() => {
    if (!showRealmMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (isInsideRealmMenu(target)) {
        return;
      }

      setShowRealmMenu(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [showRealmMenu]);

  useLayoutEffect(() => {
    if (!showRealmMenu) {
      setRealmMenuPosition(null);
      return;
    }

    const updateRealmMenuPosition = () => {
      const anchor = realmMenuAnchorRef.current;
      if (!anchor) {
        setRealmMenuPosition(null);
        return;
      }

      const rect = anchor.getBoundingClientRect();
      setRealmMenuPosition({
        left: rect.left,
        top: rect.bottom,
      });
    };

    updateRealmMenuPosition();
    window.addEventListener('resize', updateRealmMenuPosition);
    window.addEventListener('scroll', updateRealmMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateRealmMenuPosition);
      window.removeEventListener('scroll', updateRealmMenuPosition, true);
    };
  }, [showRealmMenu]);

  const getElementDisplayName = (elementId: string) =>
    ruleset.elementNames?.[elementId] ?? elementId;

  const getBoardElementIcon = (element: Pick<Element, 'icon' | 'name'>) => {
    if (element.icon) {
      return element.icon;
    }

    const rawIcon = ruleset.elementIcons[element.name];
    return Array.isArray(rawIcon) ? rawIcon[0] : rawIcon;
  };

  const getBoardFootprintForElement = (
    element: Pick<Element, 'icon' | 'name'>
  ): BoardElementFootprint =>
    getBoardElementFootprint(
      getElementDisplayName(element.name),
      getBoardElementIcon(element),
      ruleset.compactElements
    );

  const getBoardElementBounds = (
    element: Pick<Element, 'icon' | 'name' | 'x' | 'y'>
  ): BoardElementBounds => {
    const footprint = getBoardFootprintForElement(element);
    return {
      bottom: element.y + footprint.height / 2,
      height: footprint.height,
      left: element.x - footprint.width / 2,
      right: element.x + footprint.width / 2,
      top: element.y - footprint.height / 2,
      width: footprint.width,
    };
  };

  const isWithinMergeRange = (
    leftElement: Pick<Element, 'icon' | 'name' | 'x' | 'y'>,
    rightElement: Pick<Element, 'icon' | 'name' | 'x' | 'y'>
  ) => {
    const leftBounds = getBoardElementBounds(leftElement);
    const rightBounds = getBoardElementBounds(rightElement);
    return areBoardElementBoundsIntersecting(leftBounds, rightBounds);
  };

  const getElementEffect = (elementId: string): ModElementEffect =>
    ruleset.elementEffects[elementId] ??
    LEGACY_ELEMENT_EFFECTS[elementId] ??
    'none';

  const hasElementEffect = (elementId: string, effect: ModElementEffect) =>
    getElementEffect(elementId) === effect;

  const hasLegacyOverlayPopup =
    discoveryPopup !== null ||
    infoPopup !== null ||
    computerPopup !== null ||
    showReviewThanksPopup ||
    showReviewActionsPopup;
  const activeScriptedPopup = hasLegacyOverlayPopup
    ? null
    : (scriptedPopupQueue[0] ?? null);
  const hasBlockingScriptedPopup = scriptedPopupQueue.length > 0;
  const areBoardInteractionsLocked =
    hasBlockingScriptedPopup || hasLegacyOverlayPopup;

  useEffect(() => {
    if (hasBlockingScriptedPopup) {
      setShowRealmMenu(false);
    }
  }, [hasBlockingScriptedPopup]);

  const renderElementPreviewIcon = (
    elementId: string,
    size: ElementPreviewIconSize = 'compact'
  ) => {
    const rawIcon = ruleset.elementIcons[elementId];
    const icon = Array.isArray(rawIcon) ? rawIcon[0] : rawIcon;
    const colorClass =
      ruleset.elementStyles[elementId] ?? 'bg-gray-300 border-gray-500';
    const weightMatch = colorClass.match(/-(\d{3})/);
    const weight = weightMatch ? parseInt(weightMatch[1] || '500') : 500;
    const imageClassName =
      size === 'hero'
        ? 'h-20 w-20 object-contain'
        : size === 'chip'
          ? 'h-4 w-4 object-contain'
          : 'h-12 w-12 object-contain';
    const emojiClassName =
      size === 'hero'
        ? 'text-7xl leading-none drop-shadow-2xl'
        : size === 'chip'
          ? 'text-lg leading-none drop-shadow-sm'
          : 'text-4xl leading-none drop-shadow-lg';
    const iconSize = size === 'hero' ? 80 : size === 'chip' ? 16 : 40;

    if (typeof icon === 'string') {
      if (icon.startsWith('/') || icon.startsWith('http')) {
        return <img src={icon} alt="" className={imageClassName} />;
      }

      return <span className={emojiClassName}>{icon}</span>;
    }

    if (!icon) {
      return null;
    }

    const IconComponent = icon;
    return (
      <div className={weight < 500 ? 'text-black/50' : 'text-white/50'}>
        <IconComponent size={iconSize} />
      </div>
    );
  };

  const renderModalElementCard = (
    elementId: string,
    size: ModalElementCardSize = 'compact'
  ) => (
    <div
      className={`flex items-center justify-center border-2 ${
        size === 'hero'
          ? 'h-32 w-32 rounded-2xl border-4 shadow-2xl'
          : 'h-20 w-20 rounded-xl shadow-lg'
      } ${ruleset.elementStyles[elementId] ?? 'border-gray-500 bg-gray-300'}`}
    >
      {renderElementPreviewIcon(elementId, size)}
    </div>
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

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
  const hasStorm = elements.some((el) => hasElementEffect(el.name, 'storm'));
  const visibleCounterNameSet = new Set(visibleCounterNames);
  const activeCounters = ruleset.counterDefinitions.map((counter) => ({
    ...counter,
    isVisible: visibleCounterNameSet.has(counter.name),
    value: counterValues[counter.name] ?? counter.initial,
  }));
  const renderedCounters = isPlaytest
    ? activeCounters
    : activeCounters.filter((counter) => counter.isVisible);
  const allGameplayElementIds = useMemo(() => {
    const counterElementIdSet = new Set(
      ruleset.counterDefinitions.map((counter) => counter.elementId)
    );
    return Object.keys(ruleset.elementStyles).filter(
      (elementId) => !counterElementIdSet.has(elementId)
    );
  }, [ruleset.counterDefinitions, ruleset.elementStyles]);
  const totalElementsCount = allGameplayElementIds.length;
  const counterChipDeltasByName = counterChipDeltas.reduce<
    Record<string, CounterChipDelta[]>
  >((grouped, delta) => {
    if (!grouped[delta.counterName]) {
      grouped[delta.counterName] = [];
    }
    grouped[delta.counterName]?.push(delta);
    return grouped;
  }, {});
  const pagesCount = Math.ceil(discovered.length / itemsPerPage);
  const prevPagesCount = useRef(pagesCount);
  const prevDiscoveredLen = useRef(discovered.length);
  const hasRecordedCompletionRef = useRef(false);
  const previousCounterValuesRef = useRef<Record<string, number> | null>(null);
  const latestCounterValuesRef = useRef(counterValues);
  const latestEventStateRef = useRef(eventState);
  const counterPulseTimeouts = useRef<Record<string, number>>({});
  const counterDeltaTimeouts = useRef<Record<number, number>>({});
  const counterDeltaIdRef = useRef(0);

  useEffect(() => {
    latestCounterValuesRef.current = counterValues;
  }, [counterValues]);

  useEffect(() => {
    latestEventStateRef.current = eventState;
  }, [eventState]);

  const recordRealmCompletion = () => {
    if (
      isPlaytest ||
      !ruleset.sourceModId ||
      hasRecordedCompletionRef.current
    ) {
      return;
    }

    hasRecordedCompletionRef.current = true;
    trpc.progress.complete
      .mutate({ modId: ruleset.sourceModId })
      .catch((error) => {
        console.error('[Sync] Completion save failed:', error);
        hasRecordedCompletionRef.current = false;
      });
  };

  useEffect(() => {
    // Only jump to new page if we actually discovered something new
    if (
      pagesCount > prevPagesCount.current &&
      discovered.length > prevDiscoveredLen.current
    ) {
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
    if (allGameplayElementIds.length === 0) {
      return;
    }

    const discoveredSet = new Set(discovered);
    const hasDiscoveredEveryElement = allGameplayElementIds.every((elementId) =>
      discoveredSet.has(elementId)
    );
    if (!hasDiscoveredEveryElement) {
      return;
    }

    recordRealmCompletion();

    try {
      if (localStorage.getItem(completionStorageKey) === '1') {
        return;
      }
    } catch {
      // Ignore storage failures and show the popup for this session.
    }

    setShowCompletionPopup(true);
  }, [allGameplayElementIds, completionStorageKey, discovered]);

  useEffect(() => {
    if (activeScriptedPopup?.kind === 'win') {
      recordRealmCompletion();
    }
  }, [activeScriptedPopup?.kind]);

  useEffect(() => {
    localStorage.setItem(storageKeys.elements, JSON.stringify(elements));
  }, [elements]);

  useEffect(() => {
    localStorage.setItem(storageKeys.counters, JSON.stringify(counterValues));
  }, [counterValues, storageKeys.counters]);

  useEffect(() => {
    localStorage.setItem(
      storageKeys.counterVisibility,
      JSON.stringify(visibleCounterNames)
    );
  }, [storageKeys.counterVisibility, visibleCounterNames]);

  useEffect(() => {
    localStorage.setItem(storageKeys.events, JSON.stringify(eventState));
  }, [eventState, storageKeys.events]);

  useEffect(() => {
    const currentCounterValues = Object.fromEntries(
      ruleset.counterDefinitions.map((counter) => [
        counter.name,
        counterValues[counter.name] ?? counter.initial,
      ])
    );
    const previousCounterValues = previousCounterValuesRef.current;
    previousCounterValuesRef.current = currentCounterValues;

    if (previousCounterValues === null) {
      return;
    }

    ruleset.counterDefinitions.forEach((counter) => {
      const previousValue =
        previousCounterValues[counter.name] ?? counter.initial;
      const nextValue = currentCounterValues[counter.name] ?? counter.initial;
      const delta = nextValue - previousValue;

      if (delta === 0) {
        return;
      }

      const pulseToken = Date.now() + Math.random();
      setPulsingCounterTokens((current) => ({
        ...current,
        [counter.name]: pulseToken,
      }));

      const existingPulseTimeout = counterPulseTimeouts.current[counter.name];
      if (existingPulseTimeout !== undefined) {
        window.clearTimeout(existingPulseTimeout);
      }

      counterPulseTimeouts.current[counter.name] = window.setTimeout(() => {
        setPulsingCounterTokens((current) => {
          if (current[counter.name] !== pulseToken) {
            return current;
          }

          const next = { ...current };
          delete next[counter.name];
          return next;
        });
        delete counterPulseTimeouts.current[counter.name];
      }, 520);

      const deltaId = ++counterDeltaIdRef.current;
      setCounterChipDeltas((current) => [
        ...current,
        {
          counterName: counter.name,
          delta,
          id: deltaId,
        },
      ]);
      counterDeltaTimeouts.current[deltaId] = window.setTimeout(() => {
        setCounterChipDeltas((current) =>
          current.filter((entry) => entry.id !== deltaId)
        );
        delete counterDeltaTimeouts.current[deltaId];
      }, 950);
    });
  }, [counterValues, ruleset.counterDefinitions]);

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
    setExplodingIDs((prev) => {
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
      stormFlashTimeouts.current = stormFlashTimeouts.current.filter(
        (activeId) => activeId !== timeoutId
      );
    }, duration);

    stormFlashTimeouts.current.push(timeoutId);
  };

  // Explosion Effect Logic
  useEffect(() => {
    const explodeEl = elements.find(
      (el) => hasElementEffect(el.name, 'explode') && !explodingIDs[el.id]
    );
    if (explodeEl) {
      const currentExplodeId = explodeEl.id;
      setExplodingIDs((prev) => ({ ...prev, [currentExplodeId]: true }));

      // Start explosion sequence after shake
      explosionStartTimeouts.current[currentExplodeId] = window.setTimeout(
        () => {
          const currentExplodeEl = elementsRef.current.find(
            (el) => el.id === currentExplodeId
          );
          if (!currentExplodeEl) {
            cancelExplosion(currentExplodeId);
            return;
          }

          const explosionX = currentExplodeEl.x;
          const explosionY = currentExplodeEl.y;

          // Flash at the current explosion site
          setFlash({
            x: explosionX,
            y: explosionY,
            id: ++flashCounter.current,
          });

          // Calculate push vectors for ALL elements currently on table
          const pushData: Record<string, { x: number; y: number }> = {};
          elementsRef.current.forEach((el) => {
            if (el.id === currentExplodeId) return;
            const dx = el.x - explosionX;
            const dy = el.y - explosionY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = 1000;
            pushData[el.id] = {
              x: (dx / dist) * force,
              y: (dy / dist) * force,
            };
          });
          setPushedElements(pushData);

          // Final cleanup: remove everything after animation
          explosionCleanupTimeouts.current[currentExplodeId] =
            window.setTimeout(() => {
              const stillExists = elementsRef.current.some(
                (el) => el.id === currentExplodeId
              );
              if (!stillExists) {
                cancelExplosion(currentExplodeId);
                return;
              }

              clearExplosionTimeouts(currentExplodeId);
              setElements((currentElements) =>
                currentElements.filter((el) => el.name === 'space')
              );
              setExplodingIDs({});
              setPushedElements({});
              setFlash(null);
            }, 500);
        },
        1500
      );
    }
  }, [elements, explodingIDs]);

  useEffect(() => {
    Object.keys(explodingIDs).forEach((id) => {
      if (!elements.some((el) => el.id === id)) {
        cancelExplosion(id);
      }
    });
  }, [elements, explodingIDs]);

  useEffect(() => {
    return () => {
      Object.keys(explosionStartTimeouts.current).forEach((id) => {
        window.clearTimeout(explosionStartTimeouts.current[id]);
      });
      Object.keys(explosionCleanupTimeouts.current).forEach((id) => {
        window.clearTimeout(explosionCleanupTimeouts.current[id]);
      });
      if (quakeTimeout.current !== null) {
        window.clearTimeout(quakeTimeout.current);
      }
      clearStormTimeouts();
      Object.values(counterPulseTimeouts.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      Object.values(counterDeltaTimeouts.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
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

  const resetProgressAndStartOver = () => {
    const basic = ruleset.startingElements;
    const resetElements = ruleset.showPalette
      ? []
      : createStarterTableElements(ruleset);
    const resetCounters = getRulesetCounterValues(ruleset);
    const resetVisibleCounterNames = getDefaultVisibleCounterNames(ruleset);
    const resetEventState = createEmptyReactionScriptEventState();
    Object.values(counterPulseTimeouts.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    Object.values(counterDeltaTimeouts.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    counterPulseTimeouts.current = {};
    counterDeltaTimeouts.current = {};
    previousCounterValuesRef.current = resetCounters;
    latestCounterValuesRef.current = resetCounters;
    latestEventStateRef.current = resetEventState;
    setDiscovered(basic);
    setElements(resetElements);
    setCounterValues(resetCounters);
    setVisibleCounterNames(resetVisibleCounterNames);
    setEventState(resetEventState);
    setPulsingCounterTokens({});
    setCounterChipDeltas([]);
    setCurrentPage(0);
    setDragging(null);
    setReactiveIDs([]);
    setScriptedPopupQueue([]);
    setReactionMessages([]);
    setDiscoveryPopup(null);
    setInfoPopup(null);
    setComputerPopup(null);
    setShowOptions(false);
    setConfirmWipe(false);
    setRealmReviewText('');
    setRealmReviewError(null);
    setShowReviewThanksPopup(false);
    setShowReviewActionsPopup(false);
    prevDiscoveredCount.current = basic.length;

    localStorage.setItem(storageKeys.discovered, JSON.stringify(basic));
    localStorage.setItem(storageKeys.elements, JSON.stringify(resetElements));
    localStorage.setItem(storageKeys.counters, JSON.stringify(resetCounters));
    localStorage.setItem(
      storageKeys.counterVisibility,
      JSON.stringify(resetVisibleCounterNames)
    );
    localStorage.setItem(storageKeys.events, JSON.stringify(resetEventState));
    localStorage.setItem(storageKeys.page, '0');
    localStorage.removeItem(introStorageKey);
    localStorage.removeItem(completionStorageKey);
    setShowRealmIntro(Boolean(ruleset.intro.trim()));
    setShowCompletionPopup(false);

    if (!isPlaytest) {
      trpc.progress.save
        .mutate({ discovered: basic, progressScope })
        .catch(console.error);
    }
  };

  const closeActiveScriptedPopup = () => {
    setScriptedPopupQueue((current) => current.slice(1));
  };

  const closeTerminalScriptedPopup = () => {
    closeActiveScriptedPopup();
    setRealmReviewText('');
    setRealmReviewError(null);
  };

  const dismissCompletionPopup = () => {
    setShowCompletionPopup(false);
    try {
      localStorage.setItem(completionStorageKey, '1');
    } catch {
      // Ignore storage failures in constrained clients.
    }
  };

  const prepareToLeaveRealm = () => {
    setReactionMessages([]);
    setScriptedPopupQueue([]);
    setShowOptions(false);
    setShowRealmMenu(false);
    setShowReviewThanksPopup(false);
    setShowReviewActionsPopup(false);
    localStorage.removeItem('override-mod-id');
  };

  const navigateBackToRealmsList = (
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    prepareToLeaveRealm();

    if (isPlaytest) {
      localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
      if (ruleset.sourceModId) {
        setEditorTargetModId(ruleset.sourceModId);
      }
      openEntry(event.nativeEvent, 'mod-editor');
      return;
    }

    openEntry(event.nativeEvent, 'mod-catalog');
  };

  const openAlchemyHub = (event: ReactMouseEvent<HTMLButtonElement>) => {
    prepareToLeaveRealm();
    localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
    setEditorTargetModId(null);
    openEntry(event.nativeEvent, 'mod-catalog');
  };

  const openCreateMyAlchemy = (event: ReactMouseEvent<HTMLButtonElement>) => {
    prepareToLeaveRealm();
    localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
    setEditorTargetModId(null);
    openEntry(event.nativeEvent, 'mod-editor');
  };

  const copyModData = async () => {
    if (!ruleset.sourceModId) {
      showToast('This realm has no mod data to copy.');
      return;
    }

    try {
      const mod = await trpc.mods.getPublished.query(ruleset.sourceModId);
      if (!mod) {
        showToast('Published mod data was not found.');
        return;
      }

      await navigator.clipboard.writeText(JSON.stringify(mod, null, 2));
      showToast('Mod data copied');
      setShowOptions(false);
    } catch (error) {
      console.error(error);
      showToast('Failed to copy mod data');
    }
  };

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
    if (areBoardInteractionsLocked) {
      return;
    }

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
    size: ElementTileSize = 'small',
    isHidden: boolean = false,
    isReactive: boolean = false,
    iconOverride?: ElementIcon,
    shapeOverride?: ElementTileShape
  ) => {
    const colorClass = isHidden
      ? 'bg-slate-900 border-slate-800'
      : (ruleset.elementStyles[name] ?? 'bg-gray-300 border-gray-500');
    const customBg = !isHidden
      ? colorClass
          .split(' ')
          .find((c) => c.startsWith('bg-[_#'))
          ?.replace('bg-[_', '')
          .slice(0, -1) ||
        colorClass
          .split(' ')
          .find((c) => c.startsWith('bg-[#'))
          ?.slice(4, -1)
      : undefined;
    const customFrame = !isHidden
      ? colorClass
          .split(' ')
          .find((c) => c.startsWith('border-[_#'))
          ?.replace('border-[_', '')
          .slice(0, -1) ||
        colorClass
          .split(' ')
          .find((c) => c.startsWith('border-[#'))
          ?.slice(8, -1)
      : undefined;

    const style: React.CSSProperties = {
      ...(customBg ? { backgroundColor: customBg } : {}),
      ...(customFrame ? { borderColor: customFrame } : {}),
    };

    const weightMatch = colorClass.match(/-(\d{3})/);
    const weight = weightMatch ? parseInt(weightMatch[1] || '500') : 500;
    const Icon = isHidden ? null : (iconOverride ?? ruleset.elementIcons[name]);
    const displayName = isHidden ? '???' : getElementDisplayName(name);
    const shape: ElementTileShape =
      shapeOverride ?? (size === 'large' && !isHidden && !Icon ? 'plank' : 'tile');

    const reactiveClasses = isReactive
      ? 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-[var(--ring-offset)] animate-pulse'
      : '';
    const lightGlow =
      hasElementEffect(name, 'light') && !isHidden
        ? 'shadow-[0_0_40px_15px_rgba(255,255,150,0.8)] z-20'
        : '';

    return (
      <GameElementTile
        key={`${name}:${displayName}:${size}:${isHidden ? 'hidden' : 'shown'}`}
        colorClass={colorClass}
        displayName={displayName}
        icon={Icon ?? null}
        lightGlow={lightGlow}
        reactiveClasses={reactiveClasses}
        shape={shape}
        size={size}
        showOverlay={!isHidden}
        style={style}
        weight={weight}
      />
    );
  };

  const getRandomHint = (currentDiscovered: string[] = discovered) => {
    const possible: string[] = [];
    for (const [key, outputs] of Object.entries(ruleset.recipes)) {
      const [a, b] = key.split('+');
      if (
        a &&
        b &&
        currentDiscovered.includes(a) &&
        currentDiscovered.includes(b)
      ) {
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
    if (areBoardInteractionsLocked) {
      return;
    }

    const id = createElementId();
    const icon = getRandomTableIcon(name);
    const hint = hasElementEffect(name, 'hint')
      ? (getRandomHint() ?? 'nothing')
      : undefined;

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
    if (areBoardInteractionsLocked) {
      return;
    }

    if (dragging) {
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;

      setElements((prev) =>
        prev.map((el) =>
          el.id === dragging ? { ...el, x: newX, y: newY } : el
        )
      );

      const draggedEl = elements.find((el) => el.id === dragging);
      if (draggedEl) {
        const movedDraggedEl = {
          ...draggedEl,
          x: newX,
          y: newY,
        };
        const targetEl = elements.find((el) => {
          if (el.id === dragging) return false;
          return isWithinMergeRange(movedDraggedEl, el);
        });

        if (
          targetEl &&
          (hasReactionForRuleset(ruleset, draggedEl.name, targetEl.name) ||
            hasElementEffect(draggedEl.name, 'computer') ||
            hasElementEffect(targetEl.name, 'computer'))
        ) {
          if (
            !reactiveIDs.includes(draggedEl.id) ||
            !reactiveIDs.includes(targetEl.id)
          ) {
            setReactiveIDs([draggedEl.id, targetEl.id]);
          }
        } else if (reactiveIDs.length > 0) {
          setReactiveIDs([]);
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (areBoardInteractionsLocked) {
      return;
    }

    if (!dragging) return;

    // Check if released over palette area (bottom 256px)
    if (
      ruleset.showPalette &&
      e.clientX > 0 &&
      e.clientY > window.innerHeight - 256
    ) {
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

    const targetEl = elements.find((el) => {
      if (el.id === dragging) return false;
      return isWithinMergeRange(draggedEl, el);
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

      const reactionResolution = resolveReactionForRuleset({
        counterValues: latestCounterValuesRef.current,
        currentTableElements: elements.map((element) => ({
          elementId: element.name,
          id: element.id,
        })),
        discoveredElementIds: discovered,
        eventState: latestEventStateRef.current,
        leftId: draggedEl.name,
        rightId: targetEl.name,
        ruleset,
      });
      if (reactionResolution) {
        if (!reactionResolution.ok) {
          showToast(
            reactionResolution.errors[0]
              ? `Reaction script error: ${reactionResolution.errors[0].message}`
              : 'Reaction script error.'
          );
          setDragging(null);
          setReactiveIDs([]);
          return;
        }

        const result = reactionResolution.result;
        const midX = (draggedEl.x + targetEl.x) / 2;
        const midY = (draggedEl.y + targetEl.y) / 2;
        const nextReactionMessages = result.messages
          .map((message) => message.trim())
          .filter((message) => message.length > 0);

        // Trigger Flash
        setFlash({ x: midX, y: midY, id: ++flashCounter.current });
        setTimeout(() => setFlash(null), 500);

        const removedElementIds = new Set([
          ...getAutoRemovedReactionElementIds({
            draggedTableElementId: dragging,
            leftId: draggedEl.name,
            rightId: targetEl.name,
            ruleset,
            targetTableElementId: targetEl.id,
          }),
          ...result.removedTableElementIds,
        ]);
        const filteredElements = elements.filter(
          (el) => !removedElementIds.has(el.id)
        );

        // Prepare next discovery state to correctly generate hints
        let nextDiscovered = [...discovered];
        let newlyDiscoveredKeyItem = null;
        let newlyDiscoveredInfoItem = null;
        result.emittedElementIds.forEach((name) => {
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
        const updatedFilteredElements = filteredElements.map((el) => {
          if (hasElementEffect(el.name, 'hint')) {
            return {
              ...el,
              hint: getRandomHint(nextDiscovered) ?? 'nothing',
            };
          }
          return el;
        });

        const newResultElements = result.emittedElementIds.map((name) => {
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
        const persistentReactionElementIds = [draggedEl.id, targetEl.id].filter(
          (tableElementId) => !removedElementIds.has(tableElementId)
        );
        const reactionClusterElementIds = [
          ...persistentReactionElementIds,
          ...newResultElements.map((element) => element.id),
        ];
        const reactionClusterPositions = getReactionClusterPositions(
          midX,
          midY,
          reactionClusterElementIds.length
        );
        const reactionClusterPositionByElementId = new Map(
          reactionClusterElementIds.map((tableElementId, index) => [
            tableElementId,
            reactionClusterPositions[index] ?? { x: midX, y: midY },
          ])
        );
        latestCounterValuesRef.current = result.counterValues;
        setCounterValues(result.counterValues);
        if (result.eventState) {
          latestEventStateRef.current = result.eventState;
          setEventState(result.eventState);
        }
        setVisibleCounterNames((current) =>
          applyCounterVisibilityChanges({
            currentVisibleCounterNames: current,
            hiddenCounterNames: result.hiddenCounterNames,
            shownCounterNames: result.shownCounterNames,
          })
        );
        setReactionMessages(nextReactionMessages);
        if (result.popupEvents.length > 0) {
          setScriptedPopupQueue((current) => [
            ...current,
            ...result.popupEvents,
          ]);
        }

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

        // Step 2: Move surviving non-consumable inputs and outputs into the reaction cluster
        if (reactionClusterPositionByElementId.size > 0) {
          setTimeout(() => {
            setElements((prev) =>
              prev.map((el) => {
                const targetPosition = reactionClusterPositionByElementId.get(
                  el.id
                );
                if (targetPosition) {
                  return {
                    ...el,
                    x: targetPosition.x,
                    y: targetPosition.y,
                  };
                }
                return el;
              })
            );
          }, 50);
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
              if (el.id === draggedEl.id)
                return { ...el, x: el.x + moveX, y: el.y + moveY };
              if (el.id === targetEl.id)
                return { ...el, x: el.x - moveX, y: el.y - moveY };
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
              if (el.id === draggedEl.id)
                return { ...el, x: el.x + moveX, y: el.y + moveY };
              if (el.id === targetEl.id)
                return { ...el, x: el.x - moveX, y: el.y - moveY };
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
    if (areBoardInteractionsLocked) {
      return;
    }

    gestureStart.current = { x: e.clientX, y: e.clientY, name: name || '' };
    isGesturingPalette.current = 'none';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPaletteMove = (e: React.PointerEvent) => {
    if (areBoardInteractionsLocked) {
      return;
    }

    if (gestureStart.current.x === 0 && gestureStart.current.y === 0) return;

    const dx = e.clientX - gestureStart.current.x;
    const dy = e.clientY - gestureStart.current.y;

    if (isGesturingPalette.current === 'none') {
      const horizontalThreshold = 15;
      const verticalThreshold = 8;

      // If only one page, lock swiping and make any drag spawn the element
      if (pages.length <= 1) {
        if (
          (Math.abs(dx) > 5 || Math.abs(dy) > 5) &&
          gestureStart.current.name
        ) {
          isGesturingPalette.current = 'spawning';
          spawnFromPalette(e, gestureStart.current.name);
        }
        return;
      }

      if (
        dy < -verticalThreshold &&
        Math.abs(dy) > Math.abs(dx) &&
        gestureStart.current.name
      ) {
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
    if (areBoardInteractionsLocked) {
      return;
    }

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
    if (areBoardInteractionsLocked) {
      return;
    }

    if (pages.length <= 1) return;
    if (wheelTimeout.current !== null) return;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

    if (Math.abs(delta) > 5) {
      if (delta > 0 && currentPage < pages.length - 1) {
        setCurrentPage((p) => p + 1);
        wheelTimeout.current = window.setTimeout(() => {
          wheelTimeout.current = null;
        }, 250);
      } else if (delta < 0 && currentPage > 0) {
        setCurrentPage((p) => p - 1);
        wheelTimeout.current = window.setTimeout(() => {
          wheelTimeout.current = null;
        }, 250);
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

  const nextKeyItem = ruleset.keyItems.find(
    (item) => !discovered.includes(item)
  );

  const starDrops = useRef(
    Array.from({ length: 20 }).map(() => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      width: `${Math.random() * 3 + 2}px`,
      height: `${Math.random() * 3 + 2}px`,
      animationDelay: `${Math.random() * 2}s`,
    }))
  );
  const snowBackdropFlakes = useRef<SnowBackdropFlakeStyle[]>(
    createSnowBackdropFlakes()
  );
  const snowPaletteHills = useRef<CSSProperties[]>(createSnowPaletteHills());
  const hasStar = elements.some((el) => el.name === 'star');
  const hasSnow = elements.some((el) => el.name === 'snow');
  const counterBar =
    renderedCounters.length > 0 ? (
      <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2">
        {renderedCounters.map((counter) => (
          <div
            key={`counter-chip-${counter.elementId}`}
            title={
              isPlaytest && !counter.isVisible
                ? HIDDEN_PLAYTEST_COUNTER_HINT
                : undefined
            }
            className={`game-counter-chip relative flex items-center gap-1.5 rounded-full border border-white/12 bg-slate-950/55 px-2.5 py-1 text-xs font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,0.28)] backdrop-blur-md ${
              pulsingCounterTokens[counter.name] !== undefined
                ? 'animate-counter-chip-pulse'
                : ''
            } ${isPlaytest && !counter.isVisible ? 'opacity-50' : ''}`}
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
              {renderElementPreviewIcon(counter.elementId, 'chip')}
            </div>
            <span>{`${counter.name}(${counter.value})`}</span>
            {(counterChipDeltasByName[counter.name] ?? []).map((delta) => (
              <span
                key={delta.id}
                className={`animate-counter-delta-float pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 text-xs font-black ${
                  delta.delta > 0 ? 'text-emerald-200' : 'text-rose-200'
                }`}
              >
                {delta.delta > 0 ? `+${delta.delta}` : `${delta.delta}`}
              </span>
            ))}
          </div>
        ))}
      </div>
    ) : null;

  const normalizedCurrentPostId = currentPostId
    ? normalizeRedditPostId(currentPostId)
    : null;
  const commentsTarget = (() => {
    if (isPlaytest) {
      return null;
    }

    if (ruleset.kind === 'base') {
      return {
        postId: LEGACY_COMMENTS_POST_ID,
        url: LEGACY_COMMENTS_URL,
      };
    }

    if (!currentSharePostId) {
      return null;
    }

    const sharePostId = normalizeRedditPostId(currentSharePostId);
    return {
      postId: sharePostId,
      url: `https://www.reddit.com/comments/${sharePostId}/`,
    };
  })();
  const commentsTargetUrl =
    commentsTarget && commentsTarget.postId !== normalizedCurrentPostId
      ? commentsTarget.url
      : null;
  const shareTargetUrl = commentsTarget?.url ?? null;
  const isInsideRealmMenu = (target: Node) =>
    Boolean(
      realmMenuAnchorRef.current?.contains(target) ||
      realmMenuPanelRef.current?.contains(target)
    );

  const handleOpenComments = () => {
    if (!commentsTargetUrl) {
      return;
    }

    setShowRealmMenu(false);
    navigateTo(commentsTargetUrl);
  };

  const handleShareRealm = async () => {
    if (!shareTargetUrl) {
      return;
    }

    setShowRealmMenu(false);
    try {
      await showShareSheet({
        title: ruleset.title,
        text: shareTargetUrl,
        data: shareTargetUrl,
      });
    } catch (error) {
      console.error(error);
      showToast('Failed to open share sheet');
    }
  };

  const canSubmitRealmReview =
    !isPlaytest &&
    ruleset.kind === 'mod' &&
    !!ruleset.sourceModId &&
    !!currentSharePostId &&
    !!username;

  const submitRealmReview = async (source: RealmReviewSource) => {
    const text = realmReviewText.trim();
    if (!canSubmitRealmReview || !ruleset.sourceModId || text.length === 0) {
      return;
    }

    setIsRealmReviewSubmitting(true);
    setRealmReviewError(null);

    try {
      await trpc.mods.submitReview.mutate({
        modId: ruleset.sourceModId,
        text,
      });
      setRealmReviewText('');
      if (source === 'completion') {
        dismissCompletionPopup();
      } else {
        closeActiveScriptedPopup();
      }
      setShowReviewThanksPopup(true);
    } catch (error) {
      console.error(error);
      setRealmReviewError('Could not post your review. Please try again.');
      showToast('Failed to post review');
    } finally {
      setIsRealmReviewSubmitting(false);
    }
  };

  const skipRealmReview = (source: RealmReviewSource) => {
    if (source === 'completion') {
      dismissCompletionPopup();
    } else {
      closeTerminalScriptedPopup();
    }
    setShowReviewActionsPopup(true);
  };

  const openReviewPost = () => {
    if (!commentsTarget?.url) {
      setShowReviewThanksPopup(false);
      return;
    }

    setShowReviewThanksPopup(false);
    navigateTo(commentsTarget.url);
  };

  const renderRealmReviewPrompt = (source: RealmReviewSource) => {
    const trimmedReviewText = realmReviewText.trim();
    const isSubmitDisabled =
      !canSubmitRealmReview ||
      trimmedReviewText.length === 0 ||
      isRealmReviewSubmitting;

    return (
      <div className="space-y-3 text-left">
        <textarea
          id={`realm-review-${source}`}
          aria-label={`Leave a review for ${authorUsername}`}
          value={realmReviewText}
          onChange={(event) => {
            setRealmReviewText(event.target.value);
            setRealmReviewError(null);
          }}
          maxLength={5_000}
          rows={4}
          disabled={!canSubmitRealmReview || isRealmReviewSubmitting}
          placeholder={`Leave a review for r/${authorUsername}`}
          className="min-h-28 w-full resize-none rounded-2xl border border-white/12 bg-slate-950/45 px-4 py-3 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-white/38 focus:border-white/30 focus:bg-slate-950/62 disabled:cursor-not-allowed disabled:opacity-60"
        />

        {realmReviewError && (
          <p className="rounded-xl border border-rose-200/18 bg-rose-950/35 px-3 py-2 text-center text-xs font-semibold text-rose-100">
            {realmReviewError}
          </p>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <button
            type="button"
            onClick={() => void submitRealmReview(source)}
            disabled={isSubmitDisabled}
            className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 py-3 font-bold text-amber-950 transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:scale-100"
          >
            <IoSendSharp />
            {isRealmReviewSubmitting ? 'Posting...' : 'Post review'}
          </button>
          <button
            type="button"
            onClick={() => skipRealmReview(source)}
            className="min-h-12 cursor-pointer rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm font-bold text-white transition-all hover:scale-[1.02] hover:bg-white/10 active:scale-95"
          >
            Skip
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className="realm-page-plain bg-main text-primary flex h-screen w-screen touch-none flex-col overflow-hidden font-sans select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Worktable Area */}
      <div
        ref={containerRef}
        className={`bg-table-gradient relative flex-1 ${isPlaytest ? 'pt-8' : ''}`}
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
              className="cursor-pointer rounded-full border border-cyan-200/25 bg-cyan-400/12 px-2.5 py-0.5 text-[10px] tracking-wide text-cyan-50 uppercase transition-colors hover:bg-cyan-400/20"
            >
              Return to Editor
            </button>
          </div>
        )}
        {hasStorm && (
          <div className="pointer-events-none absolute inset-0 z-[1] bg-slate-950/35 transition-opacity duration-700" />
        )}
        {hasSnow && (
          <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
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
          <div className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-screen">
            {starDrops.current.map((style, i) => (
              <div
                key={`star-${i}`}
                className="absolute animate-pulse rounded-full bg-white shadow-[0_0_10px_2px_rgba(255,255,255,0.8)]"
                style={style}
              />
            ))}
          </div>
        )}
        {stormFlashVisible && (
          <div className="storm-flash pointer-events-none absolute inset-0 z-10" />
        )}
        {/* Background Decoration */}
        <div className="pointer-events-none absolute inset-0 mt-[-10%] flex items-center justify-center overflow-hidden opacity-[0.03] select-none">
          <span className="font-serif text-[60vh] leading-none">☿</span>
        </div>
        {hasSnow && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[8] h-24 overflow-visible">
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
        <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex flex-col items-center px-6 text-center">
          {showRealmIntro ? (
            <div className="max-w-3xl rounded-[2rem] border border-white/8 bg-slate-950/18 px-6 py-5 shadow-[0_14px_44px_rgba(15,23,42,0.18)] backdrop-blur-sm">
              <h1 className="text-primary mb-3 text-2xl font-black tracking-tight opacity-65">
                {ruleset.title}
              </h1>
              <MarkdownBody
                markdown={ruleset.intro}
                className="text-base leading-relaxed text-slate-100/72 sm:text-xl"
              />
            </div>
          ) : ruleset.kind === 'base' && discovered.length === 4 ? (
            <h2 className="text-primary animate-bounce-subtle text-2xl font-black tracking-tight">
              Welcome to the Alchemy! Drag elements here to combine them and
              create the world!
            </h2>
          ) : ruleset.kind === 'base' ? (
            <>
              <h1 className="text-primary mb-1 text-xl font-bold tracking-tight opacity-40">
                Alchemy Game
              </h1>
              <p className="text-tertiary text-lg">
                {nextKeyItem ? (
                  <>
                    Next key element:{' '}
                    <span className="text-secondary font-bold capitalize">
                      {nextKeyItem.replace('-', ' ')}
                    </span>
                  </>
                ) : (
                  'All key items discovered!'
                )}
              </p>
            </>
          ) : null}
        </div>
        {!ruleset.showPalette && counterBar && (
          <div
            className={`absolute inset-x-0 bottom-4 z-30 ${
              isPlaytest ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            {counterBar}
          </div>
        )}
        {reactionMessages.length > 0 && (
          <div
            className={`pointer-events-none absolute inset-x-0 z-[120] flex justify-center pr-14 pl-14 ${
              isPlaytest ? 'top-10' : 'top-2'
            }`}
          >
            <button
              type="button"
              onClick={() => setReactionMessages([])}
              className="pointer-events-auto w-fit max-w-full cursor-pointer rounded-[1.35rem] border border-cyan-200/22 bg-slate-950/92 px-4 py-2 text-left text-sm font-semibold text-cyan-50 shadow-[0_14px_32px_rgba(2,6,23,0.42)] backdrop-blur-xl transition-colors hover:bg-slate-950"
            >
              <div className="flex flex-col">
                {reactionMessages
                  .slice(0, visibleReactionMessageCount)
                  .map((reactionMessage, index) => (
                    <div key={`${index}-${reactionMessage}`}>
                      {index > 0 && (
                        <div className="my-2 border-t border-cyan-200/18" />
                      )}
                      <span className="block break-words whitespace-pre-line">
                        {reactionMessage}
                      </span>
                    </div>
                  ))}
              </div>
            </button>
          </div>
        )}

        <div
          ref={realmMenuAnchorRef}
          className="absolute top-2 left-2 z-30"
          onPointerEnter={() => {
            if (!hoverSupported || hasBlockingScriptedPopup) {
              return;
            }
            setShowRealmMenu(true);
          }}
          onPointerLeave={(event) => {
            if (!hoverSupported) {
              return;
            }

            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && isInsideRealmMenu(nextTarget)) {
              return;
            }
            setShowRealmMenu(false);
          }}
          onFocusCapture={() => {
            if (hasBlockingScriptedPopup) {
              return;
            }
            setShowRealmMenu(true);
          }}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && isInsideRealmMenu(nextTarget)) {
              return;
            }
            setShowRealmMenu(false);
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (hasBlockingScriptedPopup) {
                return;
              }

              if (!hoverSupported) {
                setShowRealmMenu((current) => !current);
                return;
              }

              setShowRealmMenu(true);
            }}
            className="realm-button-muted flex h-10 w-10 cursor-pointer items-center justify-center rounded-full shadow-lg backdrop-blur-sm transition-colors disabled:cursor-default disabled:opacity-50"
            title="Realm Menu"
            aria-label="Open realm menu"
            aria-expanded={showRealmMenu}
            disabled={hasBlockingScriptedPopup}
          >
            <span
              aria-hidden="true"
              className="relative -top-[4px] text-[1.35rem] leading-none"
            >
              ☿
            </span>
          </button>
        </div>

        <button
          onClick={() => {
            if (hasBlockingScriptedPopup) {
              return;
            }
            setShowOptions(true);
          }}
          className="realm-button-muted absolute top-2 right-2 z-30 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full shadow-lg backdrop-blur-sm transition-colors disabled:cursor-default disabled:opacity-50"
          title="Options"
          disabled={hasBlockingScriptedPopup}
        >
          <IoSettingsSharp size={24} />
        </button>
      </div>

      {ruleset.showPalette && counterBar}

      {/* Palette Area */}
      {ruleset.showPalette && (
        <div className="realm-panel border-palette bg-palette relative z-10 flex h-60 flex-col overflow-hidden border-t">
          <div className="relative z-10 px-4 pt-3 pb-1">
            {showMobileFilter ? (
              <div
                className="flex w-full items-center gap-1 pb-1"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setFilterQuery('');
                    setShowMobileFilter(false);
                    setCurrentPage(0);
                  }}
                  className="mr-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-white transition-transform active:scale-90"
                >
                  <IoCloseSharp size={18} />
                </button>
                <div className="no-scrollbar flex w-full touch-pan-x items-center gap-1 overflow-x-auto">
                  {'abcdefghijklmnopqrstuvwxyz'
                    .split('')
                    .filter((char) =>
                      discovered.some((el) => el.toLowerCase().startsWith(char))
                    )
                    .map((char) => (
                      <button
                        key={char}
                        onClick={() => {
                          setFilterQuery(char);
                          setCurrentPage(0);
                        }}
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-sm font-bold uppercase transition-all active:scale-95 ${
                          filterQuery === char
                            ? 'scale-105 bg-blue-500 text-white shadow-lg'
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
                  <h2 className="text-secondary text-xs font-bold tracking-wider uppercase">
                    {filterQuery
                      ? `Elements (${filterQuery.toUpperCase()})`
                      : 'Elements'}
                  </h2>
                  {/* Mobile Filter Button */}
                  <button
                    onClick={() => setShowMobileFilter(true)}
                    className="text-tertiary hover:text-primary rounded-full bg-white/5 p-1.5 transition-colors hover:bg-white/10 active:scale-95 sm:hidden"
                  >
                    <IoSearchSharp size={14} />
                  </button>
                  {/* Desktop Hint - Leaned to caption */}
                  <span className="text-tertiary ml-2 hidden text-[11px] opacity-40 sm:inline-block">
                    {filterQuery
                      ? 'Press ESC to cancel filter'
                      : pages.length > 1
                        ? 'Type any letter to filter'
                        : ''}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-tertiary text-[10px]">
                    {discovered.length}/{totalElementsCount} Discovered
                  </span>
                </div>
              </div>
            )}
          </div>

          <div
            className="relative z-10 flex-1 overflow-hidden"
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
                transitionProperty:
                  isGesturingPalette.current === 'swiping'
                    ? 'none'
                    : 'transform',
              }}
            >
              {pages.map((page, pageIdx) => (
                <div
                  key={pageIdx}
                  className="grid h-full min-w-full grid-rows-3 gap-1.5 px-4 pb-2"
                  style={{
                    gridTemplateColumns: `repeat(${layoutCols}, minmax(0, 1fr))`,
                  }}
                >
                  {page.map((name) => (
                    <div
                      key={`${pageIdx}-${name}`}
                      className="relative h-full cursor-pointer active:scale-95"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onPaletteDown(e, name);
                      }}
                    >
                      {renderElementWidget(name)}
                    </div>
                  ))}
                  {pageIdx === 0 &&
                    discovered.length >= 6 &&
                    discovered.length < 12 && (
                      <div className="text-primary pointer-events-none col-span-6 row-start-3 flex items-center justify-center text-[9px] font-bold tracking-[0.2em] uppercase italic opacity-30">
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
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${i === currentPage ? 'palette-dot-active' : 'palette-dot'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Elements Layer */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {elements.map((el) => {
          const isDragging = dragging === el.id;
          const isReactive = reactiveIDs.includes(el.id);
          const isShaking = shakingIDs[el.id];
          const isExploding = explodingIDs[el.id];
          const footprint = getBoardFootprintForElement(el);
          const usesPlankWrapper = footprint.isPlank;
          const usesDynamicWrapper = usesPlankWrapper || ruleset.compactElements;
          const boardTileSize: ElementTileSize = ruleset.compactElements
            ? 'small'
            : 'large';
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
          const wrapperStyle: BoardElementWrapperStyle = {
            left: el.x,
            top: el.y,
            ...(usesDynamicWrapper
              ? {
                  height: `${footprint.height}px`,
                  marginLeft: `-${footprint.width / 2}px`,
                  marginTop: `-${footprint.height / 2}px`,
                  width: `${footprint.width}px`,
                }
              : {}),
            '--push-x': pushVector ? `${pushVector.x}px` : '0px',
            '--push-y': pushVector ? `${pushVector.y}px` : '0px',
          };

          return (
            <div
              key={el.id}
              className={`pointer-events-auto absolute touch-none select-none ${
                usesDynamicWrapper ? '' : 'mt-[-40px] ml-[-40px] h-20 w-20'
              } ${isDragging ? 'z-[100] scale-110 cursor-grabbing' : 'z-50 cursor-grab'} ${motionClass} ${!isDragging && !isExploding && !pushVector ? 'element-transition' : ''}`}
              style={wrapperStyle}
              onPointerDown={(e) => handlePointerDown(e, el.id)}
            >
              {renderElementWidget(
                el.name,
                boardTileSize,
                false,
                isReactive,
                el.icon,
                usesPlankWrapper ? 'plank' : 'tile'
              )}

              {/* Scientist Hint Bubble */}
              {el.hint && hasElementEffect(el.name, 'hint') && (
                <div
                  className="animate-bounce-subtle pointer-events-auto absolute -top-24 left-1/2 z-[200] -translate-x-1/2 cursor-pointer"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    closeHint(el.id);
                  }}
                >
                  <div className="relative min-w-[140px] rounded-2xl border-2 border-slate-200 bg-white p-3 text-center text-black shadow-xl drop-shadow-lg filter">
                    {el.hint === 'nothing' ? (
                      <span className="text-sm font-bold">
                        No discoveries left!
                      </span>
                    ) : (
                      <div className="flex flex-col items-center">
                        {(() => {
                          const idNum = parseInt(el.id.replace('el-', '')) || 0;
                          const phrases = [
                            "I'm sure you could create:",
                            'Theory suggests crafting:',
                            'Have you tried making:',
                          ];
                          const phrase = phrases[idNum % phrases.length];
                          return (
                            <span className="mb-1 px-2 text-[10px] leading-tight font-medium tracking-wide text-gray-500 uppercase">
                              {phrase}
                            </span>
                          );
                        })()}
                        <span className="text-secondary pb-1 text-lg leading-none font-black capitalize">
                          {el.hint?.replace(/-/g, ' ')}
                        </span>
                      </div>
                    )}
                    {/* Triangle arrow */}
                    <div className="absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-t-[10px] border-r-[8px] border-l-[8px] border-t-white border-r-transparent border-l-transparent" />
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
            className="animate-flash pointer-events-none absolute z-[200] mt-[-64px] ml-[-64px] h-32 w-32 rounded-full bg-white blur-xl"
            style={{ left: flash.x, top: flash.y }}
          />
        )}
      </div>

      {showOptions && (
        <div
          className="animate-fade-in absolute inset-0 z-[1000] flex items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="animate-scale-in relative w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--card-bg)] p-8 shadow-2xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setShowOptions(false);
                setConfirmWipe(false);
              }}
              className="text-tertiary hover:text-primary absolute top-4 right-4 cursor-pointer p-2 transition-colors"
            >
              <IoCloseSharp size={28} />
            </button>

            <h2 className="text-primary mb-6 text-2xl font-bold">Options</h2>

            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <span className="text-secondary text-sm font-medium">
                  Author
                </span>
                <span className="text-primary text-lg font-bold">
                  {authorUsername}
                </span>
              </div>
              <a href="https://www.flaticon.com/free-icons/sand" title="icons">
                Some icons were created by Freepik - Flaticon
              </a>

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
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3 font-bold text-slate-950 shadow-lg transition-all hover:scale-[1.02] active:scale-95"
                  >
                    <IoCreateOutline />
                    Edit Realm
                  </button>
                )}

                {canCopyModData && (
                  <button
                    onClick={() => {
                      void copyModData();
                    }}
                    className="w-full cursor-pointer rounded-xl bg-violet-500 py-3 font-bold text-white shadow-lg transition-all hover:scale-[1.02] hover:bg-violet-600 active:scale-95"
                  >
                    Copy Mod Data
                  </button>
                )}

                <button
                  onClick={() => {
                    if (!confirmWipe) {
                      setConfirmWipe(true);
                      return;
                    }
                    resetProgressAndStartOver();
                  }}
                  onMouseLeave={() => setConfirmWipe(false)}
                  className={`w-full rounded-xl py-3 font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 ${
                    confirmWipe
                      ? 'animate-pulse bg-orange-600 hover:bg-orange-700'
                      : 'bg-[var(--button-danger)] hover:bg-[var(--button-danger-hover)]'
                  }`}
                >
                  {confirmWipe
                    ? 'Are you sure? Click again'
                    : 'Wipe All Progress'}
                </button>

                {isAuthor && (
                  <button
                    onClick={() => {
                      const allElements = Object.keys(ruleset.elementStyles);
                      setDiscovered(allElements);
                      if (!isPlaytest) {
                        trpc.progress.save
                          .mutate({ discovered: allElements, progressScope })
                          .catch(console.error);
                      }
                      setShowOptions(false);
                    }}
                    className="w-full cursor-pointer rounded-xl bg-[var(--button-primary)] py-3 font-bold text-white shadow-lg transition-all hover:scale-[1.02] hover:bg-[var(--button-primary-hover)] active:scale-95"
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
        <div className="animate-fade-in absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xl">
          <div className="animate-scale-in relative mx-4 w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-slate-800 p-8 text-center shadow-[0_0_50px_rgba(255,255,255,0.1)]">
            {/* Celebrational Decor */}
            <div className="absolute -top-24 -left-24 h-48 w-48 animate-pulse rounded-full bg-blue-500/20 blur-3xl" />
            <div className="absolute -right-24 -bottom-24 h-48 w-48 animate-pulse rounded-full bg-purple-500/20 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 m-2 rounded-3xl border-2 border-dashed border-white/5" />

            <div className="relative z-10">
              <div className="mb-2 text-sm font-bold tracking-widest text-blue-400 uppercase">
                New Key Item Discovered!
              </div>
              <h2 className="mb-6 text-4xl font-black text-white capitalize">
                {discoveryPopup.replace('-', ' ')}
              </h2>

              <div className="relative mb-8 flex justify-center">
                <div className="absolute inset-0 scale-150 animate-pulse rounded-full bg-white/10 blur-2xl" />
                <div className="rotate-3">
                  {renderModalElementCard(discoveryPopup, 'hero')}
                </div>
              </div>

              <div className="mb-8 space-y-4 px-2">
                <p className="text-lg leading-relaxed font-medium text-white italic">
                  "{ruleset.keyItemData[discoveryPopup]?.description}"
                </p>
                <p className="text-sm leading-snug text-blue-200 opacity-90">
                  {ruleset.keyItemData[discoveryPopup]?.motivation}
                </p>
              </div>

              <button
                onClick={() => setDiscoveryPopup(null)}
                className="w-full cursor-pointer rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 py-4 font-black text-white shadow-[0_4px_20px_rgba(59,130,246,0.5)] transition-all hover:scale-[1.02] active:scale-95"
              >
                AWESOME!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Computer Popup */}
      {computerPopup && (
        <div className="animate-fade-in absolute inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-xl">
          <div className="animate-scale-in relative mx-4 flex max-h-[90vh] w-full max-w-lg flex-col rounded-[2rem] border border-blue-500/20 bg-[#0f172a] p-8 text-white shadow-[0_0_100px_rgba(30,144,255,0.2)]">
            {/* Glow effects */}
            <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-blue-600/10 blur-[100px]" />
            <div className="absolute -right-32 -bottom-32 h-64 w-64 rounded-full bg-cyan-600/10 blur-[100px]" />

            <button
              onClick={() => setComputerPopup(null)}
              className="absolute top-6 right-6 z-20 cursor-pointer p-2 text-blue-300/50 transition-colors hover:text-white"
            >
              <IoCloseSharp size={28} />
            </button>

            <div className="relative z-10 flex h-full flex-col overflow-hidden">
              <div className="flex-shrink-0">
                <div className="mb-8 flex items-center justify-center gap-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-900/30 shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                    <span className="text-5xl drop-shadow-lg">💻</span>
                  </div>
                  <div className="h-px w-8 bg-blue-400/20" />
                  {renderModalElementCard(computerPopup)}
                </div>

                <h3 className="mb-1 bg-gradient-to-r from-blue-300 to-cyan-200 bg-clip-text text-center text-3xl font-black tracking-tight text-transparent">
                  {getElementDisplayName(computerPopup)}
                </h3>
                <p className="mb-8 text-center text-sm font-medium tracking-[0.2em] text-blue-300/60 uppercase">
                  Reaction Database
                </p>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/5 bg-black/40">
                  <div className="divide-y divide-white/5">
                    {getRecipesForElementInRuleset(ruleset, computerPopup)
                      .length === 0 && (
                      <div className="px-6 py-12 text-center">
                        <p className="text-sm font-bold tracking-widest text-blue-300/40 uppercase italic">
                          Primary Elemental Force
                        </p>
                        <p className="mt-2 text-[10px] text-blue-400/20">
                          This element exists since the beginning of time.
                          <br />
                          No synthesis patterns detected.
                        </p>
                      </div>
                    )}
                    {getRecipesForElementInRuleset(ruleset, computerPopup).map(
                      (recipe, idx) => {
                        const a = recipe[0];
                        const b = recipe[1];
                        if (!a || !b) return null;

                        const aFound = discovered.includes(a);
                        const bFound = discovered.includes(b);

                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-center gap-4 px-4 py-8 transition-colors hover:bg-white/5"
                          >
                            <div className="h-16 w-16">
                              {renderElementWidget(a, 'small', !aFound)}
                            </div>
                            <span className="text-2xl font-black text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]">
                              +
                            </span>
                            <div className="h-16 w-16">
                              {renderElementWidget(b, 'small', !bFound)}
                            </div>
                            <span className="text-2xl font-black text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]">
                              =
                            </span>
                            <div className="h-16 w-16">
                              {renderElementWidget(computerPopup, 'small')}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex-shrink-0">
                <button
                  onClick={() => setComputerPopup(null)}
                  className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 py-4 font-bold text-white shadow-lg shadow-blue-900/40 transition-all hover:scale-[1.02] active:scale-95"
                >
                  CLOSE DATABASE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCompletionPopup && (
        <div className="animate-fade-in absolute inset-0 z-[2400] flex items-center justify-center bg-black/60 backdrop-blur-xl">
          <div className="animate-scale-in relative mx-4 w-full max-w-md overflow-hidden rounded-[2rem] border border-amber-200/30 bg-[linear-gradient(180deg,rgba(120,53,15,0.95),rgba(14,116,144,0.94))] p-8 text-center text-white shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.28),transparent_55%)]" />
            <div className="relative z-10">
              <div className="mb-3 text-[11px] font-bold tracking-[0.28em] text-amber-100 uppercase">
                Realm Mastered
              </div>
              <div className="mb-5 flex justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-amber-200/30 bg-amber-100/10 text-5xl shadow-lg">
                  🏆
                </div>
              </div>
              <h3 className="mb-3 text-3xl font-black tracking-tight">
                Every element discovered
              </h3>
              <p className="mb-6 text-base leading-relaxed text-white/90">
                You found everything this realm has to offer.
              </p>
              {renderRealmReviewPrompt('completion')}
            </div>
          </div>
        </div>
      )}

      {/* Scripted Popup Queue */}
      {activeScriptedPopup && (
        <div className="animate-fade-in absolute inset-0 z-[2500] flex items-center justify-center bg-black/65 backdrop-blur-xl">
          <div
            className={`animate-scale-in relative mx-4 w-full max-w-md overflow-hidden rounded-[2rem] border p-8 text-center text-white shadow-2xl ${
              activeScriptedPopup.kind === 'win'
                ? 'border-amber-300/30 bg-[linear-gradient(180deg,rgba(120,53,15,0.94),rgba(6,78,59,0.94))]'
                : activeScriptedPopup.kind === 'lose'
                  ? 'border-rose-300/20 bg-[linear-gradient(180deg,rgba(69,10,10,0.95),rgba(30,41,59,0.96))]'
                  : 'border-white/15 bg-slate-900/96'
            }`}
          >
            <div
              className={`absolute inset-0 ${
                activeScriptedPopup.kind === 'win'
                  ? 'bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.28),transparent_55%)]'
                  : activeScriptedPopup.kind === 'lose'
                    ? 'bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.2),transparent_55%)]'
                    : 'bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.12),transparent_55%)]'
              }`}
            />
            {activeScriptedPopup.kind === 'win' && (
              <>
                <div className="absolute -top-10 left-8 h-24 w-24 rounded-full bg-yellow-300/20 blur-3xl" />
                <div className="absolute right-10 bottom-0 h-28 w-28 rounded-full bg-emerald-300/15 blur-3xl" />
              </>
            )}
            {activeScriptedPopup.kind === 'lose' && (
              <>
                <div className="absolute -top-8 left-8 h-24 w-24 rounded-full bg-rose-300/15 blur-3xl" />
                <div className="absolute right-8 bottom-0 h-24 w-24 rounded-full bg-sky-300/10 blur-3xl" />
              </>
            )}

            <div className="relative z-10">
              <div
                className={`mb-3 text-[11px] font-bold tracking-[0.28em] uppercase ${
                  activeScriptedPopup.kind === 'win'
                    ? 'text-amber-100'
                    : activeScriptedPopup.kind === 'lose'
                      ? 'text-rose-200'
                      : 'text-slate-300'
                }`}
              >
                {activeScriptedPopup.kind === 'win'
                  ? 'Realm Complete'
                  : activeScriptedPopup.kind === 'lose'
                    ? 'Realm Failed'
                    : 'Realm Message'}
              </div>

              <div className="mb-6 flex justify-center">
                {activeScriptedPopup.iconElementId ? (
                  renderModalElementCard(
                    activeScriptedPopup.iconElementId,
                    activeScriptedPopup.kind === 'popup' ? 'compact' : 'hero'
                  )
                ) : (
                  <div
                    className={`flex items-center justify-center rounded-full border text-5xl shadow-lg ${
                      activeScriptedPopup.kind === 'win'
                        ? 'h-28 w-28 border-amber-200/30 bg-amber-100/10'
                        : activeScriptedPopup.kind === 'lose'
                          ? 'h-28 w-28 border-rose-200/20 bg-rose-100/8'
                          : 'h-20 w-20 border-white/10 bg-white/5 text-4xl'
                    }`}
                  >
                    {activeScriptedPopup.kind === 'win'
                      ? '🏆'
                      : activeScriptedPopup.kind === 'lose'
                        ? '☁️'
                        : '✨'}
                  </div>
                )}
              </div>

              {(activeScriptedPopup.iconElementId ||
                activeScriptedPopup.kind !== 'popup') && (
                <h3 className="mb-4 text-3xl font-black tracking-tight">
                  {activeScriptedPopup.iconElementId
                    ? getElementDisplayName(activeScriptedPopup.iconElementId)
                    : activeScriptedPopup.kind === 'win'
                      ? 'Victory'
                      : 'Defeat'}
                </h3>
              )}

              <MarkdownBody
                markdown={activeScriptedPopup.text}
                className={`mb-8 px-2 text-base leading-relaxed ${
                  activeScriptedPopup.kind === 'popup'
                    ? 'text-slate-200'
                    : 'text-white/90'
                }`}
              />

              {activeScriptedPopup.kind === 'popup' ? (
                <button
                  onClick={closeActiveScriptedPopup}
                  className="w-full cursor-pointer rounded-2xl border border-white/10 bg-white/8 py-3.5 font-bold text-white transition-all hover:scale-[1.02] hover:bg-white/12 active:scale-95"
                >
                  Continue
                </button>
              ) : (
                renderRealmReviewPrompt('scriptedTerminal')
              )}
            </div>
          </div>
        </div>
      )}

      {showReviewActionsPopup && (
        <div className="animate-fade-in absolute inset-0 z-[2600] flex items-center justify-center bg-black/65 backdrop-blur-xl">
          <div className="animate-scale-in relative mx-4 w-full max-w-md overflow-hidden rounded-[2rem] border border-white/15 bg-slate-900/96 p-8 text-center text-white shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.16),transparent_55%)]" />
            <div className="relative z-10">
              <div className="mb-3 text-[11px] font-bold tracking-[0.28em] text-slate-300 uppercase">
                What Next?
              </div>
              <h3 className="mb-6 text-3xl font-black tracking-tight">
                Choose where to go
              </h3>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={resetProgressAndStartOver}
                  className="w-full cursor-pointer rounded-2xl bg-amber-300 py-3.5 font-bold text-amber-950 transition-all hover:scale-[1.02] active:scale-95"
                >
                  Reset progress and start over
                </button>
                <button
                  type="button"
                  onClick={navigateBackToRealmsList}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 py-3.5 font-bold text-white transition-all hover:scale-[1.02] hover:bg-white/10 active:scale-95"
                >
                  <IoAlbumsSharp />
                  Back to the Realms List
                </button>
                <button
                  type="button"
                  onClick={openCreateMyAlchemy}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 py-3.5 font-bold text-white transition-all hover:scale-[1.02] hover:bg-white/10 active:scale-95"
                >
                  <IoAddSharp />
                  Create My Realm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReviewThanksPopup && (
        <div className="animate-fade-in absolute inset-0 z-[2600] flex items-center justify-center bg-black/65 backdrop-blur-xl">
          <div className="animate-scale-in relative mx-4 w-full max-w-md overflow-hidden rounded-[2rem] border border-amber-200/30 bg-[linear-gradient(180deg,rgba(120,53,15,0.95),rgba(30,41,59,0.96))] p-8 text-center text-white shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.24),transparent_55%)]" />
            <button
              type="button"
              onClick={() => setShowReviewThanksPopup(false)}
              className="absolute top-5 right-5 z-20 cursor-pointer rounded-full border border-white/10 bg-white/8 p-2 text-white/70 transition-colors hover:bg-white/14 hover:text-white"
              aria-label="Close review prompt"
            >
              <IoCloseSharp size={18} />
            </button>

            <div className="relative z-10">
              <div className="mb-3 text-[11px] font-bold tracking-[0.28em] text-amber-100 uppercase">
                Review Posted
              </div>
              <div className="mb-5 flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-amber-200/30 bg-amber-100/10 text-4xl shadow-lg">
                  🏆
                </div>
              </div>
              <h3 className="mb-4 text-3xl font-black tracking-tight">
                Thanks for helping the author
              </h3>
              <p className="mb-6 text-base leading-relaxed text-white/90">
                Your review is now a Reddit comment. If you liked this realm,
                open the game post and upvote it from Reddit so more players
                can find it.
              </p>
              <button
                type="button"
                onClick={openReviewPost}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-amber-300 py-3.5 font-bold text-amber-950 transition-all hover:scale-[1.02] active:scale-95"
              >
                <IoOpenOutline />
                Open Reddit post
              </button>
              <button
                type="button"
                onClick={navigateBackToRealmsList}
                className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 py-3.5 font-bold text-white transition-all hover:scale-[1.02] hover:bg-white/10 active:scale-95"
              >
                <IoAlbumsSharp />
                Back to the Realms List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Popup */}
      {infoPopup && (
        <div className="animate-fade-in absolute inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-md">
          <div className="animate-scale-in relative mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 text-center shadow-xl">
            <div className="relative z-10">
              <div className="mb-2 text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">
                Discovery Note
              </div>
              <h3 className="mb-4 text-2xl font-bold text-white">
                {getElementDisplayName(infoPopup)}
              </h3>

              <div className="mb-6 flex justify-center">
                {renderModalElementCard(infoPopup)}
              </div>

              <MarkdownBody
                markdown={ruleset.elementMessages[infoPopup] ?? ''}
                className="mb-6 px-4 text-sm leading-relaxed text-slate-300"
              />

              <button
                onClick={() => setInfoPopup(null)}
                className="w-full cursor-pointer rounded-xl border border-white/5 bg-slate-800 py-3 font-bold text-white transition-all hover:bg-slate-700 active:scale-95"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
      {showRealmMenu &&
        realmMenuPosition &&
        createPortal(
          <div
            ref={realmMenuPanelRef}
            className="realm-panel-soft fixed z-[10050] flex min-w-[13.5rem] flex-col gap-1 rounded-2xl border border-cyan-200/18 bg-slate-950/92 p-2 text-left shadow-[0_18px_40px_rgba(2,6,23,0.5)] backdrop-blur-xl"
            style={{
              left: realmMenuPosition.left,
              top: realmMenuPosition.top,
            }}
            onPointerEnter={() => {
              if (!hoverSupported || hasBlockingScriptedPopup) {
                return;
              }
              setShowRealmMenu(true);
            }}
            onPointerLeave={(event) => {
              if (!hoverSupported) {
                return;
              }

              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && isInsideRealmMenu(nextTarget)) {
                return;
              }
              setShowRealmMenu(false);
            }}
            onBlurCapture={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && isInsideRealmMenu(nextTarget)) {
                return;
              }
              setShowRealmMenu(false);
            }}
          >
            {commentsTargetUrl && (
              <button
                type="button"
                onClick={handleOpenComments}
                className="cursor-pointer rounded-xl px-3 py-2 text-left text-sm font-semibold text-cyan-50 transition-colors hover:bg-cyan-400/12"
              >
                Comments
              </button>
            )}
            {shareTargetUrl && (
              <button
                type="button"
                onClick={() => {
                  void handleShareRealm();
                }}
                className="cursor-pointer rounded-xl px-3 py-2 text-left text-sm font-semibold text-cyan-50 transition-colors hover:bg-cyan-400/12"
              >
                Share
              </button>
            )}
            <button
              type="button"
              onClick={openAlchemyHub}
              className="cursor-pointer rounded-xl px-3 py-2 text-left text-sm font-semibold text-cyan-50 transition-colors hover:bg-cyan-400/12"
            >
              Alchemy Hub
            </button>
            <button
              type="button"
              onClick={openCreateMyAlchemy}
              className="cursor-pointer rounded-xl px-3 py-2 text-left text-sm font-semibold text-cyan-50 transition-colors hover:bg-cyan-400/12"
            >
              Create my Alchemy!
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};

export const GameRoot = () => {
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
        isModerator: boolean;
        ruleset: ActiveRuleset;
        username: string | null;
        redditDiscovered: string[];
        progressScope: string;
        isPlaytest: boolean;
        currentPostId: string | null;
        currentSharePostId: string | null;
      }
  >({ status: 'loading' });

  useEffect(() => {
    const playtestRuleset = readPlaytestRuleset();
    if (playtestRuleset) {
      setState({
        status: 'ready',
        isModerator: false,
        ruleset: playtestRuleset,
        username: context.username ?? null,
        redditDiscovered: [],
        progressScope: getProgressScope(playtestRuleset),
        isPlaytest: true,
        currentPostId: context.postId ?? null,
        currentSharePostId: null,
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
      .query({
        ...(overrideModId ? { modId: overrideModId } : {}),
        countPlayerOpen: true,
      })
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
          isModerator: response.isModerator ?? false,
          ruleset: response.activeRuleset ?? BASE_RULESET,
          username: response.username ?? null,
          redditDiscovered: response.redditDiscovered ?? [],
          progressScope: response.progressScope,
          isPlaytest: false,
          currentPostId: response.postId ?? context.postId ?? null,
          currentSharePostId: response.activeModListing?.sharePostId ?? null,
        });
      })
      .catch((error) => {
        console.error(error);
        setState({
          status: 'ready',
          isModerator: false,
          ruleset: BASE_RULESET,
          username: context.username ?? null,
          redditDiscovered: [],
          progressScope: 'base',
          isPlaytest: false,
          currentPostId: context.postId ?? null,
          currentSharePostId: null,
        });
      });
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="realm-page-plain flex min-h-screen items-center justify-center">
        <div className="realm-panel rounded-3xl px-6 py-5 text-center backdrop-blur-xl">
          <div className="catalog-title-font realm-text-muted text-xs font-bold tracking-[0.24em] uppercase">
            Alchemy
          </div>
          <div className="mt-2 text-lg font-black">Loading ruleset...</div>
        </div>
      </div>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <div className="realm-page-plain flex min-h-screen items-center justify-center px-4">
        <div className="realm-panel max-w-md rounded-3xl p-8 text-center backdrop-blur-xl">
          <div className="catalog-title-font realm-text-muted text-xs font-bold tracking-[0.24em] uppercase">
            Mod Unavailable
          </div>
          <h1 className="catalog-title-font realm-text-ink mt-2 text-3xl font-black">
            This shared mod cannot be loaded here.
          </h1>
          <p className="realm-text-soft mt-4 text-sm leading-relaxed">
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <GameSession
      key={state.ruleset.storageScope}
      ruleset={state.ruleset}
      initialUsername={state.username}
      isModerator={state.isModerator}
      initialDiscovered={state.redditDiscovered}
      progressScope={state.progressScope}
      isPlaytest={state.isPlaytest}
      currentPostId={state.currentPostId}
      currentSharePostId={state.currentSharePostId}
    />
  );
};
