import { afterEach, describe, expect, it, vi } from 'vitest';

const initGetQueryMock = vi.fn().mockResolvedValue({
  activeModListing: null,
  activeRuleset: null,
  isModerator: false,
  redditDiscovered: [],
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

const waitFor = async (predicate: () => boolean, timeoutMs: number = 500) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for test condition');
};

afterEach(() => {
  initGetQueryMock?.mockReset();
  initGetQueryMock?.mockResolvedValue({
    activeModListing: null,
    activeRuleset: null,
    isModerator: false,
    redditDiscovered: [],
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
  it('shows Continue... when the active realm already has local progress', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    window.localStorage.setItem(
      'alchemy-mod:realm-1:hash-1-discovered',
      JSON.stringify(['air', 'water'])
    );
    initGetQueryMock.mockResolvedValue({
      activeModListing: null,
      activeRuleset: {
        kind: 'mod',
        ownerUsername: 'realm-author',
        publishedAt: '2026-03-01T00:00:00.000Z',
        publishedHash: 'hash-1',
        sourceModId: 'realm-1',
        storageScope: 'mod:realm-1:hash-1',
        summary: 'Cached realm summary',
        title: 'Cached Realm',
      },
      isModerator: false,
      redditDiscovered: [],
      rulesetUnavailableReason: null,
      username: 'realm-author',
    });

    await import('./mod-splash');
    await waitFor(() => document.body.textContent?.includes('Continue...') ?? false);

    expect(document.body.textContent).toContain('Continue...');
  });

  it('shows Continue... when Reddit progress exists even without local progress', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    initGetQueryMock.mockResolvedValue({
      activeModListing: null,
      activeRuleset: {
        kind: 'mod',
        ownerUsername: 'realm-author',
        publishedAt: '2026-03-01T00:00:00.000Z',
        publishedHash: 'hash-1',
        sourceModId: 'realm-1',
        storageScope: 'mod:realm-1:hash-1',
        summary: 'Cached realm summary',
        title: 'Cached Realm',
      },
      isModerator: false,
      redditDiscovered: ['air'],
      rulesetUnavailableReason: null,
      username: 'realm-author',
    });

    await import('./mod-splash');
    await waitFor(() => document.body.textContent?.includes('Continue...') ?? false);

    expect(document.body.textContent).toContain('Continue...');
  });

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
          reactionCount: 220,
          upvotes: 9,
        },
        hasProgress: true,
        username: 'realm-author',
        isModerator: false,
      })
    );
    initGetQueryMock.mockImplementation(() => new Promise(() => {}));

    await import('./mod-splash');
    await waitFor(() => document.body.textContent?.includes('Cached Realm') ?? false);

    expect(document.body.textContent).toContain('Cached Realm');
    expect(document.body.textContent).toContain('Cached realm summary');
    expect(document.body.textContent).toContain('Continue...');
    expect(document.body.textContent).toContain('mega');
    expect(document.querySelector('[title="Upvotes: 9"]')).toBeTruthy();
    expect(document.querySelector('[title="Users played: 17"]')).toBeTruthy();
    expect(
      document.querySelector('[title="Realm size: 220 reactions"]')
    ).toBeTruthy();
    expect(
      Array.from(document.querySelectorAll('span')).some(
        (element) =>
          element.className.includes('realm-text-muted') &&
          element.className.includes('catalog-body-font')
      )
    ).toBe(true);
    expect(document.body.textContent).not.toContain('Summoning Realm...');
  });
});
