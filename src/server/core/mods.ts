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

const serializeListItem = (
  mod: ModDoc,
  versionState?: {
    hasDraftVersion?: boolean;
    hasPublishedVersion?: boolean;
  }
): ModListItem => ({
  id: mod.id,
  title: mod.title,
  summary: mod.summary,
  ownerUsername: mod.ownerUsername,
  updatedAt: mod.updatedAt,
  publishedAt: mod.publishedAt,
  publishedHash: mod.publishedHash,
  sharePostId: mod.sharePostId,
  status: mod.status,
  hasDraftVersion: versionState?.hasDraftVersion ?? mod.status === 'draft',
  hasPublishedVersion:
    versionState?.hasPublishedVersion ?? mod.status === 'published',
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

const stripPublishedFields = (mod: ModDoc): ModDoc => {
  const { publishedAt, publishedHash, sharePostId, ...draftState } = mod;
  return draftState;
};

const buildSharePostTitle = (mod: Pick<ModDoc, 'title' | 'ownerUsername'>) =>
  `${mod.title} (${mod.ownerUsername}'s realm)`;

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
    entries.map(async ({ member }) => {
      const meta = parseListItem(await redis.get(getMetaKey(member)));
      if (meta?.status === 'published') {
        return meta;
      }

      const latest = await loadLatestMod(member);
      return latest?.status === 'published' ? serializeListItem(latest) : null;
    })
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
      const latest = await loadLatestMod(member);

      if (draft && latest?.status === 'published') {
        return serializeListItem({
          ...draft,
          status: 'published',
          publishedAt: latest.publishedAt,
          publishedHash: latest.publishedHash,
          sharePostId: latest.sharePostId,
        }, {
          hasDraftVersion: true,
          hasPublishedVersion: true,
        });
      }

      if (draft) {
        return serializeListItem(draft, {
          hasDraftVersion: true,
          hasPublishedVersion: false,
        });
      }

      return latest
        ? serializeListItem(latest, {
            hasDraftVersion: false,
            hasPublishedVersion: latest.status === 'published',
          })
        : null;
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
    intro: input.intro.trim(),
    ownerUserId: userId,
    ownerUsername: username,
    startingElementIds: input.startingElementIds,
    counters: input.counters,
    showPalette: input.showPalette,
    elements: input.elements,
    reactions: input.reactions,
    status: 'draft',
    updatedAt,
  };

  await redis.set(getDraftKey(userId, modId), JSON.stringify(draft));
  await saveMeta(
    existingPublished?.status === 'published' ? existingPublished : draft
  );
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
    intro: draft.intro,
    startingElementIds: draft.startingElementIds,
    counters: draft.counters,
    showPalette: draft.showPalette,
    elements: draft.elements,
    reactions: draft.reactions,
  });

  if (!validation.isValid) {
    throw new Error(
      validation.errors[0] ??
        validation.scriptErrors[0] ??
        'Draft validation failed.'
    );
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
  const sharePost = await createSharePostForMod(userId, modId);
  return {
    mod: parseMod(await redis.get(getLatestKey(modId))) ?? published,
    sharePost,
  };
};

export const isCurrentUserModerator = async (username: string | undefined) => {
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

const removeSharePostIfPossible = async (sharePostId: string | undefined) => {
  if (!sharePostId) {
    return;
  }

  try {
    const sharePost = await reddit.getPostById(sharePostId as `t3_${string}`);
    await sharePost.delete();
  } catch (deleteError) {
    try {
      await reddit.remove(sharePostId as `t3_${string}`, false);
    } catch (removeError) {
      console.warn('Failed to remove published share post', removeError);
      console.warn('Delete attempt failed first', deleteError);
    }
  }
};

export const removeModForUser = async (userId: string, modId: string) => {
  const draft = parseMod(await redis.get(getDraftKey(userId, modId)));
  const latest = await loadLatestMod(modId);
  const target = draft ?? latest;

  if (!target) {
    throw new Error('Mod not found.');
  }

  ensureModOwnership(target, userId);
  await removeSharePostIfPossible(target.sharePostId);

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

  if (latest.sharePostId) {
    return {
      id: latest.sharePostId,
      url: getPostUrl(latest.sharePostId, context.subredditName),
    };
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
    title: buildSharePostTitle(latest),
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

export const unpublishModForUser = async (userId: string, modId: string) => {
  const draft = parseMod(await redis.get(getDraftKey(userId, modId)));
  const latest = await loadLatestMod(modId);
  const source = latest ?? draft;

  if (!source) {
    throw new Error('Mod not found.');
  }

  ensureModOwnership(source, userId);

  await removeSharePostIfPossible(latest?.sharePostId ?? draft?.sharePostId);

  const now = new Date().toISOString();
  const unpublished: ModDoc = {
    ...stripPublishedFields({
      ...(draft ?? latest ?? source),
      status: 'draft',
      updatedAt: now,
    }),
    status: 'draft',
    updatedAt: now,
  };

  await redis.set(getLatestKey(modId), JSON.stringify(unpublished));
  await redis.set(getDraftKey(userId, modId), JSON.stringify(unpublished));
  await saveMeta(unpublished);
  await indexModForOwner(unpublished);
  await redis.zRem(catalogKey, [modId]);

  return unpublished;
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
