import { context, reddit, redis } from '@devvit/web/server';
import {
  buildRulesetFromMod,
  createModFingerprint,
  createModId,
  createSlug,
  validateModDraft,
} from '../../modding/runtime';
import {
  type AdminModListItem,
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
const allModsKey = 'mods:all';

const getLatestKey = (modId: string) => `mod:${modId}:latest`;
const getMetaKey = (modId: string) => `mod:${modId}:meta`;
const getDraftKey = (userId: string, modId: string) =>
  `mod:${modId}:draft:${userId}`;
const getDraftOwnersKey = (modId: string) => `mod:${modId}:draft-owners`;
const getOwnerKey = (userId: string) => `mods:owner:${userId}`;
const getPlayerKey = (modId: string) => `mod:${modId}:players`;
const normalizeRedditPostId = (postId: string) =>
  postId.startsWith('t3_') ? postId : `t3_${postId}`;
const getUpdatedAtScore = (updatedAt: string) => -(Date.parse(updatedAt) || Date.now());

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
  await redis.zAdd(getOwnerKey(mod.ownerUserId), {
    member: mod.id,
    score: getUpdatedAtScore(mod.updatedAt),
  });
};

const indexPublishedMod = async (mod: ModDoc) => {
  await redis.zAdd(catalogKey, {
    member: mod.id,
    score: getUpdatedAtScore(mod.updatedAt),
  });
};

const indexModGlobally = async (mod: Pick<ModDoc, 'id' | 'updatedAt'>) => {
  await redis.zAdd(allModsKey, {
    member: mod.id,
    score: getUpdatedAtScore(mod.updatedAt),
  });
};

const indexDraftOwnerForMod = async (
  mod: Pick<ModDoc, 'id' | 'ownerUserId' | 'updatedAt'>
) => {
  await redis.zAdd(getDraftOwnersKey(mod.id), {
    member: mod.ownerUserId,
    score: getUpdatedAtScore(mod.updatedAt),
  });
};

const loadLatestMod = async (modId: string) =>
  parseMod(await redis.get(getLatestKey(modId)));

const loadMostRecentDraftForMod = async (modId: string) => {
  const ownerEntries = await redis.zRange(getDraftOwnersKey(modId), 0, 9);
  for (const { member } of ownerEntries) {
    const draft = parseMod(await redis.get(getDraftKey(member, modId)));
    if (draft) {
      return draft;
    }

    await redis.zRem(getDraftOwnersKey(modId), [member]);
  }

  return null;
};

const stripPublishedFields = (mod: ModDoc): ModDoc => {
  const { publishedAt, publishedHash, sharePostId, ...draftState } = mod;
  return draftState;
};

const buildSharePostTitle = (mod: Pick<ModDoc, 'title' | 'ownerUsername'>) =>
  `${mod.title} (${mod.ownerUsername}'s realm)`;

const buildSharePostBody = (mod: Pick<ModDoc, 'summary' | 'title'>) =>
  mod.summary || mod.title;

const takeModOwnership = (
  mod: ModDoc,
  userId: string,
  username: string
): ModDoc => ({
  ...mod,
  ownerUserId: userId,
  ownerUsername: username,
});

const persistPublishedSharePostId = async (
  userId: string,
  mod: ModDoc,
  sharePostId: string
) => {
  const normalizedSharePostId = normalizeRedditPostId(sharePostId);
  if (mod.sharePostId === normalizedSharePostId) {
    return normalizedSharePostId;
  }

  mod.sharePostId = normalizedSharePostId;
  await redis.set(getLatestKey(mod.id), JSON.stringify(mod));
  await redis.set(
    getDraftKey(userId, mod.id),
    JSON.stringify({ ...mod, status: 'draft' })
  );
  await saveMeta(mod);

  return normalizedSharePostId;
};

