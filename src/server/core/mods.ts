import { context, reddit, redis } from '@devvit/web/server';
import {
  buildRulesetFromMod,
  createModFingerprint,
  createModId,
  createSlug,
  validateModDraft,
} from '../../modding/runtime';
import {
  modDocSchema,
  modListItemSchema,
  saveDraftInputSchema,
  sharePostDataSchema,
  type ActiveRuleset,
  type ModDoc,
  type ModListItem,
  type SaveDraftInput,
  type SharePostData,
  type ValidationResult,
} from '../../modding/types';
import { getPostUrl } from './post';

const catalogKey = 'mods:catalog';

const getLatestKey = (modId: string) => `mod:${modId}:latest`;
const getMetaKey = (modId: string) => `mod:${modId}:meta`;
const getDraftKey = (userId: string, modId: string) =>
  `mod:${modId}:draft:${userId}`;
const getOwnerKey = (userId: string) => `mods:owner:${userId}`;
const getPlayerKey = (modId: string) => `mod:${modId}:players`;

const parseMod = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = modDocSchema.safeParse(JSON.parse(value));
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const parseListItem = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = modListItemSchema.safeParse(JSON.parse(value));
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const serializeListItem = (mod: ModDoc): ModListItem => ({
  id: mod.id,
  title: mod.title,
  summary: mod.summary,
  ownerUsername: mod.ownerUsername,
  updatedAt: mod.updatedAt,
  publishedAt: mod.publishedAt,
  publishedHash: mod.publishedHash,
  sharePostId: mod.sharePostId,
  status: mod.status,
  elementCount: mod.elements.length,
  reactionCount: mod.reactions.length,
});

const saveMeta = async (mod: ModDoc) => {
  await redis.set(getMetaKey(mod.id), JSON.stringify(serializeListItem(mod)));
};

const indexModForOwner = async (mod: ModDoc) => {
  const updatedAt = Date.parse(mod.updatedAt) || Date.now();
  await redis.zAdd(getOwnerKey(mod.ownerUserId), {
    member: mod.id,
    score: -updatedAt,
  });
};

const indexPublishedMod = async (mod: ModDoc) => {
  const updatedAt = Date.parse(mod.updatedAt) || Date.now();
  await redis.zAdd(catalogKey, { member: mod.id, score: -updatedAt });
};

const loadLatestMod = async (modId: string) =>
  parseMod(await redis.get(getLatestKey(modId)));

const ensureModOwnership = (mod: ModDoc, userId: string) => {
  if (mod.ownerUserId !== userId) {
    throw new Error('You do not own this mod.');
  }
};

const getModUpvotes = async (item: Pick<ModListItem, 'sharePostId'>) => {
  if (!item.sharePostId) {
    return 0;
  }

  try {
    const redditPost = await reddit.getPostById(
      item.sharePostId as `t3_${string}`
    );
    return redditPost.score;
  } catch (e) {
    return 0;
  }
};

export const getModPlayerCount = async (modId: string) =>
  await redis.zCard(getPlayerKey(modId));

export const recordUniqueModPlayer = async (modId: string, userId: string) => {
  await redis.zAdd(getPlayerKey(modId), { member: userId, score: 0 });
};

const enrichListItem = async (item: ModListItem): Promise<ModListItem> => {
  const [upvotes, playerCount] = await Promise.all([
    getModUpvotes(item),
    getModPlayerCount(item.id),
  ]);

  return {
    ...item,
    upvotes,
    playerCount,
  };
};

export const listCatalogMods = async () => {
  const entries = await redis.zRange(catalogKey, 0, 99);
  const items = await Promise.all(
    entries.map(async ({ member }) =>
      parseListItem(await redis.get(getMetaKey(member)))
    )
  );
  const publishedItems = items.filter(
    (item): item is ModListItem => item !== null && item.status === 'published'
  );

  try {
    return await Promise.all(publishedItems.map(enrichListItem));
  } catch (e) {
    console.error('Failed to fetch catalog metadata', e);
    return publishedItems;
  }
};

