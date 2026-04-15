import './index.css';

import { navigateTo } from '@devvit/web/client';
import {
  StrictMode,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  IoCreateOutline,
  IoEyeSharp,
  IoLayersSharp,
  IoPlaySharp,
  IoThumbsUpSharp,
} from 'react-icons/io5';
import type { AdminModListItem, ModListItem } from './modding/types';
import { PLAYTEST_RULESET_STORAGE_KEY } from './modding/runtime';
import { trpc } from './trpc';
import {
  getRealmSizeLabel,
  getRealmSizeTooltip,
  isEmptyRealmSizeLabel,
} from './mod-size';
import {
  getLastPlayedRealm,
  openEntry,
  setEditorTargetModId,
  setLastPlayedRealm,
} from './webview-navigation';

const ALL_PAGE_SIZE = 15;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));

const getSharePostUrl = (mod: ModListItem) => {
  if (!mod.sharePostId) {
    return null;
  }

  return `https://www.reddit.com/comments/${mod.sharePostId.replace('t3_', '')}`;
};

export const Catalog = () => {
  const [adminMods, setAdminMods] = useState<AdminModListItem[]>([]);
  const [hasAdminTools, setHasAdminTools] = useState(false);
  const [mods, setMods] = useState<ModListItem[]>([]);
  const [myMods, setMyMods] = useState<ModListItem[]>([]);
  const [lastPlayedRealm, setLastPlayedRealmState] = useState(getLastPlayedRealm);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [allPage, setAllPage] = useState(0);

  useEffect(() => {
    const fetchMods = async () => {
      const [catalogResult, ownResult, adminResult] = await Promise.allSettled([
        trpc.mods.listCatalog.query(),
        trpc.mods.listMine.query(),
        trpc.mods.listAllAdmin.query(),
      ]);

      if (catalogResult.status === 'fulfilled') {
        setMods(Array.isArray(catalogResult.value) ? catalogResult.value : []);
      } else {
        console.error('Failed to load mods catalog', catalogResult.reason);
        setMods([]);
      }

      if (ownResult.status === 'fulfilled') {
        setMyMods(Array.isArray(ownResult.value) ? ownResult.value : []);
      } else {
        console.error('Failed to load your realms', ownResult.reason);
        setMyMods([]);
      }

      if (adminResult.status === 'fulfilled') {
        setAdminMods(Array.isArray(adminResult.value) ? adminResult.value : []);
        setHasAdminTools(true);
      } else {
        setAdminMods([]);
        setHasAdminTools(false);
      }

      setLoading(false);
    };

    void fetchMods();
  }, []);

  const sortedByUpvotes = useMemo(
    () => [...mods].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0)).slice(0, 5),
    [mods]
  );

  const sortedByRecent = useMemo(
    () =>
      [...mods]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .slice(0, 5),
    [mods]
  );

  const sortedMyMods = useMemo(
    () =>
      [...myMods].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [myMods]
  );

  const allModsSource = useMemo(
    () =>
      [...(hasAdminTools ? adminMods : mods)].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [adminMods, hasAdminTools, mods]
  );

  const allModsFiltered = useMemo(() => {
    if (!searchQuery) {
      return allModsSource;
    }

    const query = searchQuery.toLowerCase();
    return allModsSource.filter(
      (mod) =>
        mod.title.toLowerCase().includes(query) ||
        mod.ownerUsername.toLowerCase().includes(query) ||
        ('draftOwnerUsername' in mod &&
          typeof mod.draftOwnerUsername === 'string' &&
          mod.draftOwnerUsername.toLowerCase().includes(query)) ||
        mod.status.toLowerCase().includes(query)
    );
  }, [allModsSource, searchQuery]);

  const allModsPage = useMemo(
    () =>
      allModsFiltered.slice(
        allPage * ALL_PAGE_SIZE,
        (allPage + 1) * ALL_PAGE_SIZE
      ),
    [allModsFiltered, allPage]
  );

  const totalPages = Math.ceil(allModsFiltered.length / ALL_PAGE_SIZE);

  const allSearchPlaceholder = hasAdminTools
    ? 'Search realms, drafts, or authors...'
    : 'Search realms...';

  const openRealmPost = (url: string) => {
    navigateTo(url);
  };

  const playPublishedMod = (
    event: MouseEvent<HTMLButtonElement>,
    modId: string,
    title: string
  ) => {
    const nextLastPlayedRealm = { modId, title };
    setLastPlayedRealm(nextLastPlayedRealm);
    setLastPlayedRealmState(nextLastPlayedRealm);
    localStorage.removeItem(PLAYTEST_RULESET_STORAGE_KEY);
    localStorage.setItem('override-mod-id', modId);
    openEntry(event.nativeEvent, 'game');
  };

  const openEditor = (event: MouseEvent<HTMLButtonElement>, modId?: string) => {
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
    const upvotesTooltip = `Upvotes: ${mod.upvotes || 0}`;
    const playerCountTooltip = `Users played: ${mod.playerCount || 0}`;

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
            <p className="catalog-text-soft line-clamp-2 text-[12px] leading-tight italic">
              {mod.summary || 'No description provided.'}
            </p>
            <div className="catalog-stat-text mt-1 flex items-center gap-3 text-[10px] font-semibold">
              <div className="flex items-center gap-1" title={upvotesTooltip}>
                <IoThumbsUpSharp className="text-[11px]" />
                <span>{mod.upvotes || 0}</span>
              </div>
              <div className="flex items-center gap-1" title={playerCountTooltip}>
                <IoEyeSharp className="text-[11px]" />
                <span>{mod.playerCount || 0}</span>
              </div>
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
    const shareUrl = getSharePostUrl(mod);
    const isPublished = mod.status === 'published';
    const realmSizeLabel = getRealmSizeLabel(mod.reactionCount);
    const realmSizeTooltip = getRealmSizeTooltip(mod.reactionCount);
    const realmSizeClassName = isEmptyRealmSizeLabel(realmSizeLabel)
      ? 'text-[color:var(--realm-size-empty-text)]'
      : '';
    const upvotesTooltip = `Upvotes: ${mod.upvotes || 0}`;
    const playerCountTooltip = `Users played: ${mod.playerCount || 0}`;

    return (
      <div
        key={`mine-${mod.id}`}
        className="catalog-card overflow-hidden"
      >
        <span aria-hidden="true" className="catalog-corner-lily" />
        <div className="catalog-header-strip flex items-start justify-between gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={(event) => {
              if (isPublished && shareUrl) {
                openRealmPost(shareUrl);
                return;
              }

              openEditor(event, mod.id);
            }}
            className="min-w-0 cursor-pointer text-left"
          >
            <div className="catalog-title-font catalog-text-ink truncate text-sm font-bold tracking-[0.08em] uppercase">
              {mod.title}
            </div>
          </button>
          <span
            className={`catalog-title-font rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-[0.16em] uppercase ${
              isPublished
                ? 'catalog-status-published'
                : 'catalog-status-draft'
            }`}
          >
            {mod.status}
          </span>
        </div>
        <div className="p-3">
          <div className="catalog-body-font catalog-text-soft mb-3 text-[15px] leading-snug italic">
            {mod.summary || 'No description provided.'}
          </div>
          <div className="catalog-body-font catalog-stat-text mb-3 flex items-center gap-3 text-[11px] font-semibold">
            <div className="flex items-center gap-1" title={upvotesTooltip}>
              <IoThumbsUpSharp className="text-[11px]" />
              <span>{mod.upvotes || 0}</span>
            </div>
            <div className="flex items-center gap-1" title={playerCountTooltip}>
              <IoEyeSharp className="text-[11px]" />
              <span>{mod.playerCount || 0}</span>
            </div>
            <div
              className={`flex items-center gap-1 ${realmSizeClassName}`}
              title={realmSizeTooltip}
            >
              <IoLayersSharp className="text-[11px]" />
              <span>{realmSizeLabel}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(event) => openEditor(event, mod.id)}
              className="catalog-title-font catalog-action-button flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] uppercase transition-colors"
            >
              <IoCreateOutline />
              Edit
            </button>
            {isPublished && (
              <button
                type="button"
                onClick={(event) => playPublishedMod(event, mod.id, mod.title)}
                className="catalog-action-button catalog-action-invert flex cursor-pointer items-center justify-center rounded-full border px-3 py-1.5 text-[11px] transition-colors"
              >
                <IoPlaySharp />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAdminWidget = (mod: AdminModListItem) => {
    const shareUrl = getSharePostUrl(mod);
    const upvotesTooltip = `Upvotes: ${mod.upvotes || 0}`;
    const playerCountTooltip = `Users played: ${mod.playerCount || 0}`;
    const latestStatusLabel =
      mod.latestVersionStatus === null ? 'draft-only' : mod.latestVersionStatus;
    const realmSizeLabel = getRealmSizeLabel(mod.reactionCount);
    const realmSizeTooltip = getRealmSizeTooltip(mod.reactionCount);
    const realmSizeClassName = isEmptyRealmSizeLabel(realmSizeLabel)
      ? 'text-[color:var(--realm-size-empty-text)]'
      : '';

    return (
      <div key={`admin-${mod.id}`} className="catalog-card overflow-hidden">
        <span aria-hidden="true" className="catalog-corner-lily" />
        <div className="catalog-header-strip flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="catalog-title-font catalog-text-ink truncate text-sm font-bold tracking-[0.08em] uppercase">
              {mod.title}
            </div>
            <div className="catalog-body-font catalog-text-soft mt-1 text-[11px] italic">
              By {mod.draftOwnerUsername ?? mod.ownerUsername}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {mod.hasDraftVersion && (
              <span className="catalog-title-font catalog-status-draft rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-[0.16em] uppercase">
                Draft
              </span>
            )}
            {mod.latestVersionStatus === 'published' && (
              <span className="catalog-title-font catalog-status-published rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-[0.16em] uppercase">
                Published
              </span>
            )}
            {mod.latestVersionStatus === 'hidden' && (
              <span className="catalog-title-font rounded-full border border-slate-400/30 bg-slate-500/12 px-2 py-0.5 text-[9px] font-bold tracking-[0.16em] text-slate-200 uppercase">
                Hidden
              </span>
            )}
          </div>
        </div>
        <div className="p-3">
          <div className="catalog-body-font catalog-text-soft mb-3 text-[14px] leading-snug italic">
            {mod.summary || 'No description provided.'}
          </div>
          <div className="catalog-body-font catalog-text-soft mb-3 space-y-1 text-[11px]">
            <div>Latest saved status: {latestStatusLabel}</div>
            {mod.draftUpdatedAt && (
              <div>Latest draft: {formatDate(mod.draftUpdatedAt)}</div>
            )}
            <div>Latest update: {formatDate(mod.updatedAt)}</div>
          </div>
          <div className="catalog-body-font catalog-stat-text mb-3 flex items-center gap-3 text-[11px] font-semibold">
            <div className="flex items-center gap-1" title={upvotesTooltip}>
              <IoThumbsUpSharp className="text-[11px]" />
              <span>{mod.upvotes || 0}</span>
            </div>
            <div className="flex items-center gap-1" title={playerCountTooltip}>
              <IoEyeSharp className="text-[11px]" />
              <span>{mod.playerCount || 0}</span>
            </div>
            <div
              className={`flex items-center gap-1 ${realmSizeClassName}`}
              title={realmSizeTooltip}
            >
              <IoLayersSharp className="text-[11px]" />
              <span>{realmSizeLabel}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(event) => openEditor(event, mod.id)}
              className="catalog-title-font catalog-action-button flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] uppercase transition-colors"
            >
              <IoCreateOutline />
              Edit
            </button>
            {shareUrl && (
              <button
                type="button"
                onClick={() => openRealmPost(shareUrl)}
                className="catalog-action-button catalog-action-invert flex cursor-pointer items-center justify-center rounded-full border px-3 py-1.5 text-[11px] transition-colors"
                title="Open realm post"
              >
                <IoPlaySharp />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="catalog-parchment catalog-side-ornament relative flex min-h-screen w-full flex-col items-center overflow-y-auto py-4 sm:px-3">
      <div
        aria-hidden="true"
        className="catalog-top-art pointer-events-none absolute top-0 left-1/2 h-[250px] w-screen -translate-x-1/2 bg-top bg-cover"
      />
      <div className="catalog-top-art-overlay pointer-events-none absolute inset-x-0 top-0 h-[250px]" />

      <div className="relative z-10 mb-4 flex w-full max-w-5xl flex-col items-center gap-1 text-center sm:px-2">
        <h1 className="catalog-title-font catalog-text-ink text-xl font-bold tracking-[0.18em] uppercase sm:text-2xl">
          User Realms
        </h1>
        <div
          className={`mt-2 grid w-full max-w-xl gap-2 ${
            lastPlayedRealm ? 'sm:grid-cols-2' : ''
          }`}
        >
          <button
            type="button"
            onClick={(event) => openEditor(event)}
            className="catalog-title-font catalog-action-button cursor-pointer rounded-2xl border px-4 py-3 text-[11px] font-bold tracking-[0.12em] uppercase transition-colors"
          >
            Create My Realm
          </button>
          {lastPlayedRealm && (
            <button
              type="button"
              onClick={(event) =>
                playPublishedMod(
                  event,
                  lastPlayedRealm.modId,
                  lastPlayedRealm.title
                )
              }
              className="catalog-action-button rounded-2xl border px-4 py-2.5 text-center transition-colors"
              title={`Continue exploring ${lastPlayedRealm.title}`}
            >
              <span className="catalog-title-font block text-[11px] font-bold tracking-[0.12em] uppercase">
                Continue Exploring
              </span>
              <span className="catalog-body-font catalog-text-soft mt-1 block text-[12px] italic">
                {lastPlayedRealm.title}
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 flex w-full max-w-5xl flex-col gap-5 pb-8 sm:px-2">
        {loading ? (
          <div className="catalog-title-font catalog-text-muted animate-pulse py-8 text-center text-sm font-bold tracking-[0.08em] uppercase">
            Loading realms...
          </div>
        ) : (
          <>
            {mods.length === 0 ? (
              <div className="catalog-card catalog-text-muted p-6 text-center text-sm">
                No realms published yet.
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {sortedByUpvotes.length > 0 && (
                <div className="flex min-w-0 flex-col gap-3">
                  <h2 className="catalog-title-font catalog-text-ink border-b border-[color:var(--catalog-soft-border)] px-1 pb-1 text-center text-sm font-bold tracking-[0.22em] uppercase">
                    Best
                  </h2>
                  <div className="flex flex-col gap-1.5 sm:gap-3">
                    {sortedByUpvotes.map(renderCatalogWidget)}
                  </div>
                </div>
              )}

              {sortedByRecent.length > 0 && (
                <div className="flex min-w-0 flex-col gap-3">
                  <h2 className="catalog-title-font catalog-text-ink border-b border-[color:var(--catalog-soft-border)] px-1 pb-1 text-center text-sm font-bold tracking-[0.22em] uppercase">
                    New
                  </h2>
                  <div className="flex flex-col gap-1.5 sm:gap-3">
                    {sortedByRecent.map(renderCatalogWidget)}
                  </div>
                </div>
              )}
            </div>
            )}

            {sortedMyMods.length > 0 && (
              <div className="catalog-divider-line flex flex-col gap-3 border-t pt-5">
                <h2 className="catalog-title-font catalog-text-ink px-1 text-center text-sm font-bold tracking-[0.22em] uppercase">
                  My Realms
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedMyMods.map(renderMyModWidget)}
                </div>
              </div>
            )}

            <div className="catalog-divider-line mt-2 flex flex-col gap-2 border-t pt-5">
              <div className="flex flex-col items-center gap-2 px-1">
                <h2 className="catalog-title-font catalog-text-ink text-sm font-bold tracking-[0.22em] uppercase">
                  All
                </h2>
                {hasAdminTools && (
                  <p className="catalog-body-font catalog-text-soft text-center text-xs italic">
                    Includes published realms plus moderator-visible drafts and
                    hidden realms that have been indexed.
                  </p>
                )}
                <input
                  type="text"
                  placeholder={allSearchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setAllPage(0);
                  }}
                  className="catalog-body-font catalog-input w-full rounded-lg border px-3 py-1.5 text-sm transition-colors outline-none sm:max-w-sm"
                />
              </div>

              {allModsFiltered.length === 0 ? (
                <div className="catalog-text-muted py-4 text-center text-sm">
                  No realms found matching "{searchQuery}"
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-3">
                    {hasAdminTools
                      ? adminMods
                          .filter((mod) => allModsPage.includes(mod))
                          .map(renderAdminWidget)
                      : mods
                          .filter((mod) => allModsPage.includes(mod))
                          .map(renderCatalogWidget)}
                  </div>
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-4">
                      <button
                        disabled={allPage === 0}
                        onClick={() => setAllPage((page) => page - 1)}
                        className="catalog-title-font catalog-action-button cursor-pointer rounded-lg border px-4 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <span className="catalog-body-font catalog-text-muted text-xs font-medium">
                        Page {allPage + 1} of {totalPages}
                      </span>
                      <button
                        disabled={allPage === totalPages - 1}
                        onClick={() => setAllPage((page) => page + 1)}
                        className="catalog-title-font catalog-action-button cursor-pointer rounded-lg border px-4 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase disabled:opacity-50"
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
