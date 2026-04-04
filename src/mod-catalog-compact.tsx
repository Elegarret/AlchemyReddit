import './index.css';

import { navigateTo } from '@devvit/web/client';
import { StrictMode, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  IoCreateOutline,
  IoEyeSharp,
  IoLayersSharp,
  IoPlaySharp,
  IoThumbsUpSharp,
} from 'react-icons/io5';
import type { ModListItem } from './modding/types';
import { PLAYTEST_RULESET_STORAGE_KEY } from './modding/runtime';
import { trpc } from './trpc';
import {
  getRealmSizeLabel,
  getRealmSizeTooltip,
  isEmptyRealmSizeLabel,
} from './mod-size';
import { openEntry, setEditorTargetModId, setLastPlayedRealm } from './webview-navigation';

const CATALOG_TAB_LIMIT = 8;

type CatalogTab = 'best' | 'new';

const getSharePostUrl = (mod: ModListItem) => {
  if (!mod.sharePostId) {
    return null;
  }

  return `https://www.reddit.com/comments/${mod.sharePostId.replace('t3_', '')}`;
};

export const CompactCatalog = () => {
  const [mods, setMods] = useState<ModListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CatalogTab>('best');

  useEffect(() => {
    const fetchMods = async () => {
      try {
        const catalogMods = await trpc.mods.listCatalog.query();
        setMods(Array.isArray(catalogMods) ? catalogMods : []);
      } catch (error) {
        console.error('Failed to load compact mods catalog', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchMods();
  }, []);

  const bestMods = useMemo(
    () =>
      [...mods]
        .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
        .slice(0, CATALOG_TAB_LIMIT),
    [mods]
  );

  const newMods = useMemo(
    () =>
      [...mods]
        .sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .slice(0, CATALOG_TAB_LIMIT),
    [mods]
  );

  const visibleMods = activeTab === 'best' ? bestMods : newMods;

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

  const openEditor = (event: MouseEvent<HTMLButtonElement>) => {
    localStorage.removeItem('override-mod-id');
    setEditorTargetModId(null);
    openEntry(event.nativeEvent, 'mod-editor');
  };

  const renderCatalogWidget = (mod: ModListItem) => {
    const url = getSharePostUrl(mod);
    const realmSizeLabel = getRealmSizeLabel(mod.reactionCount);
    const realmSizeTooltip = getRealmSizeTooltip(mod.reactionCount);
    const realmSizeClassName = isEmptyRealmSizeLabel(realmSizeLabel)
      ? 'text-[color:var(--realm-size-empty-text)]'
      : '';

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
              <div className="flex items-center gap-1">
                <IoThumbsUpSharp className="text-[11px]" />
                <span>{mod.upvotes || 0}</span>
              </div>
              <div className="flex items-center gap-1">
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

  return (
    <div className="catalog-parchment catalog-side-ornament relative flex h-screen w-full flex-col items-center overflow-hidden px-2 py-3 sm:px-3">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 h-[250px] w-screen -translate-x-1/2 bg-top bg-cover opacity-38"
        style={{
          backgroundImage: 'url(/alchemy_bg.jpg)',
          maskImage:
            'linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.92) 45%, rgba(0, 0, 0, 0.36) 78%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.92) 45%, rgba(0, 0, 0, 0.36) 78%, transparent 100%)',
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[250px] bg-[linear-gradient(180deg,rgba(16,8,28,0.3),rgba(16,8,28,0.55),rgba(16,8,28,0)_100%)]" />

      <div className="relative z-10 flex h-full w-full max-w-5xl flex-col gap-3 sm:gap-4 sm:px-2">
        <div className="relative flex min-h-[48px] items-center justify-center px-24">
          <div
            className="catalog-title-font catalog-text-ink text-center text-xl font-bold tracking-[0.18em] uppercase sm:text-2xl"
          >
            <h1>
              User Realms
            </h1>
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
          className="grid w-full grid-cols-2 gap-2 sm:max-w-sm"
        >
          {(['best', 'new'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const label = tab === 'best' ? 'Best' : 'New';

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab)}
                className={`catalog-title-font cursor-pointer rounded-2xl border px-4 py-2 text-[11px] font-bold tracking-[0.16em] uppercase transition-colors ${
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
          ) : mods.length === 0 ? (
            <div className="catalog-title-font catalog-text-muted flex flex-1 items-center justify-center text-center text-sm font-bold tracking-[0.08em] uppercase">
              No realms published yet.
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-4 gap-2 sm:gap-3">
              {visibleMods.map(renderCatalogWidget)}
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