export const listModsForUser = async (userId: string) => {
  const entries = await redis.zRange(getOwnerKey(userId), 0, 99);
  const items = await Promise.all(
    entries.map(async ({ member }) => {
      const draft = parseMod(await redis.get(getDraftKey(userId, member)));
      if (draft) {
        return serializeListItem(draft);
      }

      const latest = await loadLatestMod(member);
      return latest ? serializeListItem(latest) : null;
    })
  );

  return await Promise.all(
    items
      .filter((item): item is ModListItem => item !== null)
      .map(enrichListItem)
  );
};

export const getEditableModForUser = async (userId: string, modId: string) => {
  const draft = parseMod(await redis.get(getDraftKey(userId, modId)));
  if (draft) {
    return draft;
  }

  const latest = await loadLatestMod(modId);
  if (!latest) {
    return null;
  }

  ensureModOwnership(latest, userId);
  return {
    ...latest,
    status: 'draft',
  };
};

export const getPublishedMod = async (modId: string) => {
  const latest = await loadLatestMod(modId);
  if (!latest || latest.status !== 'published') {
    return null;
  }
  return latest;
};

export const getPublishedModListItem = async (modId: string) => {
  const latest = await getPublishedMod(modId);
  if (!latest) {
    return null;
  }

  return await enrichListItem(serializeListItem(latest));
};

export const validateDraftInput = (input: SaveDraftInput): ValidationResult =>
  validateModDraft(input);

export const saveDraftForUser = async (
  userId: string,
  username: string,
  rawInput: SaveDraftInput
) => {
  const input = saveDraftInputSchema.parse(rawInput);
  const existingPublished = input.id ? await loadLatestMod(input.id) : null;
  if (existingPublished) {
    ensureModOwnership(existingPublished, userId);
  }

  const modId = input.id ?? createModId();
  const updatedAt = new Date().toISOString();
  const draft: ModDoc = {
    id: modId,
    title: input.title.trim(),
    summary: input.summary.trim(),
    ownerUserId: userId,
    ownerUsername: username,
    startingElementIds: input.startingElementIds,
    elements: input.elements,
    reactions: input.reactions,
    status: 'draft',
    updatedAt,
  };

  await redis.set(getDraftKey(userId, modId), JSON.stringify(draft));
  await saveMeta(draft);
  await indexModForOwner(draft);
  return draft;
};

export const publishDraftForUser = async (userId: string, modId: string) => {
  const draft = parseMod(await redis.get(getDraftKey(userId, modId)));
  if (!draft) {
    throw new Error('Draft not found.');
  }

  ensureModOwnership(draft, userId);
  const validation = validateDraftInput({
    id: draft.id,
    title: draft.title,
    summary: draft.summary,
    startingElementIds: draft.startingElementIds,
    elements: draft.elements,
    reactions: draft.reactions,
  });

  if (!validation.isValid) {
    throw new Error(validation.errors[0] ?? 'Draft validation failed.');
  }

  const publishedAt = new Date().toISOString();
  const published: ModDoc = {
    ...draft,
    status: 'published',
    updatedAt: publishedAt,
    publishedAt,
    publishedHash: createModFingerprint(draft),
  };

  await redis.set(getLatestKey(modId), JSON.stringify(published));
  await redis.set(
    getDraftKey(userId, modId),
    JSON.stringify({ ...published, status: 'draft' })
  );
  await saveMeta(published);
  await indexModForOwner(published);
  await indexPublishedMod(published);
  return published;
};

const isCurrentUserModerator = async (username: string | undefined) => {
  if (!username || !context.subredditName) {
    return false;
  }

  const moderators = await reddit.getModerators({
    subredditName: context.subredditName,
    username,
    limit: 1,
  });

  return (await moderators.all()).length > 0;
};

