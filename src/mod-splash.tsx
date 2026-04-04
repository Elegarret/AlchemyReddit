/* global __BUILD_NUMBER__ */

import './index.css';

import { navigateTo } from '@devvit/web/client';
import { StrictMode, useEffect, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  IoAddSharp,
  IoAlbumsSharp,
  IoCreateOutline,
  IoEyeSharp,
  IoLayersSharp,
  IoThumbsUpSharp,
} from 'react-icons/io5';
import {
  getInlineViewCacheKey,
  isUnknownRecord,
  readInlineViewCache,
  writeInlineViewCache,
} from './inline-view-cache';
import {
  getRealmSizeLabel,
  getRealmSizeTooltip,
  isEmptyRealmSizeLabel,
} from './mod-size';
import { trpc } from './trpc';
import { openEntry, setEditorTargetModId, setLastPlayedRealm } from './webview-navigation';

type ModSplashRulesetPreview = {
  ownerUsername: string | null;
  publishedAt: string | null;
  sourceModId: string | null;
  summary: string;
  title: string;
};

type ModSplashListingPreview = {
  ownerUsername: string | null;
  playerCount: number;
  reactionCount?: number;
  upvotes: number;
};

type ModSplashState = {
  status: 'loading' | 'unavailable' | 'ready';
  message: string;
  ruleset: ModSplashRulesetPreview | null;
  modListing: ModSplashListingPreview | null;
  username: string | null;
  isModerator: boolean;
};

const DEFAULT_MOD_SPLASH_STATE: ModSplashState = {
  status: 'loading',
  message: '',
  ruleset: null,
  modListing: null,
  username: null,
  isModerator: false,
};

const isStringOrNull = (value: unknown): value is string | null =>
  typeof value === 'string' || value === null;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isModSplashRulesetPreview = (
  value: unknown
): value is ModSplashRulesetPreview => {
  if (!isUnknownRecord(value)) {
    return false;
  }

  return (
    typeof Reflect.get(value, 'title') === 'string' &&
    typeof Reflect.get(value, 'summary') === 'string' &&
    isStringOrNull(Reflect.get(value, 'sourceModId')) &&
    isStringOrNull(Reflect.get(value, 'ownerUsername')) &&
    isStringOrNull(Reflect.get(value, 'publishedAt'))
  );
};

const isModSplashListingPreview = (
  value: unknown
): value is ModSplashListingPreview => {
  if (!isUnknownRecord(value)) {
    return false;
  }

  return (
    isStringOrNull(Reflect.get(value, 'ownerUsername')) &&
    isNumber(Reflect.get(value, 'upvotes')) &&
    isNumber(Reflect.get(value, 'playerCount')) &&
    (Reflect.get(value, 'reactionCount') === undefined ||
      isNumber(Reflect.get(value, 'reactionCount')))
  );
};

const isModSplashState = (value: unknown): value is ModSplashState => {
  if (!isUnknownRecord(value)) {
    return false;
  }

  const status = Reflect.get(value, 'status');
  if (
    status !== 'loading' &&
    status !== 'unavailable' &&
    status !== 'ready'
  ) {
    return false;
  }

  const ruleset = Reflect.get(value, 'ruleset');
  const modListing = Reflect.get(value, 'modListing');

  return (
    typeof Reflect.get(value, 'message') === 'string' &&
    isStringOrNull(Reflect.get(value, 'username')) &&
    typeof Reflect.get(value, 'isModerator') === 'boolean' &&
    (ruleset === null || isModSplashRulesetPreview(ruleset)) &&
    (modListing === null || isModSplashListingPreview(modListing))
  );
};

const getModSplashCacheKey = () => getInlineViewCacheKey('mod-splash');

const readCachedModSplashState = () =>
  readInlineViewCache(getModSplashCacheKey(), (value) =>
    isModSplashState(value) ? value : null
  );

