import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { createCatalogPost, createPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: post.url,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

menu.post('/catalog-create', async (c) => {
  try {
    const post = await createCatalogPost();

    return c.json<UiResponse>(
      {
        navigateTo: post.url,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating catalog post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create catalog post',
      },
      400
    );
  }
});