export const hidePublishedMod = async (
  userId: string,
  username: string | undefined,
  modId: string
) => {
  const latest = await loadLatestMod(modId);
  if (!latest) {
    throw new Error('Mod not found.');
  }

  if (
    latest.ownerUserId !== userId &&
    !(await isCurrentUserModerator(username))
  ) {
    throw new Error('You are not allowed to hide this mod.');
  }

  const hidden: ModDoc = {
    ...latest,
    status: 'hidden',
    updatedAt: new Date().toISOString(),
  };

  await redis.set(getLatestKey(modId), JSON.stringify(hidden));
  await redis.set(getMetaKey(modId), JSON.stringify(serializeListItem(hidden)));
  await redis.zRem(catalogKey, [modId]);
  return hidden;
};

export const removeModForUser = async (userId: string, modId: string) => {
  const draft = parseMod(await redis.get(getDraftKey(userId, modId)));
  const latest = await loadLatestMod(modId);
  const target = draft ?? latest;

  if (!target) {
    throw new Error('Mod not found.');
  }

  ensureModOwnership(target, userId);

  await redis.del(
    getDraftKey(userId, modId),
    getLatestKey(modId),
    getMetaKey(modId),
    getPlayerKey(modId)
  );
  await redis.zRem(getOwnerKey(userId), [modId]);
  await redis.zRem(catalogKey, [modId]);

  return { success: true };
};

export const createSharePostForMod = async (userId: string, modId: string) => {
  const latest = await loadLatestMod(modId);
  if (!latest || latest.status !== 'published') {
    throw new Error('Publish the mod before sharing it.');
  }

  if (!userId) {
    throw new Error('You must be logged in to share a mod.');
  }

  const slug = createSlug(latest.title);
  const postData: SharePostData = {
    modId: latest.id,
    title: latest.title,
    slug,
    publishedHash: latest.publishedHash,
  };
  const parsedPostData = sharePostDataSchema.parse(postData);
  const post = await reddit.submitCustomPost({
    title: `${latest.title} [Alchemy Mod]`,
    entry: 'mod-splash',
    postData: parsedPostData,
    runAs: 'USER',
    userGeneratedContent: {
      text: latest.summary || latest.title,
    },
    textFallback: {
      text: `${latest.title}\n\n${latest.summary}`,
    },
  });

  latest.sharePostId = post.id;
  await redis.set(getLatestKey(modId), JSON.stringify(latest));
  await redis.set(
    getDraftKey(userId, modId),
    JSON.stringify({ ...latest, status: 'draft' })
  );
  await saveMeta(latest);

  return {
    id: post.id,
    url: getPostUrl(post.id, context.subredditName),
  };
};

export const resolveRulesetForModId = async (
  modId: string
): Promise<{
  ruleset: ActiveRuleset | null;
  progressScope: string;
  unavailableReason?: string;
  modId?: string;
}> => {
  const latest = await loadLatestMod(modId);
  if (!latest || latest.status !== 'published') {
    return {
      ruleset: null,
      progressScope: 'base',
      unavailableReason: 'This mod is unavailable or has been removed.',
    };
  }

  const ruleset = buildRulesetFromMod(latest);
  return {
    ruleset,
    progressScope: ruleset.storageScope,
    modId: latest.id,
  };
};

export const resolveRulesetFromPostData = async (): Promise<{
  ruleset: ActiveRuleset | null;
  progressScope: string;
  unavailableReason?: string;
  sharePost?: SharePostData;
  modId?: string;
}> => {
  const parsed = sharePostDataSchema.safeParse(context.postData);
  if (!parsed.success) {
    return {
      ruleset: null,
      progressScope: 'base',
    };
  }

  const latest = await loadLatestMod(parsed.data.modId);
  if (!latest || latest.status !== 'published') {
    return {
      ruleset: null,
      progressScope: 'base',
      unavailableReason:
        'This mod is unavailable in this subreddit installation.',
      sharePost: parsed.data,
    };
  }

  const ruleset = buildRulesetFromMod(latest);
  return {
    ruleset,
    progressScope: ruleset.storageScope,
    sharePost: parsed.data,
    modId: latest.id,
  };
};
