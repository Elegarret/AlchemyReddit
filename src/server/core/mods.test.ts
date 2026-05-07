import { expect, vi } from 'vitest';
import { reddit, redis } from '@devvit/web/server';
import { Context, runWithContext } from '@devvit/server';
import { Header } from '@devvit/shared-types/Header.js';
import { test } from '../test';
import type { ModElement } from '../../modding/types';
import {
  getEditableModForUser,
  getModBestScore,
  getPublishedMod,
  hidePublishedMod,
  listAllAdminMods,
  listAllAdminModsPage,
  listAllPublishedMods,
  listBestMods,
  listCatalogMods,
  listFeaturedMods,
  listNewMods,
  listModsForUser,
  recordUniqueModPlayer,
  publishDraftForUser,
  recordUniqueModCompletion,
  removeModForUser,
  resolveRulesetFromPostData,
  saveDraftForUser,
  setFeaturedModForUser,
  unpublishModForUser,
} from './mods';
import { appRouter } from '../trpc';

const makeElement = (id: string, name: string): ModElement => ({
  id,
  name,
  iconSource: 'emoji',
  emoji: name[0] ?? '?',
  bgColorToken: 'ice',
  frameColorToken: 'ocean',
  message: '',
  effect: 'none',
  nonConsumable: false,
});

const saveStormLabDraft = async (
  userId: string,
  username: string,
  summary: string,
  modId?: string
) =>
  await saveDraftForUser(userId, username, {
    ...(modId ? { id: modId } : {}),
    title: 'Storm Lab',
    summary,
    intro: 'Welcome to the storm lab.',
    startingElementIds: ['air', 'water'],
    counters: [],
    showPalette: true,
    elements: [
      makeElement('air', 'Air'),
      makeElement('water', 'Water'),
      makeElement('storm', 'Storm'),
    ],
    reactions: [
      {
        leftId: 'air',
        rightId: 'water',
        outputIds: ['storm'],
      },
    ],
  });

const saveRealmDraft = async (
  userId: string,
  username: string,
  title: string,
  summary: string,
  modId?: string
) =>
  await saveDraftForUser(userId, username, {
    ...(modId ? { id: modId } : {}),
    title,
    summary,
    intro: `Welcome to ${title}.`,
    startingElementIds: ['air', 'water'],
    counters: [],
    showPalette: true,
    elements: [
      makeElement('air', 'Air'),
      makeElement('water', 'Water'),
      makeElement('storm', 'Storm'),
    ],
    reactions: [
      {
        leftId: 'air',
        rightId: 'water',
        outputIds: ['storm'],
      },
    ],
  });

test('best score maps to a wider 0-100 scale and clamps weak signals', async () => {
  expect(
    getModBestScore({
      playerCount: 0,
      upvotes: 0,
    })
  ).toBe(0);

  expect(
    getModBestScore({
      playerCount: 50,
      upvotes: -3,
    })
  ).toBe(0);

  expect(
    getModBestScore({
      playerCount: 75,
      upvotes: 2,
    })
  ).toBeGreaterThan(
    getModBestScore({
      playerCount: 400,
      upvotes: 2,
    })
  );

  expect(
    getModBestScore({
      playerCount: 1100,
      upvotes: 3,
    })
  ).toBeGreaterThan(
    getModBestScore({
      playerCount: 400,
      upvotes: 2,
    })
  );
});

test('republishing reuses the existing share post and updates its custom post data', async ({
  userId,
  username,
  mocks,
}) => {
  const bareSharePostId = 'sharepost';
  const sharePostId = 't3_sharepost';
  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  Object.defineProperty(sharePost, 'id', {
    configurable: true,
    value: bareSharePostId,
    writable: true,
  });
  vi.spyOn(sharePost, 'delete').mockResolvedValue(undefined);
  vi.spyOn(reddit, 'getPostById').mockImplementation(async (postId) => {
    if (postId === sharePostId) {
      return sharePost;
    }

    throw new Error(`Unexpected post lookup: ${postId}`);
  });
  const editSpy = vi.spyOn(sharePost, 'edit');
  const setPostDataSpy = vi.spyOn(sharePost, 'setPostData');
  const setTextFallbackSpy = vi.spyOn(sharePost, 'setTextFallback');
  const submitCustomPostSpy = vi
    .spyOn(reddit, 'submitCustomPost')
    .mockResolvedValue(sharePost);

  const saved = await saveStormLabDraft(
    userId,
    username,
    'Build storms from a compact recipe tree.'
  );

  const published = await publishDraftForUser(userId, username, saved.id);
  expect(published.mod.status).toBe('published');
  expect(published.mod.sharePostId).toBe(sharePostId);
  expect(published.sharePost.id).toBe(sharePostId);
  expect(published.sharePost.url).toContain('/comments/');

  const mineAfterPublish = await listModsForUser(userId);
  const modAfterPublish = mineAfterPublish.find((mod) => mod.id === saved.id);
  expect(modAfterPublish?.status).toBe('published');
  expect(modAfterPublish?.sharePostId).toBe(sharePostId);

  const catalogAfterPublish = await listCatalogMods();
  expect(catalogAfterPublish.map((mod) => mod.id)).toContain(saved.id);

  await saveStormLabDraft(
    userId,
    username,
    'Build storms from an expanded recipe tree.',
    saved.id
  );

  const republished = await publishDraftForUser(userId, username, saved.id);
  expect(republished.mod.status).toBe('published');
  expect(republished.mod.sharePostId).toBe(sharePostId);
  expect(republished.sharePost.id).toBe(sharePostId);
  expect(editSpy).not.toHaveBeenCalled();
  expect(setPostDataSpy).not.toHaveBeenCalled();
  expect(setTextFallbackSpy).not.toHaveBeenCalled();
  expect(submitCustomPostSpy).toHaveBeenCalledTimes(1);

  const catalogAfterDraftSave = await listCatalogMods();
  expect(catalogAfterDraftSave.map((mod) => mod.id)).toContain(saved.id);

  await unpublishModForUser(userId, username, saved.id);

  expect(await getPublishedMod(saved.id)).toBeNull();

  const mineAfterUnpublish = await listModsForUser(userId);
  const modAfterUnpublish = mineAfterUnpublish.find(
    (mod) => mod.id === saved.id
  );
  expect(modAfterUnpublish?.status).toBe('draft');
  expect(modAfterUnpublish?.sharePostId).toBeUndefined();

  const catalogAfterUnpublish = await listCatalogMods();
  expect(catalogAfterUnpublish.map((mod) => mod.id)).not.toContain(saved.id);
});

