import { expect, vi } from 'vitest';
import { reddit } from '@devvit/web/server';
import { test } from '../test';
import type { ModElement } from '../../modding/types';
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
});

test('publishing creates a share post and unpublishing returns the mod to drafts', async ({
  userId,
  username,
  mocks,
}) => {
  const sharePostId = 't3_sharepost';
  mocks.reddit.linksAndComments.addPost({
    id: sharePostId,
    title: "Storm Lab (testuser's realm)",
  });
  const sharePost = await reddit.getPostById(sharePostId);
  vi.spyOn(sharePost, 'delete').mockResolvedValue(undefined);
  vi.spyOn(reddit, 'getPostById').mockImplementation(async (postId) => {
    if (postId === sharePostId) {
      return sharePost;
    }

    throw new Error(`Unexpected post lookup: ${postId}`);
  });
  vi.spyOn(reddit, 'submitCustomPost').mockResolvedValue(sharePost);

  const saved = await saveDraftForUser(userId, username, {
    title: 'Storm Lab',
    summary: 'Build storms from a compact recipe tree.',
    intro: 'Welcome to the storm lab.',
    startingElementIds: ['air', 'water'],
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

  const published = await publishDraftForUser(userId, saved.id);
  expect(published.mod.status).toBe('published');
  expect(published.mod.sharePostId).toBe(sharePostId);
  expect(published.sharePost.url).toContain('/comments/');

  const mineAfterPublish = await listModsForUser(userId);
  const modAfterPublish = mineAfterPublish.find((mod) => mod.id === saved.id);
  expect(modAfterPublish?.status).toBe('published');
  expect(modAfterPublish?.sharePostId).toBe(sharePostId);

  const catalogAfterPublish = await listCatalogMods();
  expect(catalogAfterPublish.map((mod) => mod.id)).toContain(saved.id);

  await saveDraftForUser(userId, username, {
    id: saved.id,
    title: 'Storm Lab',
    summary: 'Build storms from a compact recipe tree.',
    intro: 'Welcome to the storm lab.',
    startingElementIds: ['air', 'water'],
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
