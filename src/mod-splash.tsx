/* global __BUILD_NUMBER__ */

import './index.css';

import { navigateTo, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IoEyeSharp, IoThumbsUpSharp } from 'react-icons/io5';
import { trpc } from './trpc';
import type { ActiveRuleset, ModListItem } from './modding/types';

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

  if (status === 'loading') {
    return (
      <div className="bg-table-gradient flex min-h-screen items-center justify-center px-4 text-white">
        <div className="animate-pulse rounded-3xl border border-white/10 bg-white/6 px-6 py-8 text-center backdrop-blur-xl">
          <div className="mt-2 text-lg font-black text-cyan-200">
            Summoning Realm...
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unavailable' || !ruleset) {
    return (
      <div className="bg-table-gradient flex min-h-screen items-center justify-center px-4 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/6 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="text-xs font-bold tracking-[0.24em] text-red-400 uppercase">
            Realm Unavailable
          </div>
          <h1 className="mt-2 text-2xl font-black text-white">
            This custom realm cannot be loaded.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
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
    <div className="bg-table-gradient relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden">
      {/* Decorative elements */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/4 left-1/4 h-32 w-32 rounded-full bg-purple-500/10 blur-2xl" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 h-48 w-48 rounded-full bg-blue-500/10 blur-2xl" />

      <div className="z-10 mt-4 flex w-full max-w-lg flex-col items-center gap-3 px-6 text-center">
        <div className="mb-2 text-sm font-bold tracking-[0.24em] text-cyan-300 uppercase drop-shadow-md">
          User's Realm
        </div>
        <h1 className="mb-1 px-4 text-4xl leading-tight font-black tracking-tight text-white drop-shadow-xl sm:text-5xl">
          {ruleset.title}
        </h1>

        {ruleset.summary && (
          <p className="mb-6 max-w-sm px-4 text-base leading-relaxed font-medium text-slate-300 drop-shadow-md sm:text-lg">
            {ruleset.summary}
          </p>
        )}

        <div className="mb-4 flex w-full max-w-[280px] flex-col items-center gap-1 rounded-2xl border border-white/10 bg-black/30 px-6 py-4 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-4 text-sm font-bold">
            <div className="flex items-center gap-1 text-orange-300">
              <IoThumbsUpSharp className="text-[14px]" />
              <span>{modListing?.upvotes || 0}</span>
            </div>
            <div className="flex items-center gap-1 text-cyan-200/75">
              <IoEyeSharp className="text-[14px]" />
              <span>{modListing?.playerCount || 0}</span>
            </div>
          </div>
          <span className="text-sm font-medium text-cyan-200">
            Created by{' '}
            <button
              type="button"
              onClick={() =>
                navigateTo(`https://www.reddit.com/user/${authorUsername}/`)
              }
              className="font-bold text-white underline decoration-cyan-300/60 underline-offset-2 drop-shadow-sm"
            >
              u/{authorUsername}
            </button>
          </span>
          <span className="mt-1 text-xs font-medium text-slate-400">
            {createdDate}
          </span>
        </div>
      </div>

      <div className="z-10 mt-4 flex w-full max-w-[280px] px-4">
        <button
          className="w-full cursor-pointer rounded-full bg-gradient-to-tr from-cyan-600 to-blue-500 px-8 py-4 text-lg font-black tracking-[0.1em] text-white uppercase shadow-[0_0_40px_-10px_rgba(6,182,212,0.6)] ring-2 ring-cyan-400/30 transition-all hover:scale-105 active:scale-95 sm:text-xl"
          onClick={(e) => {
            if (ruleset.sourceModId) {
              localStorage.setItem('override-mod-id', ruleset.sourceModId);
            } else {
              localStorage.removeItem('override-mod-id');
            }
            requestExpandedMode(e.nativeEvent, 'game');
          }}
        >
          Enter The Realm
        </button>
      </div>

      <div className="absolute right-4 bottom-4 z-10 font-mono text-[10px] tracking-wider text-white/30 uppercase select-none">
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
