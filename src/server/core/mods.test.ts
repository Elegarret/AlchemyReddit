import { expect, vi } from 'vitest';
import { reddit } from '@devvit/web/server';
import { test } from '../test';
import type { ModElement, SharePostData } from '../../modding/types';
import {
  getPublishedMod,
  listCatalogMods,
  listModsForUser,
  publishDraftForUser,
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
  const editSpy = vi
    .spyOn(sharePost, 'edit')
    .mockRejectedValue(new Error('sharePost.edit should not be used'));
  const setPostDataSpy = vi.spyOn(sharePost, 'setPostData').mockResolvedValue(
    undefined
  );
  const setTextFallbackSpy = vi
    .spyOn(sharePost, 'setTextFallback')
    .mockResolvedValue(undefined);
  vi.spyOn(reddit, 'getPostById').mockImplementation(async (postId) => {
    if (postId === sharePostId) {
      return sharePost;
    }

    throw new Error(`Unexpected post lookup: ${postId}`);
  });
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
  expect(setPostDataSpy).toHaveBeenLastCalledWith({
    modId: saved.id,
    title: 'Storm Lab',
    slug: 'storm-lab',
    publishedHash: republished.mod.publishedHash,
  } satisfies SharePostData);
  expect(setTextFallbackSpy).toHaveBeenLastCalledWith({
    text: 'Build storms from an expanded recipe tree.',
  });
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

test('republishing creates a replacement share post when updating the old one fails', async ({
  userId,
  username,
  mocks,
}) => {
  const originalSharePostId = 't3_sharepost';
  const replacementSharePostId = 't3_sharepost_new';

  mocks.reddit.linksAndComments.addPost({
    id: originalSharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  mocks.reddit.linksAndComments.addPost({
    id: replacementSharePostId,
    title: "Storm Lab (testuser's realm)",
  });

  const originalSharePost = await reddit.getPostById(originalSharePostId);
  const replacementSharePost = await reddit.getPostById(replacementSharePostId);

  vi.spyOn(originalSharePost, 'delete').mockResolvedValue(undefined);
  vi.spyOn(replacementSharePost, 'delete').mockResolvedValue(undefined);
  vi.spyOn(originalSharePost, 'setPostData').mockRejectedValue(
    new Error('cannot edit old share post')
  );
  vi.spyOn(originalSharePost, 'setTextFallback').mockResolvedValue(undefined);
  const submitCustomPostSpy = vi
    .spyOn(reddit, 'submitCustomPost')
    .mockResolvedValueOnce(originalSharePost)
    .mockResolvedValueOnce(replacementSharePost);

  vi.spyOn(reddit, 'getPostById').mockImplementation(async (postId) => {
    if (postId === originalSharePostId) {
      return originalSharePost;
    }

    if (postId === replacementSharePostId) {
      return replacementSharePost;
    }

    throw new Error(`Unexpected post lookup: ${postId}`);
  });

  const saved = await saveStormLabDraft(
    userId,
    username,
    'Build storms from a compact recipe tree.'
  );

  const firstPublish = await publishDraftForUser(userId, saved.id);
  expect(firstPublish.mod.sharePostId).toBe(originalSharePostId);

  await saveStormLabDraft(
    userId,
    username,
    'Build storms from an expanded recipe tree.',
    saved.id
  );

  const republished = await publishDraftForUser(userId, saved.id);
  expect(republished.mod.sharePostId).toBe(replacementSharePostId);
  expect(republished.sharePost.id).toBe(replacementSharePostId);
  expect(submitCustomPostSpy).toHaveBeenCalledTimes(2);

  const mineAfterRepublish = await listModsForUser(userId);
  const modAfterRepublish = mineAfterRepublish.find((mod) => mod.id === saved.id);
  expect(modAfterRepublish?.sharePostId).toBe(replacementSharePostId);
});