const toRulesetPreview = (
  ruleset: Awaited<ReturnType<typeof trpc.init.get.query>>['activeRuleset']
): ModSplashRulesetPreview | null => {
  if (!ruleset) {
    return null;
  }

  return {
    ownerUsername: ruleset.ownerUsername ?? null,
    publishedAt: ruleset.publishedAt ?? null,
    sourceModId: ruleset.sourceModId ?? null,
    summary: ruleset.summary,
    title: ruleset.title,
  };
};

const toModListingPreview = (
  modListing: Awaited<ReturnType<typeof trpc.init.get.query>>['activeModListing']
): ModSplashListingPreview | null => {
  if (!modListing) {
    return null;
  }

  return {
    ownerUsername: modListing.ownerUsername,
    playerCount: modListing.playerCount ?? 0,
    reactionCount: modListing.reactionCount,
    upvotes: modListing.upvotes ?? 0,
  };
};

const resolveModSplashState = (
  response: Awaited<ReturnType<typeof trpc.init.get.query>>
): ModSplashState => {
  const ruleset = toRulesetPreview(response.activeRuleset);

  if (response.rulesetUnavailableReason || !ruleset) {
    return {
      status: 'unavailable',
      message:
        response.rulesetUnavailableReason ?? 'Failed to load the Realm.',
      ruleset: null,
      modListing: null,
      username: response.username ?? null,
      isModerator: response.isModerator ?? false,
    };
  }

  return {
    status: 'ready',
    message: '',
    ruleset,
    modListing: toModListingPreview(response.activeModListing),
    username: response.username ?? null,
    isModerator: response.isModerator ?? false,
  };
};

