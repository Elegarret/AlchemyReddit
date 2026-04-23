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

const removeDraftOwnerForMod = async (modId: string, ownerUserId: string) => {
  await redis.del(getDraftKey(ownerUserId, modId));
  await redis.zRem(getDraftOwnersKey(modId), [ownerUserId]);
  await redis.zRem(getOwnerKey(ownerUserId), [modId]);
};

const cleanupStaleDraftsForMod = async (
  modId: string,
  currentOwnerUserId: string
) => {
  const ownerEntries = await redis.zRange(getDraftOwnersKey(modId), 0, 999);
  await Promise.all(
    ownerEntries.map(async ({ member }) => {
      const draft = parseMod(await redis.get(getDraftKey(member, modId)));
      if (member !== currentOwnerUserId) {
        await removeDraftOwnerForMod(modId, member);
        return;
      }

      if (!draft) {
        await redis.zRem(getDraftOwnersKey(modId), [member]);
        await redis.zRem(getOwnerKey(member), [modId]);
      }
    })
  );
};

const loadCanonicalDraftForUnpublishedMod = async (modId: string) => {
  const ownerEntries = await redis.zRange(getDraftOwnersKey(modId), 0, 999);
  const drafts: ModDoc[] = [];
  for (const { member } of ownerEntries) {
    const draft = parseMod(await redis.get(getDraftKey(member, modId)));
    if (draft) {
      drafts.push(draft);
      continue;
    }

    await removeDraftOwnerForMod(modId, member);
  }

  const draft = drafts[drafts.length - 1] ?? null;
  if (draft) {
    await cleanupStaleDraftsForMod(modId, draft.ownerUserId);
  }

  return draft;
};

const stripPublishedFields = (mod: ModDoc): ModDoc => {
  const { publishedAt, publishedHash, sharePostId, ...draftState } = mod;
  return draftState;
};

const buildSharePostTitle = (mod: Pick<ModDoc, 'title' | 'ownerUsername'>) =>
  `${mod.title} (${mod.ownerUsername}'s realm)`;

const buildSharePostBody = (mod: Pick<ModDoc, 'summary' | 'title'>) =>
  mod.summary || mod.title;

const getAuthorDraftForMod = async (mod: Pick<ModDoc, 'id' | 'ownerUserId'>) =>
  parseMod(await redis.get(getDraftKey(mod.ownerUserId, mod.id)));

const getCurrentDraftForMod = async (
  mod: Pick<ModDoc, 'id' | 'ownerUserId'>
) => {
  const draft = await getAuthorDraftForMod(mod);
  await cleanupStaleDraftsForMod(mod.id, mod.ownerUserId);
  return draft;
};

const mergePublishedFieldsIntoDraft = (
  draft: ModDoc,
  latest: ModDoc | null
): ModDoc =>
  latest?.status === 'published'
    ? {
        ...draft,
        publishedAt: latest.publishedAt,
        publishedHash: latest.publishedHash,
        sharePostId: latest.sharePostId,
      }
    : draft;

const serializePublishedDraftSource = (
  draft: ModDoc,
  latest: ModDoc
): ModDoc => ({
  ...draft,
  status: 'published',
  publishedAt: latest.publishedAt,
  publishedHash: latest.publishedHash,
  sharePostId: latest.sharePostId,
});

const loadEditableSourceForUser = async (
  userId: string,
  username: string | undefined,
  modId: string
) => {
  const latest = await loadLatestMod(modId);
  if (latest) {
    await assertCanManageMod(latest, userId, username);
    const authorDraft = await getCurrentDraftForMod(latest);
    return {
      draft: mergePublishedFieldsIntoDraft(
        authorDraft ?? { ...latest, status: 'draft' },
        latest
      ),
      latest,
      source: latest,
    };
  }

  const draft =
    (await loadCanonicalDraftForUnpublishedMod(modId)) ??
    parseMod(await redis.get(getDraftKey(userId, modId)));
  if (!draft) {
    return null;
  }

  await assertCanManageMod(draft, userId, username);
  return {
    draft,
    latest: null,
    source: draft,
  };
};

