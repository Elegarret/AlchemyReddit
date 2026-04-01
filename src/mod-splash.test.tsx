import { afterEach, describe, expect, it, vi } from 'vitest';

const initGetQueryMock = vi.fn().mockResolvedValue({
  activeModListing: null,
  activeRuleset: null,
  isModerator: false,
  rulesetUnavailableReason: 'Failed to load the Realm.',
  username: null,
});
const navigateToMock = vi.fn();
const openEntryMock = vi.fn();
const setEditorTargetModIdMock = vi.fn();
const setLastPlayedRealmMock = vi.fn();

vi.mock('@devvit/web/client', () => {
  return {
    navigateTo: navigateToMock,
  };
});

vi.mock('./trpc', () => {
  return {
    trpc: {
      init: {
        get: {
          query: initGetQueryMock,
        },
      },
    },
  };
});

vi.mock('./webview-navigation', () => {
  return {
    openEntry: openEntryMock,
    setEditorTargetModId: setEditorTargetModIdMock,
    setLastPlayedRealm: setLastPlayedRealmMock,
  };
});

afterEach(() => {
  initGetQueryMock?.mockReset();
  initGetQueryMock?.mockResolvedValue({
    activeModListing: null,
    activeRuleset: null,
    isModerator: false,
    rulesetUnavailableReason: 'Failed to load the Realm.',
    username: null,
  });
  navigateToMock?.mockReset();
  openEntryMock?.mockReset();
  setEditorTargetModIdMock?.mockReset();
  setLastPlayedRealmMock?.mockReset();
  window.sessionStorage.clear();
  vi.resetModules();
});

describe('ModSplash', () => {
  it('restores the cached realm view before the fresh load completes', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    window.history.replaceState(
      {},
      '',
      '/src/mod-splash.html?token=realm'
    );
    window.sessionStorage.setItem(
      'alchemy:inline-view:mod-splash:/src/mod-splash.html?token=realm',
      JSON.stringify({
        status: 'ready',
        message: '',
        ruleset: {
          ownerUsername: 'realm-author',
          publishedAt: '2026-03-01T00:00:00.000Z',
          sourceModId: 'realm-1',
          summary: 'Cached realm summary',
          title: 'Cached Realm',
        },
        modListing: {
          ownerUsername: 'realm-author',
          playerCount: 17,
          upvotes: 9,
        },
        username: 'realm-author',
        isModerator: false,
      })
    );
    initGetQueryMock.mockImplementation(() => new Promise(() => {}));

    await import('./mod-splash');
    await new Promise((r) => setTimeout(r, 0));

    expect(document.body.textContent).toContain('Cached Realm');
    expect(document.body.textContent).toContain('Cached realm summary');
    expect(document.body.textContent).not.toContain('Summoning Realm...');
  });
});
