import { afterEach, describe, expect, it, vi } from 'vitest';

const listCatalogQueryMock = vi.fn();
const listMineQueryMock = vi.fn();
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
        listMine: {
          query: listMineQueryMock,
        },
      },
    },
  };
});

vi.mock('./webview-navigation', () => {
  return {
    getLastPlayedRealm: () => null,
    openEntry: openEntryMock,
    setEditorTargetModId: setEditorTargetModIdMock,
    setLastPlayedRealm: setLastPlayedRealmMock,
  };
});

afterEach(() => {
  listCatalogQueryMock.mockReset();
  listMineQueryMock.mockReset();
  navigateToMock.mockReset();
  openEntryMock.mockReset();
  setEditorTargetModIdMock.mockReset();
  setLastPlayedRealmMock.mockReset();
  document.body.innerHTML = '';
  window.localStorage.clear();
  vi.resetModules();
});

describe('Catalog', () => {
  it('shows the empty realm size tier in a warning color with the tooltip', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    listCatalogQueryMock.mockResolvedValue([
      {
        elementCount: 8,
        hasDraftVersion: false,
        hasPublishedVersion: true,
        id: 'mod-1',
        ownerUsername: 'author',
        playerCount: 12,
        publishedAt: '2026-03-01T00:00:00.000Z',
        publishedHash: 'hash-1',
        reactionCount: 4,
        sharePostId: 't3_post1',
        status: 'published' as const,
        summary: 'Short realm summary',
        title: 'Quiet Realm',
        updatedAt: '2026-03-02T00:00:00.000Z',
        upvotes: 3,
      },
    ]);
    listMineQueryMock.mockResolvedValue([]);

    await import('./mod-catalog');
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(document.body.textContent).toContain('empty');

    const tooltipNode = document.querySelector(
      '[title="Realm size: 4 reactions"]'
    );
    expect(tooltipNode).toBeTruthy();
    expect(tooltipNode?.className).toContain(
      'text-[color:var(--realm-size-empty-text)]'
    );
  });
});