const persistPublishedSharePostId = async (
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
    getDraftKey(mod.ownerUserId, mod.id),
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
      const latest = await loadLatestMod(member);

      if (latest) {
        if (latest.ownerUserId !== userId) {
          await redis.zRem(getOwnerKey(userId), [member]);
          return null;
        }

        const draft = await getCurrentDraftForMod(latest);
        if (draft && latest.status === 'published') {
          return serializeListItem(
            serializePublishedDraftSource(draft, latest),
            {
              hasDraftVersion: true,
              hasPublishedVersion: true,
            }
          );
        }

        if (draft) {
          return serializeListItem(draft, {
            hasDraftVersion: true,
            hasPublishedVersion: false,
          });
        }

        return serializeListItem(latest, {
          hasDraftVersion: false,
          hasPublishedVersion: latest.status === 'published',
        });
      }

      const draft =
        (await loadCanonicalDraftForUnpublishedMod(member)) ??
        parseMod(await redis.get(getDraftKey(userId, member)));
      if (draft) {
        if (draft.ownerUserId !== userId) {
          await redis.zRem(getOwnerKey(userId), [member]);
          return null;
        }

        return serializeListItem(draft, {
          hasDraftVersion: true,
          hasPublishedVersion: false,
        });
      }

      await redis.zRem(getOwnerKey(userId), [member]);
      return null;
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
      const latest = await loadLatestMod(modId);
      const draft = latest
        ? await getCurrentDraftForMod(latest)
        : await loadCanonicalDraftForUnpublishedMod(modId);
      const source =
        draft && latest?.status === 'published'
          ? serializePublishedDraftSource(draft, latest)
          : draft ?? latest;

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
  const editable = await loadEditableSourceForUser(userId, username, modId);
  return editable?.draft ?? null;
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
  const existingEditable = input.id
    ? await loadEditableSourceForUser(userId, username, input.id)
    : null;
  if (input.id && !existingEditable) {
    throw new Error('Mod not found.');
  }

  const modId = input.id ?? createModId();
  const ownerUserId = existingEditable?.source.ownerUserId ?? userId;
  const ownerUsername = existingEditable?.source.ownerUsername ?? username;
  const updatedAt = new Date().toISOString();
  const draft: ModDoc = {
    id: modId,
    title: input.title.trim(),
    summary: input.summary.trim(),
    intro: input.intro.trim(),
    ownerUserId,
    ownerUsername,
    startingElementIds: input.startingElementIds,
    counters: input.counters,
    showPalette: input.showPalette,
    elements: input.elements,
    reactions: input.reactions,
    events: input.events,
    reactionComments: input.reactionComments,
    status: 'draft',
    updatedAt,
  };

  await redis.set(getDraftKey(ownerUserId, modId), JSON.stringify(draft));
  await saveMeta(
    existingEditable?.latest?.status === 'published'
      ? existingEditable.latest
      : draft
  );
  await indexModForOwner(draft);
  await indexModGlobally(draft);
  await indexDraftOwnerForMod(draft);
  await cleanupStaleDraftsForMod(modId, ownerUserId);
  return draft;
};

export const publishDraftForUser = async (
  userId: string,
  username: string | undefined,
  modId: string
) => {
  const editable = await loadEditableSourceForUser(userId, username, modId);
  if (!editable) {
    throw new Error('Draft not found.');
  }
  const { draft, latest: existingPublished, source } = editable;

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
    events: draft.events,
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
    ownerUserId: source.ownerUserId,
    ownerUsername: source.ownerUsername,
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
    getDraftKey(published.ownerUserId, modId),
    JSON.stringify({ ...published, status: 'draft' })
  );
  await saveMeta(published);
  await indexModForOwner(published);
  await indexModGlobally(published);
  await indexDraftOwnerForMod(published);
  await indexPublishedMod(published);
  await cleanupStaleDraftsForMod(modId, published.ownerUserId);
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
  const latest = await loadLatestMod(modId);
  const draftOwnerEntries = await redis.zRange(getDraftOwnersKey(modId), 0, 999);
  const indexedDrafts = await Promise.all(
    draftOwnerEntries.map(async ({ member }) => ({
      ownerId: member,
      draft: parseMod(await redis.get(getDraftKey(member, modId))),
    }))
  );
  const ownDraft = parseMod(await redis.get(getDraftKey(userId, modId)));
  const target =
    latest ??
    indexedDrafts.find(({ draft }) => draft !== null)?.draft ??
    ownDraft;

  if (!target) {
    throw new Error('Mod not found.');
  }

  await assertCanManageMod(target, userId, username);
  await removeSharePostIfPossible(latest?.sharePostId ?? target.sharePostId);

  const ownerIds = new Set(
    [
      latest?.ownerUserId,
      target.ownerUserId,
      ownDraft?.ownerUserId,
      userId,
      ...draftOwnerEntries.map(({ member }) => member),
      ...indexedDrafts.map(({ draft }) => draft?.ownerUserId),
    ].filter(
      (candidate): candidate is string => Boolean(candidate)
    )
  );

  await redis.del(
    ...Array.from(ownerIds).map((ownerId) => getDraftKey(ownerId, modId)),
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
    await persistPublishedSharePostId(latest, normalizedSharePostId);
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

  const normalizedSharePostId = await persistPublishedSharePostId(latest, post.id);

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
  const editable = await loadEditableSourceForUser(userId, username, modId);
  if (!editable) {
    throw new Error('Mod not found.');
  }
  const { draft, latest, source } = editable;

  await removeSharePostIfPossible(latest?.sharePostId ?? draft?.sharePostId);

  const now = new Date().toISOString();
  const unpublished: ModDoc = {
    ...stripPublishedFields({
      ...draft,
      ownerUserId: source.ownerUserId,
      ownerUsername: source.ownerUsername,
      status: 'draft',
      updatedAt: now,
    }),
    status: 'draft',
    updatedAt: now,
  };

  await redis.set(getLatestKey(modId), JSON.stringify(unpublished));
  await redis.set(
    getDraftKey(unpublished.ownerUserId, modId),
    JSON.stringify(unpublished)
  );
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
