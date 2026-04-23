import { expect, vi } from 'vitest';
import { reddit, redis } from '@devvit/web/server';
import { Context, runWithContext } from '@devvit/server';
import { Header } from '@devvit/shared-types/Header.js';
import { test } from '../test';
import type { ModElement } from '../../modding/types';
import {
  getEditableModForUser,
  getPublishedMod,
  hidePublishedMod,
  listAllAdminMods,
  listCatalogMods,
  listModsForUser,
  publishDraftForUser,
  removeModForUser,
  resolveRulesetFromPostData,
  saveDraftForUser,
  unpublishModForUser,
} from './mods';
import { appRouter } from '../trpc';

const makeElement = (id: string, name: string): ModElement => ({
  id,
  name,
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
  const modAfterUnpublish = mineAfterUnpublish.find((mod) => mod.id === saved.id);
  expect(modAfterUnpublish?.status).toBe('draft');
  expect(modAfterUnpublish?.sharePostId).toBeUndefined();

  const catalogAfterUnpublish = await listCatalogMods();
  expect(catalogAfterUnpublish.map((mod) => mod.id)).not.toContain(saved.id);
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
  expect(await redis.get(`mod:${ownerSaved.id}:draft:${userId}`)).toBeUndefined();
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
  const matchingAdminItems = adminItems.filter((mod) => mod.id === ownerSaved.id);
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

  await removeModForUser(userId, username, ownerSaved.id);

  await expect(getEditableModForUser(ownerUserId, ownerUsername, ownerSaved.id))
    .resolves.toBeNull();
  await expect(getEditableModForUser(userId, username, ownerSaved.id)).resolves.toBeNull();
  expect(await redis.get(`mod:${ownerSaved.id}:latest`)).toBeUndefined();
  expect(await redis.get(`mod:${ownerSaved.id}:meta`)).toBeUndefined();
  expect(await redis.get(`mod:${ownerSaved.id}:draft:${ownerUserId}`)).toBeUndefined();
  expect(await redis.get(`mod:${ownerSaved.id}:draft:${userId}`)).toBeUndefined();
  expect(await redis.zRange(`mods:owner:${ownerUserId}`, 0, 9)).toEqual([]);
  expect(await redis.zRange(`mods:owner:${userId}`, 0, 9)).toEqual([]);
  expect(await redis.zRange(`mod:${ownerSaved.id}:draft-owners`, 0, 9)).toEqual([]);
  expect(await redis.zRange('mods:all', 0, 9)).toEqual([]);
  expect(await redis.zCard(`mod:${ownerSaved.id}:players`)).toBe(0);
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
  expect(
    adminItems.find((item) => item.id === draftOnly.id)
  ).toMatchObject({
    hasDraftVersion: true,
    hasPublishedVersion: false,
    latestVersionStatus: null,
    status: 'draft',
  });
  expect(
    adminItems.find((item) => item.id === published.id)
  ).toMatchObject({
    hasDraftVersion: true,
    hasPublishedVersion: true,
    latestVersionStatus: 'published',
  });
  expect(
    adminItems.find((item) => item.id === hidden.id)
  ).toMatchObject({
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
