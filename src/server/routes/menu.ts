import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import {
  createCatalogPost,
  createCompactCatalogPost,
  createFeaturedCompactCatalogPost,
  createPost,
} from '../core/post';

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

menu.post('/catalog-compact-create', async (c) => {
  try {
    const post = await createCompactCatalogPost();

    return c.json<UiResponse>(
      {
        navigateTo: post.url,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating compact catalog post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create compact catalog post',
      },
      400
    );
  }
});

menu.post('/catalog-compact-featured-create', async (c) => {
  try {
    const post = await createFeaturedCompactCatalogPost();

    return c.json<UiResponse>(
      {
        navigateTo: post.url,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating featured compact catalog post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create featured compact catalog post',
      },
      400
    );
  }
});