test('republishing preserves the original New catalog position', async ({
  userId,
  username,
  mocks,
}) => {
  vi.useFakeTimers();
  try {
    mocks.reddit.linksAndComments.addPost({
      id: 't3_firstpublish',
      title: "Storm Lab (testuser's realm)",
    });
    mocks.reddit.linksAndComments.addPost({
      id: 't3_secondpublish',
      title: "Storm Lab (testuser's realm)",
    });
    const firstPost = await reddit.getPostById('t3_firstpublish');
    const secondPost = await reddit.getPostById('t3_secondpublish');
    vi.spyOn(reddit, 'submitCustomPost')
      .mockResolvedValueOnce(firstPost)
      .mockResolvedValueOnce(secondPost);

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const firstSaved = await saveStormLabDraft(
      userId,
      username,
      'First realm.'
    );
    const firstPublish = await publishDraftForUser(
      userId,
      username,
      firstSaved.id
    );

    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    const secondSaved = await saveStormLabDraft(
      userId,
      username,
      'Second realm.'
    );
    const secondPublish = await publishDraftForUser(
      userId,
      username,
      secondSaved.id
    );

    expect((await listCatalogMods()).map((mod) => mod.id)).toEqual([
      secondSaved.id,
      firstSaved.id,
    ]);

    vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
    await saveStormLabDraft(
      userId,
      username,
      'First realm, updated.',
      firstSaved.id
    );
    const republished = await publishDraftForUser(
      userId,
      username,
      firstSaved.id
    );

    expect(republished.mod.publishedAt).toBe(firstPublish.mod.publishedAt);
    expect(republished.mod.updatedAt).toBe('2026-01-03T00:00:00.000Z');
    expect(secondPublish.mod.publishedAt).toBe('2026-01-02T00:00:00.000Z');
    expect((await listCatalogMods()).map((mod) => mod.id)).toEqual([
      secondSaved.id,
      firstSaved.id,
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test('shared post resolves the latest published realm data by mod id after republish', async ({
  userId,
  username,
  mocks,
  headers,
}) => {
  const bareSharePostId = 'sharepost';
  const sharePostId = 't3_sharepost';

  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  Object.defineProperty(sharePost, 'id', {
    configurable: true,
    value: bareSharePostId,
    writable: true,
  });

  const submitCustomPostSpy = vi
    .spyOn(reddit, 'submitCustomPost')
    .mockResolvedValue(sharePost);

  const saved = await saveStormLabDraft(
    userId,
    username,
    'Build storms from a compact recipe tree.'
  );

  const firstPublish = await publishDraftForUser(userId, username, saved.id);
  expect(firstPublish.mod.sharePostId).toBe(sharePostId);

  await saveStormLabDraft(
    userId,
    username,
    'Build storms from an expanded recipe tree.',
    saved.id
  );

  const republished = await publishDraftForUser(userId, username, saved.id);
  expect(republished.mod.sharePostId).toBe(sharePostId);
  expect(submitCustomPostSpy).toHaveBeenCalledTimes(1);

  const postData = {
    modId: saved.id,
    title: 'Storm Lab',
    slug: 'storm-lab',
    ...(firstPublish.mod.publishedHash
      ? { publishedHash: firstPublish.mod.publishedHash }
      : {}),
  };

  const resolved = await runWithContext(
    Context({
      ...headers,
      [Header.PostData]: JSON.stringify({
        developerData: postData,
      }),
    }),
    async () => await resolveRulesetFromPostData()
  );
  expect(resolved.modId).toBe(saved.id);
  expect(resolved.ruleset?.summary).toBe(
    'Build storms from an expanded recipe tree.'
  );
  expect(resolved.ruleset?.publishedHash).toBe(republished.mod.publishedHash);
});

test("moderators can load and save another user's published realm", async ({
  userId,
  username,
  headers,
  mocks,
}) => {
  const ownerUserId = 't2_owner';
  const ownerUsername = 'realmowner';
  const sharePostId = 't3_sharepost';

  const moderators = reddit.getModerators({
    subredditName: 'testsub',
    username,
    limit: 1,
  });
  const moderatorUser = await reddit.getUserByUsername(username);
  expect(moderatorUser).toBeDefined();
  if (!moderatorUser) {
    throw new Error('Expected moderator user to exist in the test harness.');
  }
  vi.spyOn(moderators, 'all').mockResolvedValue([moderatorUser]);
  vi.spyOn(reddit, 'getModerators').mockReturnValue(moderators);

  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (realmowner's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  Object.defineProperty(sharePost, 'id', {
    configurable: true,
    value: 'sharepost',
    writable: true,
  });
  vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue(sharePost);

  const ownerSaved = await runWithContext(
    Context({
      ...headers,
      [Header.User]: ownerUserId,
      [Header.Username]: ownerUsername,
      [Header.AppUser]: ownerUserId,
    }),
    async () =>
      await saveDraftForUser(ownerUserId, ownerUsername, {
        title: 'Storm Lab',
        summary: 'Original owner summary.',
        intro: 'Welcome to the storm lab.',
        startingElementIds: ['air', 'water'],
        counters: [],
        showPalette: true,
        elements: [
          makeElement('air', 'Air'),
          makeElement('water', 'Water'),
          makeElement('storm', 'Storm'),
        ],
        reactions: [
          {
            leftId: 'air',
            rightId: 'water',
            outputIds: ['storm'],
          },
        ],
      })
  );

  await runWithContext(
    Context({
      ...headers,
      [Header.User]: ownerUserId,
      [Header.Username]: ownerUsername,
      [Header.AppUser]: ownerUserId,
    }),
    async () =>
      await publishDraftForUser(ownerUserId, ownerUsername, ownerSaved.id)
  );

  const editable = await getEditableModForUser(userId, username, ownerSaved.id);
  expect(editable?.id).toBe(ownerSaved.id);
  expect(editable?.ownerUserId).toBe(ownerUserId);
  expect(editable?.summary).toBe('Original owner summary.');

  await redis.set(
    `mod:${ownerSaved.id}:draft:${userId}`,
    JSON.stringify({
      ...ownerSaved,
      ownerUserId: userId,
      ownerUsername: username,
      summary: 'Stale moderator summary.',
      status: 'draft',
      updatedAt: new Date(Date.UTC(2026, 0, 3)).toISOString(),
    })
  );
  await redis.zAdd(`mod:${ownerSaved.id}:draft-owners`, {
    member: userId,
    score: -Date.UTC(2026, 0, 3),
  });
  await redis.zAdd(`mods:owner:${userId}`, {
    member: ownerSaved.id,
    score: -Date.UTC(2026, 0, 3),
  });

  const moderatorSaved = await saveDraftForUser(userId, username, {
    id: ownerSaved.id,
    title: 'Storm Lab',
    summary: 'Moderator summary.',
    intro: 'Welcome to the storm lab.',
    startingElementIds: ['air', 'water'],
    counters: [],
    showPalette: true,
    elements: [
      makeElement('air', 'Air'),
      makeElement('water', 'Water'),
      makeElement('storm', 'Storm'),
    ],
    reactions: [
      {
        leftId: 'air',
        rightId: 'water',
        outputIds: ['storm'],
      },
    ],
  });

  expect(moderatorSaved.ownerUserId).toBe(ownerUserId);
  expect(moderatorSaved.ownerUsername).toBe(ownerUsername);
  expect(moderatorSaved.summary).toBe('Moderator summary.');
  expect(
    await redis.get(`mod:${ownerSaved.id}:draft:${userId}`)
  ).toBeUndefined();
  expect(
    (await redis.zRange(`mod:${ownerSaved.id}:draft-owners`, 0, 9)).map(
      ({ member }) => member
    )
  ).toEqual([ownerUserId]);

  const moderatorMine = await listModsForUser(userId);
  expect(moderatorMine.some((mod) => mod.id === ownerSaved.id)).toBe(false);

  const ownerMine = await listModsForUser(ownerUserId);
  expect(ownerMine.find((mod) => mod.id === ownerSaved.id)).toMatchObject({
    hasDraftVersion: true,
    hasPublishedVersion: true,
    ownerUsername,
    summary: 'Moderator summary.',
  });

  const adminItems = await listAllAdminMods();
  const matchingAdminItems = adminItems.filter(
    (mod) => mod.id === ownerSaved.id
  );
  expect(matchingAdminItems).toHaveLength(1);
  expect(matchingAdminItems[0]).toMatchObject({
    draftOwnerUsername: ownerUsername,
    hasDraftVersion: true,
    hasPublishedVersion: true,
    ownerUsername,
    summary: 'Moderator summary.',
  });

  const moderatorPublished = await publishDraftForUser(
    userId,
    username,
    ownerSaved.id
  );
  expect(moderatorPublished.mod.id).toBe(ownerSaved.id);
  expect(moderatorPublished.mod.ownerUserId).toBe(ownerUserId);
  expect(moderatorPublished.mod.ownerUsername).toBe(ownerUsername);
  expect(moderatorPublished.mod.summary).toBe('Moderator summary.');
});

test("deleting another user's realm removes latest data, drafts, and indexes", async ({
  userId,
  username,
  headers,
}) => {
  const ownerUserId = 't2_owner';
  const ownerUsername = 'realmowner';
  const moderators = reddit.getModerators({
    subredditName: 'testsub',
    username,
    limit: 1,
  });
  const moderatorUser = await reddit.getUserByUsername(username);
  expect(moderatorUser).toBeDefined();
  if (!moderatorUser) {
    throw new Error('Expected moderator user to exist in the test harness.');
  }
  vi.spyOn(moderators, 'all').mockResolvedValue([moderatorUser]);
  vi.spyOn(reddit, 'getModerators').mockReturnValue(moderators);

  const ownerSaved = await runWithContext(
    Context({
      ...headers,
      [Header.User]: ownerUserId,
      [Header.Username]: ownerUsername,
      [Header.AppUser]: ownerUserId,
    }),
    async () =>
      await saveDraftForUser(ownerUserId, ownerUsername, {
        title: 'Storm Lab',
        summary: 'Original owner summary.',
        intro: 'Welcome to the storm lab.',
        startingElementIds: ['air', 'water'],
        counters: [],
        showPalette: true,
        elements: [
          makeElement('air', 'Air'),
          makeElement('water', 'Water'),
          makeElement('storm', 'Storm'),
        ],
        reactions: [
          {
            leftId: 'air',
            rightId: 'water',
            outputIds: ['storm'],
          },
        ],
      })
  );

  await saveDraftForUser(userId, username, {
    id: ownerSaved.id,
    title: 'Storm Lab',
    summary: 'Moderator draft.',
    intro: 'Welcome to the storm lab.',
    startingElementIds: ['air', 'water'],
    counters: [],
    showPalette: true,
    elements: [
      makeElement('air', 'Air'),
      makeElement('water', 'Water'),
      makeElement('storm', 'Storm'),
    ],
    reactions: [
      {
        leftId: 'air',
        rightId: 'water',
        outputIds: ['storm'],
      },
    ],
  });
  await redis.set(
    `mod:${ownerSaved.id}:draft:${userId}`,
    JSON.stringify({
      ...ownerSaved,
      ownerUserId: userId,
      ownerUsername: username,
      summary: 'Historical moderator draft.',
      status: 'draft',
      updatedAt: new Date(Date.UTC(2026, 0, 4)).toISOString(),
    })
  );
  await redis.zAdd(`mod:${ownerSaved.id}:draft-owners`, {
    member: userId,
    score: -Date.UTC(2026, 0, 4),
  });
  await redis.zAdd(`mods:owner:${userId}`, {
    member: ownerSaved.id,
    score: -Date.UTC(2026, 0, 4),
  });
  await redis.zAdd(`mod:${ownerSaved.id}:players`, {
    member: 'player',
    score: 0,
  });
  await redis.zAdd(`mod:${ownerSaved.id}:completions`, {
    member: 'player',
    score: 0,
  });

  await removeModForUser(userId, username, ownerSaved.id);

  await expect(
    getEditableModForUser(ownerUserId, ownerUsername, ownerSaved.id)
  ).resolves.toBeNull();
  await expect(
    getEditableModForUser(userId, username, ownerSaved.id)
  ).resolves.toBeNull();
  expect(await redis.get(`mod:${ownerSaved.id}:latest`)).toBeUndefined();
  expect(await redis.get(`mod:${ownerSaved.id}:meta`)).toBeUndefined();
  expect(
    await redis.get(`mod:${ownerSaved.id}:draft:${ownerUserId}`)
  ).toBeUndefined();
  expect(
    await redis.get(`mod:${ownerSaved.id}:draft:${userId}`)
  ).toBeUndefined();
  expect(await redis.zRange(`mods:owner:${ownerUserId}`, 0, 9)).toEqual([]);
  expect(await redis.zRange(`mods:owner:${userId}`, 0, 9)).toEqual([]);
  expect(await redis.zRange(`mod:${ownerSaved.id}:draft-owners`, 0, 9)).toEqual(
    []
  );
  expect(await redis.zRange('mods:all', 0, 9)).toEqual([]);
  expect(await redis.zCard(`mod:${ownerSaved.id}:players`)).toBe(0);
  expect(await redis.zCard(`mod:${ownerSaved.id}:completions`)).toBe(0);
});

test('completion count records each user once for published realms', async ({
  userId,
  username,
  mocks,
}) => {
  const sharePostId = 't3_sharepost-complete';
  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  Object.defineProperty(sharePost, 'id', {
    configurable: true,
    value: 'sharepost-complete',
    writable: true,
  });
  vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue(sharePost);

  const saved = await saveStormLabDraft(
    userId,
    username,
    'Completion summary.'
  );
  await publishDraftForUser(userId, username, saved.id);

  await recordUniqueModCompletion(saved.id, userId);
  await recordUniqueModCompletion(saved.id, userId);

  const hiddenCatalog = await listCatalogMods();
  expect(
    hiddenCatalog.find((mod) => mod.id === saved.id)?.completionCount
  ).toBeUndefined();

  const catalog = await listCatalogMods({ includeCompletionCount: true });
  expect(catalog.find((mod) => mod.id === saved.id)?.completionCount).toBe(1);
});

test('admin listing includes draft-only, published, and hidden realms', async ({
  userId,
  username,
  mocks,
}) => {
  const sharePostId = 't3_sharepost-admin';
  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  Object.defineProperty(sharePost, 'id', {
    configurable: true,
    value: 'sharepost-admin',
    writable: true,
  });
  vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue(sharePost);

  const draftOnly = await saveStormLabDraft(
    userId,
    username,
    'Draft-only summary.'
  );
  const published = await saveStormLabDraft(
    userId,
    username,
    'Published summary.'
  );
  await publishDraftForUser(userId, username, published.id);

  const hidden = await saveStormLabDraft(userId, username, 'Hidden summary.');
  await publishDraftForUser(userId, username, hidden.id);
  await hidePublishedMod(userId, username, hidden.id);

  const adminItems = await listAllAdminMods();

  expect(adminItems.map((item) => item.id)).toEqual(
    expect.arrayContaining([draftOnly.id, published.id, hidden.id])
  );
  expect(adminItems.find((item) => item.id === draftOnly.id)).toMatchObject({
    hasDraftVersion: true,
    hasPublishedVersion: false,
    latestVersionStatus: null,
    status: 'draft',
  });
  expect(adminItems.find((item) => item.id === published.id)).toMatchObject({
    hasDraftVersion: true,
    hasPublishedVersion: true,
    latestVersionStatus: 'published',
  });
  expect(adminItems.find((item) => item.id === hidden.id)).toMatchObject({
    hasDraftVersion: true,
    hasPublishedVersion: false,
    latestVersionStatus: 'hidden',
  });
});

test('admin listing still includes published realms that predate the global admin index', async ({
  userId,
  username,
  mocks,
}) => {
  const sharePostId = 't3_sharepost-preindex';
  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  Object.defineProperty(sharePost, 'id', {
    configurable: true,
    value: 'sharepost-preindex',
    writable: true,
  });
  vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue(sharePost);

  const published = await saveStormLabDraft(
    userId,
    username,
    'Published before admin indexing.'
  );
  await publishDraftForUser(userId, username, published.id);
  await redis.zRem('mods:all', [published.id]);

  const adminItems = await listAllAdminMods();

  expect(adminItems.find((item) => item.id === published.id)).toMatchObject({
    hasPublishedVersion: true,
    id: published.id,
    latestVersionStatus: 'published',
  });
});

test('best listing refreshes stale cached scores and reorders realms', async ({
  userId,
  username,
  mocks,
}) => {
  mocks.reddit.linksAndComments.addPost({
    id: 't3_best_a',
    title: "Aurora Archive (testuser's realm)",
  });
  mocks.reddit.linksAndComments.addPost({
    id: 't3_best_b',
    title: "Blaze Basin (testuser's realm)",
  });

  const firstPost = await reddit.getPostById('t3_best_a');
  const secondPost = await reddit.getPostById('t3_best_b');
  const originalGetPostById = reddit.getPostById.bind(reddit);
  Object.defineProperty(firstPost, 'id', {
    configurable: true,
    value: 'best_a',
    writable: true,
  });
  Object.defineProperty(secondPost, 'id', {
    configurable: true,
    value: 'best_b',
    writable: true,
  });
  Object.defineProperty(firstPost, 'score', {
    configurable: true,
    value: 1,
    writable: true,
  });
  Object.defineProperty(secondPost, 'score', {
    configurable: true,
    value: 5,
    writable: true,
  });
  vi.spyOn(reddit, 'getPostById').mockImplementation(async (postId) => {
    if (postId === 't3_best_a') {
      return firstPost;
    }

    if (postId === 't3_best_b') {
      return secondPost;
    }

    return await originalGetPostById(postId);
  });
  vi.spyOn(reddit, 'submitCustomPost')
    .mockResolvedValueOnce(firstPost)
    .mockResolvedValueOnce(secondPost);

  const firstSaved = await saveRealmDraft(
    userId,
    username,
    'Aurora Archive',
    'Cold-light experiments.'
  );
  const secondSaved = await saveRealmDraft(
    userId,
    username,
    'Blaze Basin',
    'Heat-first experiments.'
  );
  await publishDraftForUser(userId, username, firstSaved.id);
  await publishDraftForUser(userId, username, secondSaved.id);

  const initialBest = await listBestMods(2);
  expect(initialBest.map((mod) => mod.id)).toEqual([
    secondSaved.id,
    firstSaved.id,
  ]);

  Object.defineProperty(firstPost, 'score', {
    configurable: true,
    value: 12,
    writable: true,
  });
  Object.defineProperty(secondPost, 'score', {
    configurable: true,
    value: 0,
    writable: true,
  });

  for (const modId of [firstSaved.id, secondSaved.id]) {
    const rawCache = await redis.get(`mod:${modId}:rank-cache`);
    expect(rawCache).toBeDefined();
    const parsedCache = JSON.parse(rawCache ?? '{}') as {
      bestScore: number;
      playerCount: number;
      upvotes: number;
    };
    await redis.set(
      `mod:${modId}:rank-cache`,
      JSON.stringify({
        ...parsedCache,
        lastSyncedAt: '2025-01-01T00:00:00.000Z',
      })
    );
  }

  const refreshedBest = await listBestMods(2);
  expect(refreshedBest.map((mod) => mod.id)).toEqual([
    firstSaved.id,
    secondSaved.id,
  ]);
  expect(refreshedBest[0]?.upvotes).toBe(12);
  expect(refreshedBest[1]?.upvotes).toBe(0);
});

test('recording a unique player updates cached player counts and best score', async ({
  userId,
  username,
  mocks,
}) => {
  const sharePostId = 't3_rank_cache_player';
  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  const originalGetPostById = reddit.getPostById.bind(reddit);
  Object.defineProperty(sharePost, 'id', {
    configurable: true,
    value: 'rank_cache_player',
    writable: true,
  });
  Object.defineProperty(sharePost, 'score', {
    configurable: true,
    value: 9,
    writable: true,
  });
  vi.spyOn(reddit, 'getPostById').mockImplementation(async (postId) => {
    if (postId === sharePostId) {
      return sharePost;
    }

    return await originalGetPostById(postId);
  });
  vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue(sharePost);

  const saved = await saveStormLabDraft(userId, username, 'Player cache sync.');
  await publishDraftForUser(userId, username, saved.id);

  const before = await listBestMods(1);
  expect(before[0]?.playerCount ?? 0).toBe(0);

  await recordUniqueModPlayer(saved.id, 't2_player_a');

  const after = await listBestMods(1);
  expect(after[0]?.playerCount).toBe(1);
  expect(after[0]?.bestScore).toBeCloseTo(
    Math.min(
      100,
      Math.max(
        0,
        100 *
          (1 -
            Math.exp(
              -((9 / (1 + Math.log1p(1) * 0.15)) * 0.45)
            ))
      )
    ),
    5
  );
});

test('published listing paginates and applies prefix search server-side', async ({
  userId,
  username,
  mocks,
}) => {
  vi.useFakeTimers();
  try {
    mocks.reddit.linksAndComments.addPost({
      id: 't3_crystal',
      title: "Crystal Cove (testuser's realm)",
    });
    mocks.reddit.linksAndComments.addPost({
      id: 't3_forest',
      title: "Forest Forge (testuser's realm)",
    });
    mocks.reddit.linksAndComments.addPost({
      id: 't3_desert',
      title: "Desert Dawn (testuser's realm)",
    });
    const crystalPost = await reddit.getPostById('t3_crystal');
    const forestPost = await reddit.getPostById('t3_forest');
    const desertPost = await reddit.getPostById('t3_desert');
    Object.defineProperty(crystalPost, 'id', {
      configurable: true,
      value: 'crystal',
      writable: true,
    });
    Object.defineProperty(forestPost, 'id', {
      configurable: true,
      value: 'forest',
      writable: true,
    });
    Object.defineProperty(desertPost, 'id', {
      configurable: true,
      value: 'desert',
      writable: true,
    });
    vi.spyOn(reddit, 'submitCustomPost')
      .mockResolvedValueOnce(crystalPost)
      .mockResolvedValueOnce(forestPost)
      .mockResolvedValueOnce(desertPost);

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const crystal = await saveRealmDraft(
      userId,
      username,
      'Crystal Cove',
      'Frozen surf.'
    );
    await publishDraftForUser(userId, username, crystal.id);

    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    const forest = await saveRealmDraft(
      userId,
      username,
      'Forest Forge',
      'Hot roots.'
    );
    await publishDraftForUser(userId, username, forest.id);

    vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
    const desert = await saveRealmDraft(
      userId,
      username,
      'Desert Dawn',
      'Dry light.'
    );
    await publishDraftForUser(userId, username, desert.id);

    const firstPage = await listAllPublishedMods({
      page: 0,
      pageSize: 2,
    });
    expect(firstPage.totalItems).toBe(3);
    expect(firstPage.totalPages).toBe(2);
    expect(firstPage.items.map((item) => item.id)).toEqual([
      desert.id,
      forest.id,
    ]);

    const newest = await listNewMods(2);
    expect(newest.map((item) => item.id)).toEqual([desert.id, forest.id]);

    const secondPage = await listAllPublishedMods({
      page: 1,
      pageSize: 2,
    });
    expect(secondPage.items.map((item) => item.id)).toEqual([crystal.id]);

    const titleSearch = await listAllPublishedMods({
      page: 0,
      pageSize: 10,
      query: 'for',
    });
    expect(titleSearch.items.map((item) => item.id)).toEqual([forest.id]);

    const ownerSearch = await listAllPublishedMods({
      page: 0,
      pageSize: 10,
      query: 'tes',
    });
    expect(ownerSearch.totalItems).toBe(3);
  } finally {
    vi.useRealTimers();
  }
});

test('featured listing only returns featured published realms', async ({
  userId,
  username,
  mocks,
}) => {
  mocks.reddit.linksAndComments.addPost({
    id: 't3_featured_alpha',
    title: "Alpha (testuser's realm)",
  });
  mocks.reddit.linksAndComments.addPost({
    id: 't3_featured_beta',
    title: "Beta (testuser's realm)",
  });
  mocks.reddit.linksAndComments.addPost({
    id: 't3_featured_gamma',
    title: "Gamma (testuser's realm)",
  });
  const alphaPost = await reddit.getPostById('t3_featured_alpha');
  const betaPost = await reddit.getPostById('t3_featured_beta');
  const gammaPost = await reddit.getPostById('t3_featured_gamma');
  Object.defineProperty(alphaPost, 'id', {
    configurable: true,
    value: 'featured_alpha',
    writable: true,
  });
  Object.defineProperty(betaPost, 'id', {
    configurable: true,
    value: 'featured_beta',
    writable: true,
  });
  Object.defineProperty(gammaPost, 'id', {
    configurable: true,
    value: 'featured_gamma',
    writable: true,
  });
  vi.spyOn(reddit, 'submitCustomPost')
    .mockResolvedValueOnce(alphaPost)
    .mockResolvedValueOnce(betaPost)
    .mockResolvedValueOnce(gammaPost);

  const alpha = await saveRealmDraft(userId, username, 'Alpha', 'Featured.');
  const beta = await saveRealmDraft(userId, username, 'Beta', 'Featured.');
  const gamma = await saveRealmDraft(userId, username, 'Gamma', 'Standard.');
  await publishDraftForUser(userId, username, alpha.id);
  await publishDraftForUser(userId, username, beta.id);
  await publishDraftForUser(userId, username, gamma.id);

  const moderators = reddit.getModerators({
    subredditName: 'testsub',
    username,
    limit: 1,
  });
  const moderatorUser = await reddit.getUserByUsername(username);
  expect(moderatorUser).toBeDefined();
  if (!moderatorUser) {
    throw new Error('Expected moderator user to exist in the test harness.');
  }
  vi.spyOn(moderators, 'all').mockResolvedValue([moderatorUser]);
  vi.spyOn(reddit, 'getModerators').mockReturnValue(moderators);

  await setFeaturedModForUser(userId, username, alpha.id, true);
  await setFeaturedModForUser(userId, username, beta.id, true);

  const featured = await listFeaturedMods(10);
  expect(featured).toHaveLength(2);
  expect(featured.map((item) => item.id)).toEqual(
    expect.arrayContaining([alpha.id, beta.id])
  );
  expect(featured.map((item) => item.id)).not.toContain(gamma.id);
});

test('admin paginated listing keeps published realms first and supports admin-only search fields', async ({
  userId,
  username,
  mocks,
}) => {
  vi.useFakeTimers();
  try {
    mocks.reddit.linksAndComments.addPost({
      id: 't3_admin_published',
      title: "Published Peak (testuser's realm)",
    });
    mocks.reddit.linksAndComments.addPost({
      id: 't3_admin_hidden',
      title: "Veiled Vault (testuser's realm)",
    });
    const publishedPost = await reddit.getPostById('t3_admin_published');
    const hiddenPost = await reddit.getPostById('t3_admin_hidden');
    Object.defineProperty(publishedPost, 'id', {
      configurable: true,
      value: 'admin_published',
      writable: true,
    });
    Object.defineProperty(hiddenPost, 'id', {
      configurable: true,
      value: 'admin_hidden',
      writable: true,
    });
    vi.spyOn(reddit, 'submitCustomPost')
      .mockResolvedValueOnce(publishedPost)
      .mockResolvedValueOnce(hiddenPost);

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const published = await saveRealmDraft(
      userId,
      username,
      'Published Peak',
      'Visible realm.'
    );
    await publishDraftForUser(userId, username, published.id);

    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    const draftOnly = await saveRealmDraft(
      userId,
      username,
      'Draft Delta',
      'Draft realm.'
    );

    vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
    const hidden = await saveRealmDraft(
      userId,
      username,
      'Veiled Vault',
      'Hidden realm.'
    );
    await publishDraftForUser(userId, username, hidden.id);
    await hidePublishedMod(userId, username, hidden.id);

    const adminPage = await listAllAdminModsPage({
      page: 0,
      pageSize: 10,
    });
    expect(adminPage.items[0]?.id).toBe(published.id);
    expect(adminPage.items.map((item) => item.id)).toEqual([
      published.id,
      hidden.id,
      draftOnly.id,
    ]);

    const hiddenSearch = await listAllAdminModsPage({
      page: 0,
      pageSize: 10,
      query: 'hid',
    });
    expect(hiddenSearch.items.map((item) => item.id)).toEqual([hidden.id]);

    const draftSearch = await listAllAdminModsPage({
      page: 0,
      pageSize: 10,
      query: 'del',
    });
    expect(draftSearch.items.map((item) => item.id)).toEqual([draftOnly.id]);
  } finally {
    vi.useRealTimers();
  }
});

test('non-moderators cannot access the admin realm listing query', async ({
  headers,
  username,
}) => {
  const moderators = reddit.getModerators({
    subredditName: 'testsub',
    username,
    limit: 1,
  });
  vi.spyOn(moderators, 'all').mockResolvedValue([]);
  vi.spyOn(reddit, 'getModerators').mockReturnValue(moderators);

  await expect(
    runWithContext(Context(headers), async () => {
      const caller = appRouter.createCaller({});
      return await caller.mods.listAllAdmin();
    })
  ).rejects.toThrow('You are not allowed to view all realms.');
});

test('non-moderators cannot feature realms', async ({
  userId,
  username,
  mocks,
}) => {
  const sharePostId = 't3_sharepost-feature-forbidden';
  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  Object.defineProperty(sharePost, 'id', {
    configurable: true,
    value: 'sharepost-feature-forbidden',
    writable: true,
  });
  vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue(sharePost);

  const saved = await saveStormLabDraft(
    userId,
    username,
    'Feature forbidden summary.'
  );
  await publishDraftForUser(userId, username, saved.id);

  const moderators = reddit.getModerators({
    subredditName: 'testsub',
    username,
    limit: 1,
  });
  vi.spyOn(moderators, 'all').mockResolvedValue([]);
  vi.spyOn(reddit, 'getModerators').mockReturnValue(moderators);

  await expect(
    setFeaturedModForUser(userId, username, saved.id, true)
  ).rejects.toThrow('You are not allowed to feature this mod.');
});

test('moderators can feature and unfeature published realms', async ({
  userId,
  username,
  mocks,
}) => {
  const sharePostId = 't3_sharepost-featured';
  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  Object.defineProperty(sharePost, 'id', {
    configurable: true,
    value: 'sharepost-featured',
    writable: true,
  });
  vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue(sharePost);

  const saved = await saveStormLabDraft(userId, username, 'Featured summary.');
  await publishDraftForUser(userId, username, saved.id);

  const moderators = reddit.getModerators({
    subredditName: 'testsub',
    username,
    limit: 1,
  });
  const moderatorUser = await reddit.getUserByUsername(username);
  expect(moderatorUser).toBeDefined();
  if (!moderatorUser) {
    throw new Error('Expected moderator user to exist in the test harness.');
  }
  vi.spyOn(moderators, 'all').mockResolvedValue([moderatorUser]);
  vi.spyOn(reddit, 'getModerators').mockReturnValue(moderators);

  const featured = await setFeaturedModForUser(
    userId,
    username,
    saved.id,
    true
  );
  expect(featured.featuredAt).toBeTruthy();
  expect(featured.featuredBy).toBe(username);

  const catalogAfterFeature = await listCatalogMods();
  expect(catalogAfterFeature.find((mod) => mod.id === saved.id)).toMatchObject({
    featuredBy: username,
  });

  await saveStormLabDraft(
    userId,
    username,
    'Featured summary after edit.',
    saved.id
  );
  await publishDraftForUser(userId, username, saved.id);

  const catalogAfterRepublish = await listCatalogMods();
  expect(
    catalogAfterRepublish.find((mod) => mod.id === saved.id)?.featuredBy
  ).toBe(username);

  const unfeatured = await setFeaturedModForUser(
    userId,
    username,
    saved.id,
    false
  );
  expect(unfeatured.featuredAt).toBeUndefined();
  expect(unfeatured.featuredBy).toBeUndefined();
});

test('image uploads require a logged-in user and return Reddit-hosted URLs', async ({
  headers,
  mocks,
}) => {
  const dataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0l8AAAAASUVORK5CYII=';
  const anonymousHeaders = { ...headers };
  delete anonymousHeaders[Header.User];
  delete anonymousHeaders[Header.Username];

  await expect(
    runWithContext(Context(anonymousHeaders), async () => {
      const caller = appRouter.createCaller({});
      return await caller.mods.uploadElementIcon(dataUrl);
    })
  ).rejects.toThrow('You must be logged in.');
  await expect(
    runWithContext(Context(anonymousHeaders), async () => {
      const caller = appRouter.createCaller({});
      return await caller.mods.uploadRealmCover(dataUrl);
    })
  ).rejects.toThrow('You must be logged in.');

  const uploadedIcon = await runWithContext(Context(headers), async () => {
    const caller = appRouter.createCaller({});
    return await caller.mods.uploadElementIcon(dataUrl);
  });
  const uploadedCover = await runWithContext(Context(headers), async () => {
    const caller = appRouter.createCaller({});
    return await caller.mods.uploadRealmCover(dataUrl);
  });

  expect(uploadedIcon.url).toContain('https://i.redd.it/');
  expect(uploadedCover.url).toContain('https://i.redd.it/');
  expect(mocks.media.uploads).toHaveLength(2);
  expect(mocks.media.uploads[0]?.url).toBe(dataUrl);
  expect(mocks.media.uploads[0]?.type).toBe('image');
  expect(mocks.media.uploads[1]?.url).toBe(dataUrl);
  expect(mocks.media.uploads[1]?.type).toBe('image');
});

test('saving and publishing preserve realm cover image URLs and include them in hashes', async ({
  mocks,
  userId,
  username,
}) => {
  const sharePostId = 't3_coverhash';
  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue(sharePost);

  const saved = await saveDraftForUser(userId, username, {
    title: 'Storm Lab',
    summary: 'Cover persistence check.',
    coverImageUrl: 'https://i.redd.it/cover-a.png',
    intro: 'Welcome to the storm lab.',
    startingElementIds: ['air', 'water'],
    counters: [],
    showPalette: true,
    elements: [
      makeElement('air', 'Air'),
      makeElement('water', 'Water'),
      makeElement('storm', 'Storm'),
    ],
    reactions: [
      {
        leftId: 'air',
        rightId: 'water',
        outputIds: ['storm'],
      },
    ],
  });

  expect(saved.coverImageUrl).toBe('https://i.redd.it/cover-a.png');

  const firstPublish = await publishDraftForUser(userId, username, saved.id);
  expect(firstPublish.mod.coverImageUrl).toBe('https://i.redd.it/cover-a.png');
  const firstHash = firstPublish.mod.publishedHash;

  await saveDraftForUser(userId, username, {
    id: saved.id,
    title: 'Storm Lab',
    summary: 'Cover persistence check.',
    coverImageUrl: 'https://i.redd.it/cover-b.png',
    intro: 'Welcome to the storm lab.',
    startingElementIds: ['air', 'water'],
    counters: [],
    showPalette: true,
    elements: [
      makeElement('air', 'Air'),
      makeElement('water', 'Water'),
      makeElement('storm', 'Storm'),
    ],
    reactions: [
      {
        leftId: 'air',
        rightId: 'water',
        outputIds: ['storm'],
      },
    ],
  });

  const secondPublish = await publishDraftForUser(userId, username, saved.id);
  const latest = await getPublishedMod(saved.id);

  expect(secondPublish.mod.coverImageUrl).toBe('https://i.redd.it/cover-b.png');
  expect(latest?.coverImageUrl).toBe('https://i.redd.it/cover-b.png');
  expect(secondPublish.mod.publishedHash).not.toBe(firstHash);
});

test('draft save and load preserve editor-only reaction comments', async ({
  userId,
  username,
}) => {
  const saved = await saveDraftForUser(userId, username, {
    title: 'Storm Lab',
    summary: 'Comment persistence check.',
    intro: 'Welcome to the storm lab.',
    startingElementIds: ['air', 'water'],
    counters: [],
    showPalette: true,
    elements: [
      makeElement('air', 'Air'),
      makeElement('water', 'Water'),
      makeElement('storm', 'Storm'),
    ],
    reactions: [
      {
        leftId: 'air',
        rightId: 'water',
        outputIds: ['storm'],
      },
    ],
    reactionComments: {
      byReaction: [
        {
          headerComment: ' header note',
          leadingComments: [' leading note'],
        },
      ],
      trailingComments: [' trailing note'],
    },
  });

  const editable = await getEditableModForUser(userId, username, saved.id);

  expect(editable?.reactionComments).toEqual({
    byReaction: [
      {
        headerComment: ' header note',
        leadingComments: [' leading note'],
      },
    ],
    trailingComments: [' trailing note'],
  });
});

test('draft save and publish derive runtime fields from reaction text', async ({
  userId,
  username,
  mocks,
}) => {
  const sharePostId = 't3_sharepost-reaction-text';
  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  Object.defineProperty(sharePost, 'id', {
    configurable: true,
    value: 'sharepost-reaction-text',
    writable: true,
  });
  vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue(sharePost);

  const reactionText = [
    'starters: Air, Water',
    '',
    'function Reward:',
    '    add Storm',
    'Air+Water=',
    '    call Reward',
    '',
  ].join('\n');
  const saved = await saveDraftForUser(userId, username, {
    title: 'Storm Lab',
    summary: 'Reaction text source check.',
    intro: 'Welcome to the storm lab.',
    startingElementIds: ['air', 'water'],
    counters: [],
    showPalette: true,
    elements: [
      makeElement('air', 'Air'),
      makeElement('water', 'Water'),
      makeElement('storm', 'Storm'),
    ],
    reactions: [
      {
        leftId: 'air',
        rightId: 'water',
        outputIds: [],
      },
    ],
    reactionText,
  });

  expect(saved.reactionText).toBe(reactionText);
  expect(saved.functions).toEqual([
    {
      name: 'Reward',
      script: 'add Storm',
    },
  ]);
  expect(saved.reactions).toEqual([
    {
      leftId: 'air',
      rightId: 'water',
      outputIds: [],
      script: 'call Reward',
    },
  ]);

  const published = await publishDraftForUser(userId, username, saved.id);
  expect(published.mod.reactionText).toBe(reactionText);
  expect(published.mod.functions).toEqual(saved.functions);
});

test('draft save rejects invalid function calls from reaction text', async ({
  userId,
  username,
}) => {
  await expect(
    saveDraftForUser(userId, username, {
      title: 'Loop Lab',
      summary: 'Recursive function check.',
      intro: '',
      startingElementIds: ['air', 'water'],
      counters: [],
      showPalette: true,
      elements: [
        makeElement('air', 'Air'),
        makeElement('water', 'Water'),
      ],
      reactions: [],
      reactionText: [
        'starters: Air, Water',
        '',
        'function Loop:',
        '    call Loop',
        'Air+Water=',
        '    call Loop',
      ].join('\n'),
    })
  ).rejects.toThrow('Function "Loop" cannot call itself recursively.');
});

test('saving allows oversized output lists but publishing blocks on the warning', async ({
  userId,
  username,
}) => {
  const saved = await saveDraftForUser(userId, username, {
    title: 'Overflow Lab',
    summary: 'Draft saves should allow more than eight outputs.',
    intro: '',
    startingElementIds: ['air', 'fire'],
    counters: [],
    showPalette: true,
    elements: [
      makeElement('air', 'Air'),
      makeElement('fire', 'Fire'),
      ...Array.from({ length: 9 }, (_, index) =>
        makeElement(`out-${index + 1}`, `Out ${index + 1}`)
      ),
    ],
    reactions: [
      {
        leftId: 'air',
        rightId: 'fire',
        outputIds: Array.from({ length: 9 }, (_, index) => `out-${index + 1}`),
      },
    ],
  });

  expect(saved.reactions[0]?.outputIds).toHaveLength(9);
  await expect(publishDraftForUser(userId, username, saved.id)).rejects.toThrow(
    'Reaction Air + Fire has too many outputs. Max output length must be 8 elements.'
  );
});
