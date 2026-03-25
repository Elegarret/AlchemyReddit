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
  IoPlaySharp,
  IoThumbsUpSharp,
} from 'react-icons/io5';
import { PLAYTEST_RULESET_STORAGE_KEY } from './modding/runtime';
import { trpc } from './trpc';
import type { ModListItem } from './modding/types';
import { openEntry, setEditorTargetModId } from './webview-navigation';

const ALL_PAGE_SIZE = 15;

const getSharePostUrl = (mod: ModListItem) => {
  if (!mod.sharePostId) {
    return null;
  }

  return `https://www.reddit.com/comments/${mod.sharePostId.replace('t3_', '')}`;
};

export const Catalog = () => {
  const [mods, setMods] = useState<ModListItem[]>([]);
  const [myMods, setMyMods] = useState<ModListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [allPage, setAllPage] = useState(0);

  useEffect(() => {
    const fetchMods = async () => {
      try {
        const [catalogMods, ownMods] = await Promise.all([
          trpc.mods.listCatalog.query(),
          trpc.mods.listMine.query(),
        ]);
        setMods(catalogMods);
        setMyMods(ownMods);
      } catch (e) {
        console.error('Failed to load mods catalog', e);
      } finally {
        setLoading(false);
      }
    };

    void fetchMods();
  }, []);

  const sortedByUpvotes = useMemo(
    () => [...mods].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0)).slice(0, 10),
    [mods]
  );

  const sortedByRecent = useMemo(
    () =>
      [...mods]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .slice(0, 10),
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

  const allModsFiltered = useMemo(() => {
    if (!searchQuery) {
      return mods;
    }

    const query = searchQuery.toLowerCase();
    return mods.filter(
      (mod) =>
        mod.title.toLowerCase().includes(query) ||
        mod.ownerUsername.toLowerCase().includes(query)
    );
  }, [mods, searchQuery]);

  const allModsPage = useMemo(
    () =>
      allModsFiltered.slice(
        allPage * ALL_PAGE_SIZE,
        (allPage + 1) * ALL_PAGE_SIZE
      ),
    [allModsFiltered, allPage]
  );

  const totalPages = Math.ceil(allModsFiltered.length / ALL_PAGE_SIZE);

  const openRealmPost = (url: string) => {
    navigateTo(url);
  };

  const playPublishedMod = (
    event: MouseEvent<HTMLButtonElement>,
    modId: string
  ) => {
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

    return (
      <div
        key={mod.id}
        className="overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-md backdrop-blur-sm transition-colors hover:bg-black/50"
      >
        {url ? (
          <button
            type="button"
            onClick={() => openRealmPost(url)}
            className="block w-full cursor-pointer border-b border-white/10 px-3 py-2 text-center text-sm font-black text-white transition-colors hover:bg-white/5"
          >
            <span className="block truncate drop-shadow-sm">{mod.title}</span>
          </button>
        ) : (
          <div className="block w-full border-b border-white/10 px-3 py-2 text-center text-sm font-black text-white">
            <span className="block truncate drop-shadow-sm">{mod.title}</span>
          </div>
        )}

        <div className="flex min-h-[44px] items-stretch">
          <div className="flex min-w-0 flex-1 flex-col justify-center px-1.5 py-0.5">
            <p className="line-clamp-2 text-[11px] leading-tight text-slate-300 opacity-90">
              {mod.summary || 'No description provided.'}
            </p>
            <div className="mt-1 flex items-center gap-3 text-[11px] font-bold">
              <div className="flex items-center gap-1 text-orange-300">
                <IoThumbsUpSharp className="text-[11px]" />
                <span>{mod.upvotes || 0}</span>
              </div>
              <div className="flex items-center gap-1 text-cyan-200/70">
                <IoEyeSharp className="text-[11px]" />
                <span>{mod.playerCount || 0}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={(event) => playPublishedMod(event, mod.id)}
            className="flex w-7 flex-shrink-0 cursor-pointer items-center justify-center border-l border-white/10 bg-gradient-to-b from-[#ff5a1f] to-[#ff4500] text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
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

    return (
      <div
        key={`mine-${mod.id}`}
        className="rounded-2xl border border-white/10 bg-black/35 p-4 shadow-md backdrop-blur-sm"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
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
            <div className="truncate text-lg font-black text-white">
              {mod.title}
            </div>
            <div className="mt-1 text-sm text-white/65">
              {mod.summary || 'No description provided.'}
            </div>
          </button>
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.18em] uppercase ${
              isPublished
                ? 'bg-emerald-400/20 text-emerald-200'
                : 'bg-amber-300/20 text-amber-100'
            }`}
          >
            {mod.status}
          </span>
        </div>
        <div className="mb-3 flex items-center gap-3 text-[11px] font-bold">
          <div className="flex items-center gap-1 text-orange-300">
            <IoThumbsUpSharp className="text-[11px]" />
            <span>{mod.upvotes || 0}</span>
          </div>
          <div className="flex items-center gap-1 text-cyan-200/70">
            <IoEyeSharp className="text-[11px]" />
            <span>{mod.playerCount || 0}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={(event) => openEditor(event, mod.id)}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950"
          >
            <IoCreateOutline />
            Edit
          </button>
          {isPublished && (
            <button
              type="button"
              onClick={(event) => playPublishedMod(event, mod.id)}
              className="flex cursor-pointer items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white"
            >
              <IoPlaySharp />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-table-gradient flex min-h-screen w-full flex-col items-center overflow-y-auto py-6 sm:px-3">
      <div className="mb-6 flex w-full max-w-5xl flex-col items-center gap-1 text-center sm:px-2">
        <h1 className="text-3xl font-black tracking-tight text-[#ff4500] uppercase drop-shadow-md">
          Users Realms
        </h1>
        <button
          type="button"
          onClick={(event) => openEditor(event)}
          className="mt-3 cursor-pointer rounded-full border border-cyan-300/30 bg-cyan-400/12 px-5 py-2 text-sm font-black text-cyan-50 transition-all hover:scale-[1.02] hover:bg-cyan-400/20 active:scale-[0.98]"
        >
          Create My Realm!
        </button>
      </div>

      <div className="flex w-full max-w-5xl flex-col gap-6 pb-12 sm:px-2">
        {loading ? (
          <div className="animate-pulse py-8 text-center text-sm font-bold text-white/50">
            Loading realms...
          </div>
        ) : mods.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-center text-sm text-white/50">
            No realms published yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {sortedByUpvotes.length > 0 && (
                <div className="flex min-w-0 flex-col gap-3">
                  <h2 className="px-1 text-center text-lg font-black text-amber-300 uppercase drop-shadow-sm">
                    Best
                  </h2>
                  <div className="flex flex-col gap-1.5 sm:gap-3">
                    {sortedByUpvotes.map(renderCatalogWidget)}
                  </div>
                </div>
              )}

              {sortedByRecent.length > 0 && (
                <div className="flex min-w-0 flex-col gap-3">
                  <h2 className="px-1 text-center text-lg font-black text-cyan-300 uppercase drop-shadow-sm">
                    New
                  </h2>
                  <div className="flex flex-col gap-1.5 sm:gap-3">
                    {sortedByRecent.map(renderCatalogWidget)}
                  </div>
                </div>
              )}
            </div>

            {sortedMyMods.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-white/10 pt-6">
                <h2 className="px-1 text-center text-lg font-black text-white uppercase drop-shadow-sm">
                  My Mods
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedMyMods.map(renderMyModWidget)}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-6">
              <div className="flex flex-col items-center gap-2 px-1">
                <h2 className="text-lg font-black text-white uppercase drop-shadow-sm">
                  All
                </h2>
                <input
                  type="text"
                  placeholder="Search realms..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setAllPage(0);
                  }}
                  className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-1.5 text-sm text-white transition-colors outline-none focus:border-cyan-400 sm:max-w-sm"
                />
              </div>

              {allModsFiltered.length === 0 ? (
                <div className="py-4 text-center text-sm text-white/50">
                  No realms found matching "{searchQuery}"
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-3">
                    {allModsPage.map(renderCatalogWidget)}
                  </div>
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-4">
                      <button
                        disabled={allPage === 0}
                        onClick={() => setAllPage((page) => page - 1)}
                        className="cursor-pointer rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <span className="text-xs font-medium text-slate-400">
                        Page {allPage + 1} of {totalPages}
                      </span>
                      <button
                        disabled={allPage === totalPages - 1}
                        onClick={() => setAllPage((page) => page + 1)}
                        className="cursor-pointer rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
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
