import './index.css';

import { navigateTo } from '@devvit/web/client';
import {
  StrictMode,
  useEffect,
  useState,
  type MouseEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  IoCreateOutline,
  IoEyeSharp,
  IoLayersSharp,
  IoPlaySharp,
  IoStarSharp,
  IoThumbsUpSharp,
  IoTrophySharp,
} from 'react-icons/io5';
import { PLAYTEST_RULESET_STORAGE_KEY } from './modding/runtime';
import { trpc } from './trpc';
import {
  getRealmSizeLabel,
  getRealmSizeTooltip,
  isEmptyRealmSizeLabel,
} from './mod-size';
import {
  getInlineViewCacheKey,
  isUnknownRecord,
  readInlineViewCache,
  writeInlineViewCache,
} from './inline-view-cache';
import { modListItemSchema, type ModListItem } from './modding/types';
import {
  openEntry,
  setEditorTargetModId,
  setLastPlayedRealm,
} from './webview-navigation';

const CATALOG_TAB_LIMIT = 8;

type CatalogTab = 'featured' | 'best' | 'new' | 'mine';
type CompactCatalogCache = {
  activeTab: CatalogTab;
  bestMods: ModListItem[];
  featuredMods: ModListItem[];
  myMods: ModListItem[];
  newMods: ModListItem[];
};

const isCatalogTab = (value: unknown): value is CatalogTab =>
  value === 'featured' ||
  value === 'best' ||
  value === 'new' ||
  value === 'mine';

const isModListItem = (value: unknown): value is ModListItem =>
  modListItemSchema.safeParse(value).success;

const isCompactCatalogCache = (
  value: unknown
): value is CompactCatalogCache => {
  if (!isUnknownRecord(value)) {
    return false;
  }

  const bestMods = Reflect.get(value, 'bestMods');
  const featuredMods = Reflect.get(value, 'featuredMods');
  const myMods = Reflect.get(value, 'myMods');
  const newMods = Reflect.get(value, 'newMods');

  return (
    isCatalogTab(Reflect.get(value, 'activeTab')) &&
    Array.isArray(bestMods) &&
    bestMods.every(isModListItem) &&
    Array.isArray(featuredMods) &&
    featuredMods.every(isModListItem) &&
    (myMods === undefined ||
      (Array.isArray(myMods) && myMods.every(isModListItem))) &&
    Array.isArray(newMods) &&
    newMods.every(isModListItem)
  );
};

const getCompactCatalogCacheKey = () =>
  getInlineViewCacheKey('mod-catalog-compact');

const stripCompletionCounts = (mods: ModListItem[]): ModListItem[] =>
  mods.map((mod) => {
    const { completionCount, ...cacheableMod } = mod;
    return cacheableMod;
  });

const sortByUpdatedAtDesc = (mods: ModListItem[]): ModListItem[] =>
  [...mods].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

const getInitialCatalogTab = (): CatalogTab => {
  const path = window.location.pathname;
  if (path.includes('mod-catalog-compact-featured')) {
    return 'featured';
  }

  if (path.includes('mod-catalog-compact-new')) {
    return 'new';
  }

  return 'best';
};

const readCachedCompactCatalog = () =>
  readInlineViewCache(getCompactCatalogCacheKey(), (value) =>
    isCompactCatalogCache(value)
      ? {
          ...value,
          bestMods: stripCompletionCounts(value.bestMods),
          featuredMods: stripCompletionCounts(value.featuredMods),
          myMods: stripCompletionCounts(
            Array.isArray(Reflect.get(value, 'myMods')) ? value.myMods : []
          ),
          newMods: stripCompletionCounts(value.newMods),
        }
      : null
  );

const getSharePostUrl = (mod: ModListItem) => {
  if (!mod.sharePostId) {
    return null;
  }

  return `https://www.reddit.com/comments/${mod.sharePostId.replace('t3_', '')}`;
};

const getBestScore = (mod: ModListItem) => {
  if (typeof mod.bestScore === 'number') {
    return mod.bestScore;
  }

  const voteScore = mod.upvotes ?? 0;
  const playerCount = mod.playerCount ?? 0;
  return (
    voteScore / Math.sqrt(Math.max(playerCount, 1)) +
    Math.log1p(playerCount) * 0.35
  );
};

const getDisplayedRating = (mod: ModListItem) => Math.trunc(getBestScore(mod));

const ratingTooltip =
  "Mod's rating based on upvotes, downvotes and player's count";