const getModUpvotes = async (item: Pick<ModListItem, 'sharePostId'>) => {
  if (!item.sharePostId) {
    return 0;
  }

  try {
    const redditPost = await reddit.getPostById(
      normalizeRedditPostId(item.sharePostId) as `t3_${string}`
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

const enrichAdminListItem = async (
  item: AdminModListItem
): Promise<AdminModListItem> => {
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

export const listAllAdminMods = async (): Promise<AdminModListItem[]> => {
  const [allEntries, catalogEntries] = await Promise.all([
    redis.zRange(allModsKey, 0, 199),
    redis.zRange(catalogKey, 0, 199),
  ]);
  const modIds = Array.from(
    new Set(
      [...allEntries, ...catalogEntries].map(({ member }) => member)
    )
  );
  const items = await Promise.all(
    modIds.map(async (modId) => {
      const [latest, draft] = await Promise.all([
        loadLatestMod(modId),
        loadMostRecentDraftForMod(modId),
      ]);
      const source = draft ?? latest;

      if (!source) {
        return null;
      }

      return {
        ...serializeListItem(source, {
          hasDraftVersion: draft !== null,
          hasPublishedVersion: latest?.status === 'published',
        }),
        ...(draft
          ? {
              draftOwnerUsername: draft.ownerUsername,
              draftUpdatedAt: draft.updatedAt,
            }
          : {}),
        latestVersionStatus: latest?.status ?? null,
      };
    })
  );

  return await Promise.all(
    items
      .filter((item): item is AdminModListItem => item !== null)
      .map(enrichAdminListItem)
  );
};

export const getEditableModForUser = async (
  userId: string,
  username: string | undefined,
  modId: string
) => {
  const draft = parseMod(await redis.get(getDraftKey(userId, modId)));
  if (draft) {
    return draft;
  }

  const latest = await loadLatestMod(modId);
  if (!latest) {
    return null;
  }

  await assertCanManageMod(latest, userId, username);
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
    await assertCanManageMod(existingPublished, userId, username);
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
    reactionComments: input.reactionComments,
    status: 'draft',
    updatedAt,
  };

  await redis.set(getDraftKey(userId, modId), JSON.stringify(draft));
  await saveMeta(
    existingPublished?.status === 'published' ? existingPublished : draft
  );
  await indexModForOwner(draft);
  await indexModGlobally(draft);
  await indexDraftOwnerForMod(draft);
  return draft;
};

export const publishDraftForUser = async (userId: string, modId: string) => {
  const draft = parseMod(await redis.get(getDraftKey(userId, modId)));
  if (!draft) {
    throw new Error('Draft not found.');
  }
  const existingPublished = await loadLatestMod(modId);

  await assertCanManageMod(draft, userId, draft.ownerUsername);
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

  if (!validation.isValid || validation.warnings.length > 0) {
    throw new Error(
      validation.errors[0] ??
        validation.scriptErrors[0] ??
        validation.warnings[0] ??
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
    ...(existingPublished?.status === 'published' && existingPublished.sharePostId
      ? { sharePostId: existingPublished.sharePostId }
      : {}),
  };

  await redis.set(getLatestKey(modId), JSON.stringify(published));
  await redis.set(
    getDraftKey(userId, modId),
    JSON.stringify({ ...published, status: 'draft' })
  );
  await saveMeta(published);
  await indexModForOwner(published);
  await indexModGlobally(published);
  await indexDraftOwnerForMod(published);
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

const canManageMod = async (
  mod: ModDoc,
  userId: string,
  username: string | undefined
) => mod.ownerUserId === userId || (await isCurrentUserModerator(username));

const assertCanManageMod = async (
  mod: ModDoc,
  userId: string,
  username: string | undefined
) => {
  if (await canManageMod(mod, userId, username)) {
    return;
  }

  throw new Error('You do not own this mod.');
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

  if (!(await canManageMod(latest, userId, username))) {
    throw new Error('You are not allowed to hide this mod.');
  }

  const hidden: ModDoc = {
    ...latest,
    status: 'hidden',
    updatedAt: new Date().toISOString(),
  };

  await redis.set(getLatestKey(modId), JSON.stringify(hidden));
  await redis.set(getMetaKey(modId), JSON.stringify(serializeListItem(hidden)));
  await indexModGlobally(hidden);
  await redis.zRem(catalogKey, [modId]);
  return hidden;
};

const removeSharePostIfPossible = async (sharePostId: string | undefined) => {
  if (!sharePostId) {
    return;
  }

  const normalizedSharePostId = normalizeRedditPostId(sharePostId);

  try {
    const sharePost = await reddit.getPostById(
      normalizedSharePostId as `t3_${string}`
    );
    await sharePost.delete();
  } catch (deleteError) {
    try {
      await reddit.remove(normalizedSharePostId as `t3_${string}`, false);
    } catch (removeError) {
      console.warn('Failed to remove published share post', removeError);
      console.warn('Delete attempt failed first', deleteError);
    }
  }
};

export const removeModForUser = async (
  userId: string,
  username: string | undefined,
  modId: string
) => {
  const draft = parseMod(await redis.get(getDraftKey(userId, modId)));
  const latest = await loadLatestMod(modId);
  const target = draft ?? latest;

  if (!target) {
    throw new Error('Mod not found.');
  }

  await assertCanManageMod(target, userId, username);
  await removeSharePostIfPossible(target.sharePostId);

  const ownerIds = new Set(
    [draft?.ownerUserId, latest?.ownerUserId, userId].filter(
      (candidate): candidate is string => Boolean(candidate)
    )
  );

  await redis.del(
    getDraftKey(userId, modId),
    ...Array.from(ownerIds)
      .filter((ownerId) => ownerId !== userId)
      .map((ownerId) => getDraftKey(ownerId, modId)),
    getLatestKey(modId),
    getMetaKey(modId),
    getPlayerKey(modId),
    getDraftOwnersKey(modId)
  );
  await Promise.all(
    Array.from(ownerIds).map(async (ownerId) =>
      await redis.zRem(getOwnerKey(ownerId), [modId])
    )
  );
  await redis.zRem(catalogKey, [modId]);
  await redis.zRem(allModsKey, [modId]);

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
    const normalizedSharePostId = normalizeRedditPostId(latest.sharePostId);
    await persistPublishedSharePostId(userId, latest, normalizedSharePostId);
    return {
      id: normalizedSharePostId,
      url: getPostUrl(normalizedSharePostId, context.subredditName),
    };
  }

  const postData: SharePostData = {
    modId: latest.id,
    title: latest.title,
    slug: createSlug(latest.title),
    publishedHash: latest.publishedHash,
  };
  const parsedPostData = sharePostDataSchema.parse(postData);
  const bodyText = buildSharePostBody(latest);

  const post = await reddit.submitCustomPost({
    title: buildSharePostTitle(latest),
    entry: 'mod-splash',
    postData: parsedPostData,
    runAs: 'USER',
    userGeneratedContent: {
      text: bodyText,
    },
    textFallback: {
      text: bodyText,
    },
  });

  const normalizedSharePostId = await persistPublishedSharePostId(
    userId,
    latest,
    post.id
  );

  return {
    id: normalizedSharePostId,
    url: getPostUrl(normalizedSharePostId, context.subredditName),
  };
};

export const unpublishModForUser = async (
  userId: string,
  username: string | undefined,
  modId: string
) => {
  const draft = parseMod(await redis.get(getDraftKey(userId, modId)));
  const latest = await loadLatestMod(modId);
  const source = latest ?? draft;

  if (!source) {
    throw new Error('Mod not found.');
  }

  await assertCanManageMod(source, userId, username);

  await removeSharePostIfPossible(latest?.sharePostId ?? draft?.sharePostId);

  const now = new Date().toISOString();
  const unpublished: ModDoc = {
    ...stripPublishedFields({
      ...takeModOwnership(draft ?? latest ?? source, userId, username ?? 'unknown'),
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
  await indexModGlobally(unpublished);
  await indexDraftOwnerForMod(unpublished);
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
