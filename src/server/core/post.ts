import { context, reddit, settings } from '@devvit/web/server';

export const getPostUrl = (postId: string, subredditName?: string) => {
  const normalizedPostId = postId.replace(/^t3_/, '');
  if (subredditName) {
    return `https://www.reddit.com/r/${subredditName}/comments/${normalizedPostId}/`;
  }

  return `https://www.reddit.com/comments/${normalizedPostId}/`;
};

export const createPost = async () => {
  const postTitle =
    (await settings.get<string>('postTitle')) ||
    'Alchemy - combine elements to discover all of them 🔥💧🦖💩';
  const post = await reddit.submitCustomPost({
    title: postTitle,
    entry: 'default',
  });

  return {
    ...post,
    url: getPostUrl(post.id, context.subredditName),
  };
};

export const createCatalogPost = async () => {
  const postTitle =
    (await settings.get<string>('catalogPostTitle')) || 'Alchemy Hub';
  const post = await reddit.submitCustomPost({
    title: postTitle,
    entry: 'mod-catalog',
  });

  return {
    ...post,
    url: getPostUrl(post.id, context.subredditName),
  };
};

export const createCompactCatalogPost = async () => {
  const postTitle =
    (await settings.get<string>('compactCatalogPostTitle')) ||
    'Alchemic Creations';
  const post = await reddit.submitCustomPost({
    title: postTitle,
    entry: 'mod-catalog-compact',
  });

  return {
    ...post,
    url: getPostUrl(post.id, context.subredditName),
  };
};

export const createFeaturedCompactCatalogPost = async () => {
  const postTitle =
    (await settings.get<string>('compactCatalogPostTitle')) ||
    'Alchemic Creations';
  const post = await reddit.submitCustomPost({
    title: postTitle,
    entry: 'mod-catalog-compact-featured',
  });

  return {
    ...post,
    url: getPostUrl(post.id, context.subredditName),
  };
};
