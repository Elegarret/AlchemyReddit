import { expect, vi } from 'vitest';
import { reddit } from '@devvit/web/server';
import { Context, runWithContext } from '@devvit/server';
import { Header } from '@devvit/shared-types/Header.js';
import { test } from '../test';
import type { ModElement } from '../../modding/types';
import {
  getEditableModForUser,
  getPublishedMod,
  listCatalogMods,
  listModsForUser,
  publishDraftForUser,
  resolveRulesetFromPostData,
  saveDraftForUser,
  unpublishModForUser,
} from './mods';

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

  const published = await publishDraftForUser(userId, saved.id);
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

  const republished = await publishDraftForUser(userId, saved.id);
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

  const firstPublish = await publishDraftForUser(userId, saved.id);
  expect(firstPublish.mod.sharePostId).toBe(sharePostId);

  await saveStormLabDraft(
    userId,
    username,
    'Build storms from an expanded recipe tree.',
    saved.id
  );

  const republished = await publishDraftForUser(userId, saved.id);
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
    async () => await publishDraftForUser(ownerUserId, ownerSaved.id)
  );

  const editable = await getEditableModForUser(userId, username, ownerSaved.id);
  expect(editable?.id).toBe(ownerSaved.id);
  expect(editable?.ownerUserId).toBe(ownerUserId);
  expect(editable?.summary).toBe('Original owner summary.');

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

  expect(moderatorSaved.ownerUserId).toBe(userId);
  expect(moderatorSaved.ownerUsername).toBe(username);
  expect(moderatorSaved.summary).toBe('Moderator summary.');
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
