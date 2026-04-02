import { expect, vi } from 'vitest';
import { reddit, settings } from '@devvit/web/server';
import { test } from '../test';
import { createCatalogPost, createPost, getPostUrl } from './post';

test('getPostUrl normalizes bare and prefixed post ids', () => {
  expect(getPostUrl('t3_abc123', 'alchemygame')).toBe(
    'https://www.reddit.com/r/alchemygame/comments/abc123/'
  );
  expect(getPostUrl('abc123')).toBe('https://www.reddit.com/comments/abc123/');
});

test('createPost submits the default Devvit Web entrypoint', async () => {
  vi.spyOn(settings, 'get').mockResolvedValue('Play Alchemy Game');
  const submitCustomPostSpy = vi
    .spyOn(reddit, 'submitCustomPost')
    .mockResolvedValue({
      id: 't3_defaultpost',
      title: 'Play Alchemy Game',
    } as never);

  const post = await createPost();

  expect(submitCustomPostSpy).toHaveBeenCalledWith({
    title: 'Play Alchemy Game',
    entry: 'default',
  });
  expect(post.url).toBe('https://www.reddit.com/r/testsub/comments/defaultpost/');
});

test('createCatalogPost submits the catalog entrypoint', async () => {
  const submitCustomPostSpy = vi
    .spyOn(reddit, 'submitCustomPost')
    .mockResolvedValue({
      id: 't3_catalogpost',
      title: 'Alchemy Mods Catalog',
    } as never);

  const post = await createCatalogPost();

  expect(submitCustomPostSpy).toHaveBeenCalledWith({
    title: 'Alchemy Mods Catalog',
    entry: 'mod-catalog',
  });
  expect(post.url).toBe('https://www.reddit.com/r/testsub/comments/catalogpost/');
});