const renderFeaturedMarker = (mod: ModListItem) =>
  mod.featuredAt ? (
    <span
      className="catalog-text-ink inline-flex items-center"
      title="Editorial choice"
      aria-label="Editorial choice"
    >
      <IoStarSharp className="text-[11px]" />
    </span>
  ) : null;

export const CompactCatalog = () => {
  const [initialCache] = useState<CompactCatalogCache | null>(() =>
    readCachedCompactCatalog()
  );
  const [bestMods, setBestMods] = useState<ModListItem[]>(
    () => initialCache?.bestMods ?? []
  );
  const [featuredMods, setFeaturedMods] = useState<ModListItem[]>(
    () => initialCache?.featuredMods ?? []
  );
  const [myMods, setMyMods] = useState<ModListItem[]>(
    () => initialCache?.myMods ?? []
  );
  const [newMods, setNewMods] = useState<ModListItem[]>(
    () => initialCache?.newMods ?? []
  );
  const [loading, setLoading] = useState(() => initialCache === null);
  const [activeTab, setActiveTab] = useState<CatalogTab>(
    () =>
      initialCache?.activeTab === 'mine' && initialCache.myMods.length === 0
        ? getInitialCatalogTab()
        : (initialCache?.activeTab ?? getInitialCatalogTab())
  );

  useEffect(() => {
    let isDisposed = false;
    let isLoadInFlight = false;

    const fetchMods = async () => {
      if (isLoadInFlight) {
        return;
      }

      isLoadInFlight = true;

      try {
        const [featuredResult, bestResult, newResult, mineResult] =
          await Promise.all([
            trpc.mods.listFeatured.query({ limit: CATALOG_TAB_LIMIT }),
            trpc.mods.listBest.query({ limit: CATALOG_TAB_LIMIT }),
            trpc.mods.listNew.query({ limit: CATALOG_TAB_LIMIT }),
            trpc.mods.listMine.query(),
          ]);
        if (isDisposed) {
          return;
        }

        const nextMyMods = Array.isArray(mineResult)
          ? sortByUpdatedAtDesc(mineResult)
          : [];
        setFeaturedMods(
          Array.isArray(featuredResult) ? featuredResult : []
        );
        setBestMods(Array.isArray(bestResult) ? bestResult : []);
        setNewMods(Array.isArray(newResult) ? newResult : []);
        setMyMods(nextMyMods);
        setActiveTab((current) =>
          current === 'mine' && nextMyMods.length === 0 ? 'best' : current
        );
      } catch (error) {
        console.error('Failed to load compact mods catalog', error);
      } finally {
        if (!isDisposed) {
          setLoading(false);
        }
        isLoadInFlight = false;
      }
    };

    const handleFocus = () => {
      void fetchMods();
    };

    void fetchMods();
    window.addEventListener('focus', handleFocus);

    return () => {
      isDisposed = true;
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    writeInlineViewCache(getCompactCatalogCacheKey(), {
      activeTab,
      bestMods: stripCompletionCounts(bestMods),
      featuredMods: stripCompletionCounts(featuredMods),
      myMods: stripCompletionCounts(myMods),
      newMods: stripCompletionCounts(newMods),
    });
  }, [activeTab, bestMods, featuredMods, loading, myMods, newMods]);

  const visibleMods =
    activeTab === 'featured'
      ? featuredMods
      : activeTab === 'best'
        ? bestMods
        : activeTab === 'new'
          ? newMods
          : myMods;
  const hasMyRealms = myMods.length > 0;
  const tabs: CatalogTab[] = hasMyRealms
    ? ['featured', 'best', 'new', 'mine']
    : ['featured', 'best', 'new'];

  const openRealmPost = (url: string) => {
    navigateTo(url);
  };

  const playPublishedMod = (
    event: MouseEvent<HTMLButtonElement>,
    modId: string,
    title: string
  ) => {
    setLastPlayedRealm({ modId, title });
    localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
    localStorage.setItem('override-mod-id', modId);
    openEntry(event.nativeEvent, 'game');
  };

  const openEditor = (
    event: MouseEvent<HTMLButtonElement>,
    modId?: string
  ) => {
    localStorage.removeItem('override-mod-id');
    setEditorTargetModId(modId ?? null);
    openEntry(event.nativeEvent, 'mod-editor');
  };

  const renderCatalogWidget = (mod: ModListItem) => {
    const url = getSharePostUrl(mod);
    const realmSizeLabel = getRealmSizeLabel(mod.reactionCount);
    const realmSizeTooltip = getRealmSizeTooltip(mod.reactionCount);
    const realmSizeClassName = isEmptyRealmSizeLabel(realmSizeLabel)
      ? 'text-[color:var(--realm-size-empty-text)]'
      : '';
    const displayedRating = getDisplayedRating(mod);
    const playerCountTooltip = `Users played: ${mod.playerCount || 0}`;
    const showCompletionCount = typeof mod.completionCount === 'number';
    const completionCountTooltip = `Users completed: ${mod.completionCount || 0}`;

    return (
      <div
        key={mod.id}
        className="catalog-card catalog-card-hover transition-colors"
      >
        <span aria-hidden="true" className="catalog-corner-lily" />
        {url ? (
          <button
            type="button"
            onClick={() => openRealmPost(url)}
            className="catalog-title-font catalog-header-strip block w-full cursor-pointer px-2.5 py-2 text-center text-[11px] font-bold tracking-[0.12em] uppercase transition-colors"
          >
            <span className="block truncate">{mod.title}</span>
          </button>
        ) : (
          <div className="catalog-title-font catalog-header-strip block w-full px-2.5 py-2 text-center text-[11px] font-bold tracking-[0.12em] uppercase">
            <span className="block truncate">{mod.title}</span>
          </div>
        )}

        <div className="flex min-h-[44px] items-stretch">
          <div className="catalog-body-font flex min-w-0 flex-1 flex-col justify-center px-1.5 py-1">
            <p className="catalog-text-soft line-clamp-1 text-[12px] leading-tight italic">
              {mod.summary || 'No description provided.'}
            </p>
            <div className="catalog-stat-text mt-1 flex items-center gap-3 text-[10px] font-semibold">
              {renderFeaturedMarker(mod)}
              <div className="flex items-center gap-1" title={ratingTooltip}>
                <IoThumbsUpSharp className="text-[11px]" />
                <span>{displayedRating}</span>
              </div>
              <div
                className="flex items-center gap-1"
                title={playerCountTooltip}
              >
                <IoEyeSharp className="text-[11px]" />
                <span>{mod.playerCount || 0}</span>
              </div>
              {showCompletionCount && (
                <div
                  className="flex items-center gap-1"
                  title={completionCountTooltip}
                >
                  <IoTrophySharp className="text-[11px]" />
                  <span>{mod.completionCount || 0}</span>
                </div>
              )}
              <div
                className={`flex items-center gap-1 ${realmSizeClassName}`}
                title={realmSizeTooltip}
              >
                <IoLayersSharp className="text-[11px]" />
                <span>{realmSizeLabel}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={(event) => playPublishedMod(event, mod.id, mod.title)}
            className="catalog-play-button flex w-7 flex-shrink-0 cursor-pointer items-center justify-center transition-colors"
            title="Play realm"
          >
            <IoPlaySharp className="text-[22px]" />
          </button>
        </div>
      </div>
    );
  };

  const renderMyModWidget = (mod: ModListItem) => {
    const isPublished = mod.status === 'published';
    const realmSizeLabel = getRealmSizeLabel(mod.reactionCount);
    const realmSizeTooltip = getRealmSizeTooltip(mod.reactionCount);
    const realmSizeClassName = isEmptyRealmSizeLabel(realmSizeLabel)
      ? 'text-[color:var(--realm-size-empty-text)]'
      : '';
    const displayedRating = getDisplayedRating(mod);
    const playerCountTooltip = `Users played: ${mod.playerCount || 0}`;
    const showCompletionCount = typeof mod.completionCount === 'number';
    const completionCountTooltip = `Users completed: ${mod.completionCount || 0}`;

    return (
      <div
        key={`mine-${mod.id}`}
        className="catalog-card catalog-card-hover transition-colors"
      >
        <span aria-hidden="true" className="catalog-corner-lily" />
        <button
          type="button"
          onClick={(event) => openEditor(event, mod.id)}
          className="catalog-title-font catalog-header-strip flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-left text-[11px] font-bold tracking-[0.12em] uppercase transition-colors"
        >
          <span className="block min-w-0 flex-1 truncate">{mod.title}</span>
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[8px] tracking-[0.12em] ${
              isPublished ? 'catalog-status-published' : 'catalog-status-draft'
            }`}
          >
            {mod.status}
          </span>
        </button>

        <div className="flex min-h-[44px] items-stretch">
          <div className="catalog-body-font flex min-w-0 flex-1 flex-col justify-center px-1.5 py-1">
            <p className="catalog-text-soft line-clamp-1 text-[12px] leading-tight italic">
              {mod.summary || 'No description provided.'}
            </p>
            <div className="catalog-stat-text mt-1 flex items-center gap-3 text-[10px] font-semibold">
              {renderFeaturedMarker(mod)}
              <div className="flex items-center gap-1" title={ratingTooltip}>
                <IoThumbsUpSharp className="text-[11px]" />
                <span>{displayedRating}</span>
              </div>
              <div
                className="flex items-center gap-1"
                title={playerCountTooltip}
              >
                <IoEyeSharp className="text-[11px]" />
                <span>{mod.playerCount || 0}</span>
              </div>
              {showCompletionCount && (
                <div
                  className="flex items-center gap-1"
                  title={completionCountTooltip}
                >
                  <IoTrophySharp className="text-[11px]" />
                  <span>{mod.completionCount || 0}</span>
                </div>
              )}
              <div
                className={`flex items-center gap-1 ${realmSizeClassName}`}
                title={realmSizeTooltip}
              >
                <IoLayersSharp className="text-[11px]" />
                <span>{realmSizeLabel}</span>
              </div>
            </div>
          </div>

          {isPublished && (
            <button
              type="button"
              onClick={(event) => playPublishedMod(event, mod.id, mod.title)}
              className="catalog-play-button flex w-7 flex-shrink-0 cursor-pointer items-center justify-center transition-colors"
              title="Play realm"
            >
              <IoPlaySharp className="text-[22px]" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="catalog-parchment catalog-side-ornament relative flex h-screen w-full flex-col items-center overflow-hidden px-2 py-3 sm:px-3">
      <div
        aria-hidden="true"
        className="catalog-top-art pointer-events-none absolute top-0 left-1/2 h-[250px] w-screen -translate-x-1/2 bg-cover bg-top"
      />
      <div className="catalog-top-art-overlay pointer-events-none absolute inset-x-0 top-0 h-[250px]" />

      <div className="relative z-10 flex h-full w-full max-w-5xl flex-col gap-3 sm:gap-4 sm:px-2">
        <div className="relative flex min-h-[48px] items-center justify-center px-24">
          <div className="catalog-title-font catalog-text-ink text-center text-xl font-bold tracking-[0.18em] uppercase sm:text-2xl">
            <h1>User Realms</h1>
          </div>

          <button
            type="button"
            onClick={openEditor}
            className="catalog-title-font catalog-action-button absolute top-0 right-0 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-[11px] font-bold tracking-[0.12em] uppercase transition-colors"
          >
            <IoCreateOutline />
            Create
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Catalog sections"
          className={`grid w-full gap-2 ${hasMyRealms ? 'grid-cols-4 sm:max-w-2xl' : 'grid-cols-3 sm:max-w-md'}`}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            const label =
              tab === 'featured'
                ? 'Featured'
                : tab === 'best'
                  ? 'Best'
                  : tab === 'new'
                    ? 'New'
                    : 'My Realms';

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab)}
                className={`catalog-title-font cursor-pointer rounded-2xl border px-1.5 py-2 text-[10px] font-bold tracking-[0.08em] uppercase transition-colors sm:px-4 sm:text-[11px] sm:tracking-[0.16em] ${
                  isActive
                    ? 'border-[color:var(--catalog-soft-border)] bg-[color:var(--catalog-play-hover)] text-[color:var(--catalog-play-hover-text)]'
                    : 'catalog-action-button'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="catalog-title-font catalog-text-muted flex flex-1 items-center justify-center text-center text-sm font-bold tracking-[0.08em] uppercase">
              Loading realms...
            </div>
          ) : bestMods.length === 0 &&
            featuredMods.length === 0 &&
            newMods.length === 0 ? (
            <div className="catalog-title-font catalog-text-muted flex flex-1 items-center justify-center text-center text-sm font-bold tracking-[0.08em] uppercase">
              No realms published yet.
            </div>
          ) : visibleMods.length === 0 ? (
            <div className="catalog-title-font catalog-text-muted flex flex-1 items-center justify-center text-center text-sm font-bold tracking-[0.08em] uppercase">
              {activeTab === 'featured'
                ? 'No featured realms yet.'
                : 'No realms here yet.'}
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-4 gap-2 sm:gap-3">
              {activeTab === 'mine'
                ? visibleMods.map(renderMyModWidget)
                : visibleMods.map(renderCatalogWidget)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CompactCatalog />
  </StrictMode>
);
