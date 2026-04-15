import { afterEach, describe, expect, it, vi } from 'vitest';

const listCatalogQueryMock = vi.fn();
const listAllAdminQueryMock = vi.fn();
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
        listAllAdmin: {
          query: listAllAdminQueryMock,
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
  listCatalogQueryMock.mockReset();
  listAllAdminQueryMock.mockReset();
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
    listAllAdminQueryMock.mockRejectedValue(new Error('forbidden'));
    listMineQueryMock.mockResolvedValue([]);

    await import('./mod-catalog');
    await waitFor(() => document.body.textContent?.includes('Quiet Realm') ?? false);

    expect(document.body.textContent).toContain('empty');

    const tooltipNode = document.querySelector(
      '[title="Realm size: 4 reactions"]'
    );
    expect(tooltipNode).toBeTruthy();
    expect(tooltipNode?.className).toContain(
      'text-[color:var(--realm-size-empty-text)]'
    );
    expect(document.querySelector('[title="Upvotes: 3"]')).toBeTruthy();
    expect(document.querySelector('[title="Users played: 12"]')).toBeTruthy();
  });

  it('shows admin-visible realms inside the All section and reuses the editor target flow for Edit', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    listCatalogQueryMock.mockResolvedValue([]);
    listMineQueryMock.mockResolvedValue([]);
    listAllAdminQueryMock.mockResolvedValue([
      {
        draftOwnerUsername: 'modauthor',
        draftUpdatedAt: '2026-04-07T00:00:00.000Z',
        elementCount: 8,
        hasDraftVersion: true,
        hasPublishedVersion: true,
        id: 'mod-2',
        latestVersionStatus: 'published' as const,
        ownerUsername: 'modauthor',
        playerCount: 4,
        publishedAt: '2026-04-01T00:00:00.000Z',
        publishedHash: 'hash-2',
        reactionCount: 10,
        sharePostId: 't3_post2',
        status: 'draft' as const,
        summary: 'Admin realm summary',
        title: 'Admin Realm',
        updatedAt: '2026-04-07T00:00:00.000Z',
        upvotes: 5,
      },
    ]);

    await import('./mod-catalog');
    await waitFor(() => document.body.textContent?.includes('Admin Realm') ?? false);

    expect(document.body.textContent).toContain('Admin Realm');
    expect(
      document.querySelector('input[placeholder="Search realms, drafts, or authors..."]')
    ).toBeTruthy();

    const editButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Edit'
    );
    expect(editButton).toBeTruthy();

    editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(setEditorTargetModIdMock).toHaveBeenCalledWith('mod-2');
    expect(openEntryMock).toHaveBeenCalledWith(expect.any(MouseEvent), 'mod-editor');
  });
});