export const ModSplash = () => {
  const [state, setState] = useState<ModSplashState>(
    () => readCachedModSplashState() ?? DEFAULT_MOD_SPLASH_STATE
  );

  useEffect(() => {
    let isDisposed = false;
    let isLoadInFlight = false;

    const loadState = async () => {
      if (isLoadInFlight) {
        return;
      }

      isLoadInFlight = true;

      try {
        const response = await trpc.init.get.query();
        if (isDisposed) {
          return;
        }

        const nextState = resolveModSplashState(response);
        writeInlineViewCache(getModSplashCacheKey(), nextState);
        setState(nextState);
      } catch (error) {
        console.error(error);
        if (isDisposed) {
          return;
        }

        setState((current) =>
          current.status === 'ready'
            ? current
            : {
                ...current,
                status: 'unavailable',
                message: 'Failed to load the Realm.',
              }
        );
      } finally {
        isLoadInFlight = false;
      }
    };

    const handleFocus = () => {
      void loadState();
    };

    void loadState();
    window.addEventListener('focus', handleFocus);

    return () => {
      isDisposed = true;
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const openGame = (event: MouseEvent<HTMLButtonElement>) => {
    if (!state.ruleset) {
      return;
    }

    if (state.ruleset.sourceModId) {
      localStorage.setItem('override-mod-id', state.ruleset.sourceModId);
      setLastPlayedRealm({
        modId: state.ruleset.sourceModId,
        title: state.ruleset.title,
      });
    } else {
      localStorage.removeItem('override-mod-id');
    }

    openEntry(event.nativeEvent, 'game');
  };

  const openEditor = (event: MouseEvent<HTMLButtonElement>) => {
    localStorage.removeItem('override-mod-id');
    const canEditCurrentRealm =
      !!state.ruleset?.sourceModId &&
      (state.isModerator ||
        (!!state.username && state.username === state.ruleset.ownerUsername));
    setEditorTargetModId(
      canEditCurrentRealm ? state.ruleset?.sourceModId ?? null : null
    );
    openEntry(event.nativeEvent, 'mod-editor');
  };

  const openCatalog = (event: MouseEvent<HTMLButtonElement>) => {
    openEntry(event.nativeEvent, 'mod-catalog');
  };

  if (state.status === 'loading') {
    return (
      <div className="realm-page flex h-screen items-center justify-center overflow-hidden px-4 py-4">
        <div className="realm-panel animate-pulse rounded-3xl px-6 py-8 text-center backdrop-blur-xl">
          <div className="catalog-title-font mt-2 text-lg font-black realm-text-ink">
            Summoning Realm...
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'unavailable' || !state.ruleset) {
    return (
      <div className="realm-page flex h-screen items-center justify-center overflow-hidden px-4 py-4">
        <div className="realm-panel max-w-md rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="catalog-title-font text-xs font-bold tracking-[0.24em] text-red-500 uppercase">
            Realm Unavailable
          </div>
          <h1 className="catalog-title-font realm-text-ink mt-2 text-2xl font-black">
            This custom realm cannot be loaded.
          </h1>
          <p className="realm-text-soft mt-4 text-sm leading-relaxed">
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  const createdDate = state.ruleset.publishedAt
    ? new Date(state.ruleset.publishedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown date';
  const authorUsername =
    state.modListing?.ownerUsername ?? state.ruleset.ownerUsername ?? 'unknown';
  const canEditCurrentRealm =
    !!state.ruleset.sourceModId &&
    (state.isModerator ||
      (!!state.username && state.username === state.ruleset.ownerUsername));
  const reactionCount = state.modListing?.reactionCount ?? 0;
  const realmSizeLabel = getRealmSizeLabel(reactionCount);
  const realmSizeTooltip = getRealmSizeTooltip(reactionCount);
  const realmSizeClassName = isEmptyRealmSizeLabel(realmSizeLabel)
    ? 'text-[color:var(--realm-size-empty-text)]'
    : 'realm-text-soft';
  const upvotesTooltip = `Upvotes: ${state.modListing?.upvotes || 0}`;
  const playerCountTooltip = `Users played: ${state.modListing?.playerCount || 0}`;

  return (
    <div className="realm-page relative flex h-screen flex-col items-center justify-center gap-4 overflow-hidden px-4 py-4">
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--catalog-ink)]/8 blur-3xl" />
      <div className="pointer-events-none absolute top-1/4 left-1/4 h-32 w-32 rounded-full bg-[color:var(--catalog-ink)]/6 blur-2xl" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 h-48 w-48 rounded-full bg-[color:var(--catalog-ink)]/5 blur-2xl" />

      <div className="z-10 flex w-full max-w-lg flex-col items-center gap-3 px-2 text-center">
        <div className="catalog-title-font realm-text-muted mb-2 text-sm font-bold tracking-[0.24em] uppercase drop-shadow-md">
          User&apos;s Realm
        </div>
        <h1 className="catalog-title-font realm-text-ink mb-1 px-4 text-4xl leading-tight font-black tracking-tight drop-shadow-xl sm:text-5xl">
          {state.ruleset.title}
        </h1>

        {state.ruleset.summary && (
          <p className="catalog-body-font realm-text-soft mb-4 max-w-sm px-4 text-base leading-relaxed font-medium drop-shadow-md sm:text-lg">
            {state.ruleset.summary}
          </p>
        )}

        <div className="realm-panel mb-2 flex w-full max-w-[320px] flex-col items-center gap-1 rounded-2xl px-6 py-4 shadow-xl backdrop-blur-md">
          <div className="catalog-body-font flex items-center gap-4 text-sm font-semibold">
            <div
              className="realm-text-ink flex items-center gap-1"
              title={upvotesTooltip}
            >
              <IoThumbsUpSharp className="text-[14px]" />
              <span>{state.modListing?.upvotes || 0}</span>
            </div>
            <div
              className="realm-text-soft flex items-center gap-1"
              title={playerCountTooltip}
            >
              <IoEyeSharp className="text-[14px]" />
              <span>{state.modListing?.playerCount || 0}</span>
            </div>
            <div
              className={`${realmSizeClassName} flex items-center gap-1`}
              title={realmSizeTooltip}
            >
              <IoLayersSharp className="text-[14px]" />
              <span>{realmSizeLabel}</span>
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
          <span className="catalog-body-font realm-text-muted mt-1 text-xs font-medium italic">
            {createdDate}
          </span>
        </div>
      </div>

      <div className="z-10 flex w-full max-w-[320px] flex-col gap-3">
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
            {canEditCurrentRealm ? <IoCreateOutline /> : <IoAddSharp />}
            {canEditCurrentRealm ? 'Edit Realm' : 'Create My Realm'}
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
