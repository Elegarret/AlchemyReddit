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
    await waitFor(
      () => document.body.textContent?.includes('Continue...') ?? false
    );

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
    await waitFor(
      () => document.body.textContent?.includes('Continue...') ?? false
    );

    expect(document.body.textContent).toContain('Continue...');
  });

  it('renders a faded cover art layer when the active realm has a cover image', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    initGetQueryMock.mockResolvedValue({
      activeModListing: null,
      activeRuleset: {
        kind: 'mod',
        coverImageUrl: 'https://i.redd.it/realm-cover.png',
        ownerUsername: 'realm-author',
        publishedAt: '2026-03-01T00:00:00.000Z',
        publishedHash: 'hash-1',
        sourceModId: 'realm-1',
        storageScope: 'mod:realm-1:hash-1',
        summary: 'Covered realm summary',
        title: 'Covered Realm',
      },
      isModerator: false,
      redditDiscovered: [],
      rulesetUnavailableReason: null,
      username: 'realm-author',
    });

    await import('./mod-splash');
    await waitFor(
      () => document.body.textContent?.includes('Covered Realm') ?? false
    );

    const cover = document.querySelector('.realm-splash-cover-art');
    expect(cover).toBeTruthy();
    expect(cover?.getAttribute('style')).toContain(
      'https://i.redd.it/realm-cover.png'
    );
  });

  it('does not render a cover art layer when the active realm has no cover image', async () => {
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
        summary: 'Plain realm summary',
        title: 'Plain Realm',
      },
      isModerator: false,
      redditDiscovered: [],
      rulesetUnavailableReason: null,
      username: 'realm-author',
    });

    await import('./mod-splash');
    await waitFor(
      () => document.body.textContent?.includes('Plain Realm') ?? false
    );

    expect(document.querySelector('.realm-splash-cover-art')).toBeNull();
  });

  it('shows the completion counter when the server includes it', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    initGetQueryMock.mockResolvedValue({
      activeModListing: {
        completionCount: 6,
        featuredAt: null,
        ownerUsername: 'realm-author',
        playerCount: 17,
        reactionCount: 220,
        upvotes: 9,
      },
      activeRuleset: {
        kind: 'mod',
        ownerUsername: 'realm-author',
        publishedAt: '2026-03-01T00:00:00.000Z',
        publishedHash: 'hash-1',
        sourceModId: 'realm-1',
        storageScope: 'mod:realm-1:hash-1',
        summary: 'Realm summary',
        title: 'Counter Realm',
      },
      isModerator: true,
      redditDiscovered: [],
      rulesetUnavailableReason: null,
      username: 'realm-author',
    });

    await import('./mod-splash');
    await waitFor(
      () => document.body.textContent?.includes('Counter Realm') ?? false
    );

    expect(document.querySelector('[title="Users completed: 6"]')).toBeTruthy();
  });

  it('shows the listing rating instead of the raw upvote count', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    initGetQueryMock.mockResolvedValue({
      activeModListing: {
        bestScore: 4.8,
        featuredAt: null,
        ownerUsername: 'realm-author',
        playerCount: 17,
        reactionCount: 220,
        upvotes: 99,
      },
      activeRuleset: {
        kind: 'mod',
        ownerUsername: 'realm-author',
        publishedAt: '2026-03-01T00:00:00.000Z',
        publishedHash: 'hash-1',
        sourceModId: 'realm-1',
        storageScope: 'mod:realm-1:hash-1',
        summary: 'Realm summary',
        title: 'Rated Realm',
      },
      isModerator: false,
      redditDiscovered: [],
      rulesetUnavailableReason: null,
      username: 'realm-author',
    });

    await import('./mod-splash');
    await waitFor(
      () => document.body.textContent?.includes('Rated Realm') ?? false
    );

    const rating = document.querySelector(
      `[title="Mod's rating based on Reddit net score and player's count"]`
    );
    expect(rating?.textContent).toBe('5');
    expect(document.querySelector('[title="Net vote score: 99"]')).toBeNull();
  });

  it('restores the cached realm view before the fresh load completes', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    window.history.replaceState({}, '', '/src/mod-splash.html?token=realm');
    window.sessionStorage.setItem(
      'alchemy:inline-view:mod-splash:/src/mod-splash.html?token=realm',
      JSON.stringify({
        status: 'ready',
        message: '',
        ruleset: {
          coverImageUrl: 'https://i.redd.it/cached-cover.png',
          ownerUsername: 'realm-author',
          publishedAt: '2026-03-01T00:00:00.000Z',
          sourceModId: 'realm-1',
          summary: 'Cached realm summary',
          title: 'Cached Realm',
        },
        modListing: {
          bestScore: 3.9,
          completionCount: 6,
          featuredAt: '2026-04-01T00:00:00.000Z',
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
    await waitFor(
      () => document.body.textContent?.includes('Cached Realm') ?? false
    );

    expect(document.body.textContent).toContain('Cached Realm');
    expect(document.body.textContent).toContain('Cached realm summary');
    expect(document.body.textContent).toContain('Continue...');
    expect(document.querySelector('.realm-splash-cover-art')).toBeTruthy();
    expect(document.body.textContent).toContain('mega');
    expect(document.body.textContent).toContain('Editorial choice');
    expect(
      document.querySelector(
        `[title="Mod's rating based on Reddit net score and player's count"]`
      )?.textContent
    ).toBe('4');
    expect(document.querySelector('[title="Editorial choice"]')).toBeTruthy();
    expect(document.querySelector('[title="Users played: 17"]')).toBeTruthy();
    expect(document.querySelector('[title="Users completed: 6"]')).toBeNull();
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
