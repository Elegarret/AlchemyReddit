import { reddit, settings } from '@devvit/web/server';

export const createPost = async () => {
	const postTitle = (await settings.get<string>('postTitle')) || 'Alchemy - combine elements to discover all of them 🔥💧🦖💩';
	return await reddit.submitCustomPost({
		title: postTitle,
	});
};

export const createCatalogPost = async () => {
	return await reddit.submitCustomPost({
		title: 'Alchemy Mods Catalog',
		entry: 'mod-catalog',
	});
};
