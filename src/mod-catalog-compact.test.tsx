import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';

const listBestQueryMock = vi.fn();
const listFeaturedQueryMock = vi.fn();
const listMineQueryMock = vi.fn();
const listNewQueryMock = vi.fn();
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
      mods: {
        listBest: {
          query: listBestQueryMock,
        },
        listFeatured: {
          query: listFeaturedQueryMock,
        },
        listMine: {
          query: listMineQueryMock,
        },
        listNew: {
          query: listNewQueryMock,
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

const buildMod = (index: number) => ({
  id: `mod-${index}`,
  title: `Realm ${index}`,
  summary: `Summary ${index}`,
  ownerUsername: `author-${index}`,
  updatedAt: new Date(Date.UTC(2026, 0, index)).toISOString(),
  publishedAt: new Date(Date.UTC(2026, 0, index - 1)).toISOString(),
  publishedHash: `hash-${index}`,
  sharePostId: `t3_post${index}`,
  status: 'published' as const,
  hasDraftVersion: false,
  hasPublishedVersion: true,
  elementCount: 10,
  reactionCount: 20,
  upvotes: index,
  playerCount: index * 2,
  completionCount: index,
});

const waitFor = async (predicate: () => boolean, timeoutMs = 1500) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for test condition');
};

const getPageText = () => document.body.textContent ?? '';

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  listMineQueryMock.mockResolvedValue([]);
});

afterEach(() => {
  listBestQueryMock.mockReset();
  listFeaturedQueryMock.mockReset();
  listMineQueryMock.mockReset();
  listNewQueryMock.mockReset();
  navigateToMock.mockReset();
  openEntryMock.mockReset();
  setEditorTargetModIdMock.mockReset();
  setLastPlayedRealmMock.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/src/mod-catalog-compact.html');
  document.body.innerHTML = '';
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  vi.resetModules();
});

