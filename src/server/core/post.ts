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
  });

  return {
    ...post,
    url: getPostUrl(post.id, context.subredditName),
  };
};

export const createCatalogPost = async () => {
  const post = await reddit.submitCustomPost({
    title: 'Alchemy Mods Catalog',
    entry: 'mod-catalog',
  });

  return {
    ...post,
    url: getPostUrl(post.id, context.subredditName),
  };
};
