import { expect, vi } from 'vitest';
import { reddit } from '@devvit/web/server';
import { Context, runWithContext } from '@devvit/server';
import { Header } from '@devvit/shared-types/Header.js';
import { test } from '../test';
import type { ModElement } from '../../modding/types';
import {
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

  await unpublishModForUser(userId, saved.id);

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
