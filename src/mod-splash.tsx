/* global __BUILD_NUMBER__ */

import './index.css';

import { navigateTo } from '@devvit/web/client';
import { StrictMode, useEffect, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { IoAddSharp, IoAlbumsSharp, IoEyeSharp, IoThumbsUpSharp } from 'react-icons/io5';
import { trpc } from './trpc';
import type { ActiveRuleset, ModListItem } from './modding/types';
import { openEntry } from './webview-navigation';

export const ModSplash = () => {
  const [status, setStatus] = useState<'loading' | 'unavailable' | 'ready'>(
    'loading'
  );
  const [message, setMessage] = useState('');
  const [ruleset, setRuleset] = useState<ActiveRuleset | null>(null);
  const [modListing, setModListing] = useState<ModListItem | null>(null);

  useEffect(() => {
    trpc.init.get
      .query()
      .then((response) => {
        if (response.rulesetUnavailableReason) {
          setStatus('unavailable');
          setMessage(response.rulesetUnavailableReason);
          return;
        }

        setRuleset(response.activeRuleset || null);
        setModListing(response.activeModListing || null);
        setStatus('ready');
      })
      .catch((error) => {
        console.error(error);
        setStatus('unavailable');
        setMessage('Failed to load the Realm.');
      });
  }, []);

  const openGame = (event: MouseEvent<HTMLButtonElement>) => {
    if (!ruleset) {
      return;
    }

    if (ruleset.sourceModId) {
      localStorage.setItem('override-mod-id', ruleset.sourceModId);
    } else {
      localStorage.removeItem('override-mod-id');
    }

    openEntry(event.nativeEvent, 'game');
  };

  const openEditor = (event: MouseEvent<HTMLButtonElement>) => {
    localStorage.removeItem('override-mod-id');
    openEntry(event.nativeEvent, 'mod-editor');
  };

  const openCatalog = (event: MouseEvent<HTMLButtonElement>) => {
    openEntry(event.nativeEvent, 'mod-catalog');
  };

  if (status === 'loading') {
    return (
      <div className="realm-page flex min-h-screen items-center justify-center px-4">
        <div className="realm-panel animate-pulse rounded-3xl px-6 py-8 text-center backdrop-blur-xl">
          <div className="catalog-title-font mt-2 text-lg font-black realm-text-ink">
            Summoning Realm...
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unavailable' || !ruleset) {
    return (
      <div className="realm-page flex min-h-screen items-center justify-center px-4">
        <div className="realm-panel max-w-md rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="catalog-title-font text-xs font-bold tracking-[0.24em] text-red-500 uppercase">
            Realm Unavailable
          </div>
          <h1 className="catalog-title-font realm-text-ink mt-2 text-2xl font-black">
            This custom realm cannot be loaded.
          </h1>
          <p className="realm-text-soft mt-4 text-sm leading-relaxed">
            {message}
          </p>
        </div>
      </div>
    );
  }

  const createdDate = ruleset.publishedAt
    ? new Date(ruleset.publishedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown date';
  const authorUsername =
    modListing?.ownerUsername ?? ruleset.ownerUsername ?? 'unknown';

  return (
    <div className="realm-page relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden">
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--catalog-ink)]/8 blur-3xl" />
      <div className="pointer-events-none absolute top-1/4 left-1/4 h-32 w-32 rounded-full bg-[color:var(--catalog-ink)]/6 blur-2xl" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 h-48 w-48 rounded-full bg-[color:var(--catalog-ink)]/5 blur-2xl" />

      <div className="z-10 mt-4 flex w-full max-w-lg flex-col items-center gap-3 px-6 text-center">
        <div className="catalog-title-font realm-text-muted mb-2 text-sm font-bold tracking-[0.24em] uppercase drop-shadow-md">
          User&apos;s Realm
        </div>
        <h1 className="catalog-title-font realm-text-ink mb-1 px-4 text-4xl leading-tight font-black tracking-tight drop-shadow-xl sm:text-5xl">
          {ruleset.title}
        </h1>

        {ruleset.summary && (
          <p className="catalog-body-font realm-text-soft mb-4 max-w-sm px-4 text-base leading-relaxed font-medium drop-shadow-md sm:text-lg">
            {ruleset.summary}
          </p>
        )}

        <div className="realm-panel mb-2 flex w-full max-w-[320px] flex-col items-center gap-1 rounded-2xl px-6 py-4 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-4 text-sm font-bold">
            <div className="realm-text-ink flex items-center gap-1">
              <IoThumbsUpSharp className="text-[14px]" />
              <span>{modListing?.upvotes || 0}</span>
            </div>
            <div className="realm-text-soft flex items-center gap-1">
              <IoEyeSharp className="text-[14px]" />
              <span>{modListing?.playerCount || 0}</span>
            </div>
          </div>
          <span className="catalog-body-font realm-text-soft text-sm font-medium">
            Created by{' '}
            <button
              type="button"
              onClick={() =>
                navigateTo(`https://www.reddit.com/user/${authorUsername}/`)
              }
              className="realm-text-ink cursor-pointer font-bold underline underline-offset-2 drop-shadow-sm"
            >
              u/{authorUsername}
            </button>
          </span>
          <span className="realm-text-muted mt-1 text-xs font-medium">
            {createdDate}
          </span>
        </div>
      </div>

      <div className="z-10 mt-2 flex w-full max-w-[320px] flex-col gap-3 px-4">
        <button
          className="realm-button-accent catalog-title-font w-full cursor-pointer rounded-full px-8 py-4 text-lg font-black tracking-[0.1em] uppercase shadow-[0_0_40px_-10px_rgba(6,182,212,0.25)] transition-all hover:scale-105 active:scale-95 sm:text-xl"
          onClick={openGame}
        >
          Enter The Realm
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={openEditor}
            className="realm-button-primary catalog-title-font flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-black transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <IoAddSharp />
            Create My Realm
          </button>
          <button
            type="button"
            onClick={openCatalog}
            className="realm-button-primary catalog-title-font flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-black transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <IoAlbumsSharp />
            More Realms
          </button>
        </div>
      </div>

      <div className="realm-text-muted absolute right-4 bottom-4 z-10 font-mono text-[10px] tracking-wider uppercase select-none">
        Build {__BUILD_NUMBER__}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ModSplash />
  </StrictMode>
);