describe('CompactCatalog', () => {
  it('shows the rounded cached rating in the compact hub', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    listBestQueryMock.mockResolvedValue([
      {
        ...buildMod(1),
        bestScore: 62.3,
      },
    ]);
    listFeaturedQueryMock.mockResolvedValue([]);
    listNewQueryMock.mockResolvedValue([]);

    await act(async () => {
      await import('./mod-catalog-compact');
    });
    await waitFor(() => /Realm 1(?!\d)/.test(getPageText()));

    expect(
      document.querySelector(
        `[title="Mod's rating based on Reddit net score and player's count"]`
      )?.textContent
    ).toBe('62');
  });

  it('renders the compact tabbed catalog and trims each tab to eight realms', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    listBestQueryMock.mockResolvedValue([
      { ...buildMod(2), upvotes: 100 },
      { ...buildMod(4), upvotes: 90 },
      { ...buildMod(6), upvotes: 80 },
      { ...buildMod(7), upvotes: 40 },
      { ...buildMod(8), upvotes: 70 },
      { ...buildMod(9), upvotes: 50 },
      { ...buildMod(10), upvotes: 60 },
      { ...buildMod(5), upvotes: 30 },
      { ...buildMod(3), upvotes: 20 },
    ]);
    listFeaturedQueryMock.mockResolvedValue([]);
    listNewQueryMock.mockResolvedValue([
      buildMod(10),
      buildMod(9),
      buildMod(8),
      buildMod(7),
      buildMod(6),
      buildMod(5),
      buildMod(4),
      buildMod(3),
    ]);

    await act(async () => {
      await import('./mod-catalog-compact');
    });
    await waitFor(
      () =>
        !getPageText().includes('Loading realms...') &&
        /Realm 2(?!\d)/.test(getPageText())
    );

    expect(getPageText()).toContain('User Realms');
    expect(getPageText()).toContain('Featured');
    expect(getPageText()).toContain('Best');
    expect(getPageText()).toContain('New');
    expect(getPageText()).toContain('Create');
    expect(getPageText()).not.toContain('Continue Exploring');
    expect(getPageText()).not.toContain('My Realms');
    expect(getPageText()).not.toContain('All');

    expect(getPageText()).toMatch(/Realm 2(?!\d)/);
    expect(getPageText()).toMatch(/Realm 4(?!\d)/);
    expect(getPageText()).toMatch(/Realm 7(?!\d)/);
    expect(getPageText()).not.toMatch(/Realm 1(?!\d)/);

    const newTab = Array.from(document.querySelectorAll('[role="tab"]')).find(
      (tab) => /new/i.test(tab.textContent ?? '')
    );
    expect(newTab).toBeTruthy();

    await act(async () => {
      newTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => /Realm 10(?!\d)/.test(getPageText()));

    expect(getPageText()).toMatch(/Realm 10(?!\d)/);
    expect(getPageText()).toMatch(/Realm 5(?!\d)/);
    expect(getPageText()).toMatch(/Realm 4(?!\d)/);
    expect(getPageText()).toMatch(/Realm 3(?!\d)/);
    expect(getPageText()).not.toMatch(/Realm 2(?!\d)/);
    expect(getPageText()).not.toMatch(/Realm 1(?!\d)/);
  });

  it('shows a randomized featured tab with editorial choice markers', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    listBestQueryMock.mockResolvedValue([]);
    listFeaturedQueryMock.mockResolvedValue([
      { ...buildMod(1), featuredAt: '2026-02-01T00:00:00.000Z' },
      { ...buildMod(2), featuredAt: '2026-02-02T00:00:00.000Z' },
    ]);
    listNewQueryMock.mockResolvedValue([buildMod(3)]);

    await act(async () => {
      await import('./mod-catalog-compact');
    });
    await waitFor(() => getPageText().includes('User Realms'));

    const featuredTab = Array.from(
      document.querySelectorAll('[role="tab"]')
    ).find((tab) => /featured/i.test(tab.textContent ?? ''));
    expect(featuredTab).toBeTruthy();

    await act(async () => {
      featuredTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => getPageText().includes('Realm 1'));

    expect(getPageText()).toContain('Realm 1');
    expect(getPageText()).toContain('Realm 2');
    expect(getPageText()).not.toContain('Realm 3');
    expect(document.querySelector('[title="Editorial choice"]')).toBeTruthy();
  });

  it('uses dedicated compact entrypoint paths to choose the initial tab', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState(
      {},
      '',
      '/src/mod-catalog-compact-featured.html'
    );
    listBestQueryMock.mockResolvedValue([]);
    listFeaturedQueryMock.mockResolvedValue([
      { ...buildMod(1), featuredAt: '2026-02-01T00:00:00.000Z' },
    ]);
    listNewQueryMock.mockResolvedValue([buildMod(2)]);

    await act(async () => {
      await import('./mod-catalog-compact');
    });
    await waitFor(() => getPageText().includes('Realm 1'));

    expect(getPageText()).toContain('Realm 1');
    expect(getPageText()).not.toContain('Realm 2');
  });

  it('opens the editor from the create action in the compact catalog', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    listBestQueryMock.mockResolvedValue([buildMod(1)]);
    listFeaturedQueryMock.mockResolvedValue([]);
    listNewQueryMock.mockResolvedValue([]);

    await act(async () => {
      await import('./mod-catalog-compact');
    });
    await waitFor(
      () =>
        document.querySelectorAll('button').length > 0 &&
        !getPageText().includes('Loading realms...')
    );

    const createButton = document.querySelector('button');
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(setEditorTargetModIdMock).toHaveBeenCalledWith(null);
    expect(openEntryMock).toHaveBeenCalledTimes(1);
    expect(openEntryMock.mock.calls[0]?.[1]).toBe('mod-editor');
  });

  it('shows My Realms for users with created realms and opens owned realms', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const publicRealm = buildMod(1);
    const draftRealm = {
      ...buildMod(20),
      id: 'mine-draft',
      title: 'Draft Mine',
      status: 'draft',
      hasDraftVersion: true,
      hasPublishedVersion: false,
      publishedAt: undefined,
      publishedHash: undefined,
      sharePostId: undefined,
      updatedAt: new Date(Date.UTC(2026, 0, 20)).toISOString(),
    };
    const publishedRealm = {
      ...buildMod(21),
      id: 'mine-published',
      title: 'Published Mine',
      status: 'published',
      updatedAt: new Date(Date.UTC(2026, 0, 21)).toISOString(),
    };
    const hiddenRealm = {
      ...buildMod(19),
      id: 'mine-hidden',
      title: 'Hidden Mine',
      status: 'hidden',
      hasDraftVersion: true,
      hasPublishedVersion: false,
      publishedAt: undefined,
      publishedHash: undefined,
      sharePostId: undefined,
      updatedAt: new Date(Date.UTC(2026, 0, 19)).toISOString(),
    };

    listBestQueryMock.mockResolvedValue([publicRealm]);
    listFeaturedQueryMock.mockResolvedValue([]);
    listNewQueryMock.mockResolvedValue([]);
    listMineQueryMock.mockResolvedValue([
      hiddenRealm,
      draftRealm,
      publishedRealm,
    ]);

    await act(async () => {
      await import('./mod-catalog-compact');
    });
    await waitFor(
      () =>
        !getPageText().includes('Loading realms...') &&
        getPageText().includes('My Realms')
    );

    expect(getPageText()).toContain('Realm 1');
    expect(getPageText()).not.toContain('Draft Mine');

    const myRealmsTab = Array.from(
      document.querySelectorAll('[role="tab"]')
    ).find((tab) => /my realms/i.test(tab.textContent ?? ''));
    expect(myRealmsTab).toBeTruthy();

    await act(async () => {
      myRealmsTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => getPageText().includes('Draft Mine'));

    expect(getPageText()).toContain('Published Mine');
    expect(getPageText()).toContain('Hidden Mine');
    expect(getPageText()).not.toContain('Realm 1');

    const draftButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Draft Mine')
    );
    expect(draftButton).toBeTruthy();

    await act(async () => {
      draftButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(setEditorTargetModIdMock).toHaveBeenCalledWith('mine-draft');
    expect(openEntryMock.mock.calls.at(-1)?.[1]).toBe('mod-editor');

    const playButtons = Array.from(
      document.querySelectorAll('button[title="Play realm"]')
    );
    expect(playButtons).toHaveLength(1);

    await act(async () => {
      playButtons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(setLastPlayedRealmMock).toHaveBeenCalledWith({
      modId: 'mine-published',
      title: 'Published Mine',
    });
    expect(window.localStorage.getItem('override-mod-id')).toBe(
      'mine-published'
    );
    expect(openEntryMock.mock.calls.at(-1)?.[1]).toBe('game');
  });

  it('restores the cached compact catalog before the fresh load completes', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState(
      {},
      '',
      '/src/mod-catalog-compact.html?token=compact'
    );
    window.sessionStorage.setItem(
      'alchemy:inline-view:mod-catalog-compact:/src/mod-catalog-compact.html?token=compact',
      JSON.stringify({
        activeTab: 'new',
        bestMods: [buildMod(1)],
        featuredMods: [],
        newMods: [buildMod(1), buildMod(2)],
      })
    );
    listFeaturedQueryMock.mockResolvedValue([]);
    listBestQueryMock.mockResolvedValue([]);
    listNewQueryMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          window.setTimeout(() => resolve([buildMod(3)]), 250);
        })
    );

    await act(async () => {
      await import('./mod-catalog-compact');
    });
    await waitFor(
      () =>
        getPageText().includes('User Realms') &&
        getPageText().includes('Realm 2') &&
        !getPageText().includes('Loading realms...')
    );

    expect(getPageText()).toContain('User Realms');
    expect(getPageText()).toContain('Realm 2');
    expect(getPageText()).not.toContain('Loading realms...');
  });
});
