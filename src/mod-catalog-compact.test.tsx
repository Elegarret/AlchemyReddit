import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';

const listCatalogQueryMock = vi.fn();
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
        listCatalog: {
          query: listCatalogQueryMock,
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
});

afterEach(() => {
  listCatalogQueryMock.mockReset();
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
  it('renders the compact tabbed catalog and trims each tab to eight realms', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    listCatalogQueryMock.mockResolvedValue([
      { ...buildMod(1), upvotes: 10 },
      { ...buildMod(2), upvotes: 100 },
      { ...buildMod(3), upvotes: 20 },
      { ...buildMod(4), upvotes: 90 },
      { ...buildMod(5), upvotes: 30 },
      { ...buildMod(6), upvotes: 80 },
      { ...buildMod(7), upvotes: 40 },
      { ...buildMod(8), upvotes: 70 },
      { ...buildMod(9), upvotes: 50 },
      { ...buildMod(10), upvotes: 60 },
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
    expect(getPageText()).toContain('Best');
    expect(getPageText()).toContain('New');
    expect(getPageText()).toContain('Create');
    expect(getPageText()).not.toContain('Continue Exploring');
    expect(getPageText()).not.toContain('My Realms');
    expect(getPageText()).not.toContain('All');

    expect(getPageText()).toMatch(/Realm 2(?!\d)/);
    expect(getPageText()).toMatch(/Realm 4(?!\d)/);
    expect(getPageText()).toMatch(/Realm 7(?!\d)/);
    expect(getPageText()).not.toMatch(/Realm 3(?!\d)/);
    expect(getPageText()).not.toMatch(/Realm 1(?!\d)/);

    const newTab = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) =>
      /new/i.test(tab.textContent ?? '')
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

  it('opens the editor from the create action in the compact catalog', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    listCatalogQueryMock.mockResolvedValue([buildMod(1)]);

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

  it('restores the cached compact catalog before the fresh load completes', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState({}, '', '/src/mod-catalog-compact.html?token=compact');
    window.sessionStorage.setItem(
      'alchemy:inline-view:mod-catalog-compact:/src/mod-catalog-compact.html?token=compact',
      JSON.stringify({
        activeTab: 'new',
        mods: [buildMod(1), buildMod(2)],
      })
    );
    listCatalogQueryMock.mockImplementation(
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
