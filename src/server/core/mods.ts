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
  type PaginatedResult,
  saveDraftInputSchema,
  sharePostDataSchema,
  type ActiveRuleset,
  type ModDoc,
  type ModListItem,
  type SaveDraftInput,
  type SharePostData,
  type ValidationResult,
} from '../../modding/types';
import {
  deriveDraftFromReactionText,
  formatReactionTextIssue,
  getCanonicalReactionText,
} from '../../mod-editor/draft';
import { getPostUrl } from './post';

const catalogKey = 'mods:catalog';
const allModsKey = 'mods:all';
const bestCatalogKey = 'mods:catalog:best';
const featuredCatalogKey = 'mods:catalog:featured';
const adminCatalogKey = 'mods:catalog:admin';
const indexesVersionKey = 'mods:catalog:indexes:v2';
const rankCacheFreshMs = 15 * 60 * 1000;
const adminUnpublishedScoreOffset = 1_000_000_000_000_000;
const minSearchPrefixLength = 2;
const maxSearchPrefixLength = 24;

const getLatestKey = (modId: string) => `mod:${modId}:latest`;
const getMetaKey = (modId: string) => `mod:${modId}:meta`;
const getDraftKey = (userId: string, modId: string) =>
  `mod:${modId}:draft:${userId}`;
const getDraftOwnersKey = (modId: string) => `mod:${modId}:draft-owners`;
const getOwnerKey = (userId: string) => `mods:owner:${userId}`;
const getPlayerKey = (modId: string) => `mod:${modId}:players`;
const getCompletionKey = (modId: string) => `mod:${modId}:completions`;
const getRankCacheKey = (modId: string) => `mod:${modId}:rank-cache`;
const getSearchStateKey = (modId: string) => `mod:${modId}:search-state`;
const getPublicSearchTokenKey = (token: string) =>
  `mods:catalog:search:public:${token}`;
const getAdminSearchTokenKey = (token: string) =>
  `mods:catalog:search:admin:${token}`;
const normalizeRedditPostId = (postId: string) =>
  postId.startsWith('t3_') ? postId : `t3_${postId}`;
const getUpdatedAtScore = (updatedAt: string) =>
  -(Date.parse(updatedAt) || Date.now());
const getPublishedScore = (
  item: Pick<ModDoc, 'publishedAt' | 'updatedAt'>
) => getUpdatedAtScore(item.publishedAt ?? item.updatedAt);
const getBestCatalogScore = (bestScore: number) => -bestScore;
const getFeaturedScore = (featuredAt: string | undefined) =>
  -(Date.parse(featuredAt ?? '') || Date.now());
const getAdminCatalogScore = (
  item: Pick<ModListItem, 'publishedAt' | 'updatedAt'> & {
    latestVersionStatus?: ModDoc['status'] | null;
  }
) =>
  item.latestVersionStatus === 'published'
    ? getPublishedScore({
        publishedAt: item.publishedAt,
        updatedAt: item.updatedAt,
      })
    : adminUnpublishedScoreOffset + (Date.parse(item.updatedAt) || Date.now()) * -1;
type RankCacheState = {
  bestScore: number;
  lastSyncedAt: string;
  playerCount: number;
  upvotes: number;
};

type SearchState = {
  adminTokens: string[];
  publicTokens: string[];
};

type ListItemEnrichmentOptions = {
  includeCompletionCount?: boolean;
};

type PaginationArgs = {
  page: number;
  pageSize: number;
};

type SearchableAdminItem = AdminModListItem;

const buildPaginatedResult = <T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number
): PaginatedResult<T> => ({
  items,
  page,
  pageSize,
  totalItems,
  totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
});

const parseRankCache = (value: string | undefined): RankCacheState | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<RankCacheState>;
    if (
      typeof parsed.bestScore !== 'number' ||
      typeof parsed.lastSyncedAt !== 'string' ||
      typeof parsed.playerCount !== 'number' ||
      typeof parsed.upvotes !== 'number'
    ) {
      return null;
    }

    return {
      bestScore: parsed.bestScore,
      lastSyncedAt: parsed.lastSyncedAt,
      playerCount: parsed.playerCount,
      upvotes: parsed.upvotes,
    };
  } catch {
    return null;
  }
};

const parseSearchState = (value: string | undefined): SearchState => {
  if (!value) {
    return {
      adminTokens: [],
      publicTokens: [],
    };
  }

  try {
    const parsed = JSON.parse(value) as Partial<SearchState>;
    return {
      adminTokens: Array.isArray(parsed.adminTokens)
        ? parsed.adminTokens.filter(
            (token): token is string => typeof token === 'string'
          )
        : [],
      publicTokens: Array.isArray(parsed.publicTokens)
        ? parsed.publicTokens.filter(
            (token): token is string => typeof token === 'string'
          )
        : [],
    };
  } catch {
    return {
      adminTokens: [],
      publicTokens: [],
    };
  }
};

const isRankCacheFresh = (cache: RankCacheState | null) =>
  cache !== null &&
  Date.now() - Date.parse(cache.lastSyncedAt) < rankCacheFreshMs;

const normalizeSearchText = (value: string | undefined) =>
  value?.trim().toLowerCase() ?? '';

const tokenizeSearchValue = (value: string | undefined) =>
  normalizeSearchText(value)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= minSearchPrefixLength);

const buildSearchPrefixes = (values: (string | undefined)[]) => {
  const prefixes = new Set<string>();

  for (const value of values) {
    for (const token of tokenizeSearchValue(value)) {
      const maxLength = Math.min(token.length, maxSearchPrefixLength);
      for (let length = minSearchPrefixLength; length <= maxLength; length += 1) {
        prefixes.add(token.slice(0, length));
      }
    }
  }

  return [...prefixes];
};

const shuffleArray = <T>(items: T[]) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
  }
  return next;
};

const getPageBounds = ({ page, pageSize }: PaginationArgs) => ({
  start: page * pageSize,
  stop: page * pageSize + pageSize - 1,
});

export const getModBestScore = (
  item: Pick<ModListItem, 'playerCount' | 'upvotes'>
) => {
  const voteScore = Math.max(item.upvotes ?? 0, 0);
  const playerCount = item.playerCount ?? 0;
  const effectiveVotes =
    voteScore / (1 + Math.log1p(playerCount) * 0.15);
  return Math.min(
    100,
    Math.max(0, 100 * (1 - Math.exp(-effectiveVotes * 0.45)))
  );
};

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
  featuredAt: mod.featuredAt,
  featuredBy: mod.featuredBy,
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
    score: getPublishedScore(mod),
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
  const {
    featuredAt,
    featuredBy,
    publishedAt,
    publishedHash,
    sharePostId,
    ...draftState
  } = mod;
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
        featuredAt: latest.featuredAt,
        featuredBy: latest.featuredBy,
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
  featuredAt: latest.featuredAt,
  featuredBy: latest.featuredBy,
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

export const getModCompletionCount = async (modId: string) =>
  await redis.zCard(getCompletionKey(modId));

const readRankCache = async (modId: string) =>
  parseRankCache(await redis.get(getRankCacheKey(modId)));

const writeRankCache = async (modId: string, cache: RankCacheState) => {
  await redis.set(getRankCacheKey(modId), JSON.stringify(cache));
  await redis.zAdd(bestCatalogKey, {
    member: modId,
    score: getBestCatalogScore(cache.bestScore),
  });
  return cache;
};

const removeRankCache = async (modId: string) => {
  await redis.del(getRankCacheKey(modId));
  await redis.zRem(bestCatalogKey, [modId]);
};

const buildRankCacheForPublishedItem = async (
  item: Pick<ModListItem, 'id' | 'publishedAt' | 'sharePostId'>
) => {
  const [upvotes, playerCount] = await Promise.all([
    getModUpvotes(item),
    getModPlayerCount(item.id),
  ]);

  return await writeRankCache(item.id, {
    bestScore: getModBestScore({
      playerCount,
      upvotes,
    }),
    lastSyncedAt: new Date().toISOString(),
    playerCount,
    upvotes,
  });
};

const getRankCacheForItem = async (
  item: Pick<ModListItem, 'id' | 'publishedAt' | 'sharePostId'>,
  options?: {
    forceRefresh?: boolean;
    refreshIfStale?: boolean;
  }
) => {
  const cached = await readRankCache(item.id);
  if (!options?.forceRefresh && cached && !options?.refreshIfStale) {
    return cached;
  }

  if (!options?.forceRefresh && isRankCacheFresh(cached)) {
    return cached;
  }

  if (options?.forceRefresh || options?.refreshIfStale || cached === null) {
    return await buildRankCacheForPublishedItem(item);
  }

  return cached;
};

const applyRankCacheToListItem = async <T extends ModListItem>(
  item: T,
  options: ListItemEnrichmentOptions = {},
  rankOptions?: {
    forceRefresh?: boolean;
    refreshIfStale?: boolean;
  }
): Promise<T> => {
  const rankCache = item.publishedAt
    ? await getRankCacheForItem(item, rankOptions)
    : null;
  const completionCount = options.includeCompletionCount
    ? await getModCompletionCount(item.id)
    : undefined;

  return {
    ...item,
    ...(rankCache
      ? {
          bestScore: rankCache.bestScore,
          playerCount: rankCache.playerCount,
          upvotes: rankCache.upvotes,
        }
      : {}),
    ...(completionCount === undefined ? {} : { completionCount }),
  };
};

const buildAdminListItem = async (
  modId: string
): Promise<SearchableAdminItem | null> => {
  const latest = await loadLatestMod(modId);
  const draft = latest
    ? await getCurrentDraftForMod(latest)
    : await loadCanonicalDraftForUnpublishedMod(modId);
  const source =
    draft && latest?.status === 'published'
      ? serializePublishedDraftSource(draft, latest)
      : (draft ?? latest);

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
};

const loadPublishedListItem = async (modId: string) => {
  const meta = parseListItem(await redis.get(getMetaKey(modId)));
  if (meta?.status === 'published') {
    return meta;
  }

  const latest = await loadLatestMod(modId);
  return latest?.status === 'published' ? serializeListItem(latest) : null;
};

const getPublicSearchTokens = (item: ModListItem) =>
  buildSearchPrefixes([item.title, item.ownerUsername]);

const getAdminSearchTokens = (item: SearchableAdminItem) =>
  buildSearchPrefixes([
    item.title,
    item.ownerUsername,
    item.draftOwnerUsername,
    item.status,
    item.latestVersionStatus ?? undefined,
  ]);

const syncSearchTokenDomain = async (
  modId: string,
  previousTokens: string[],
  nextTokens: string[],
  getTokenKey: (token: string) => string,
  score: number
) => {
  const nextTokenSet = new Set(nextTokens);
  await Promise.all([
    ...previousTokens
      .filter((token) => !nextTokenSet.has(token))
      .map(async (token) => await redis.zRem(getTokenKey(token), [modId])),
    ...nextTokens.map(
      async (token) =>
        await redis.zAdd(getTokenKey(token), {
          member: modId,
          score,
        })
    ),
  ]);
};

const syncCatalogSearchIndexes = async (
  modId: string,
  publicItem: ModListItem | null,
  adminItem: SearchableAdminItem | null
) => {
  const previousState = parseSearchState(await redis.get(getSearchStateKey(modId)));
  const nextPublicTokens = publicItem ? getPublicSearchTokens(publicItem) : [];
  const nextAdminTokens = adminItem ? getAdminSearchTokens(adminItem) : [];

  await syncSearchTokenDomain(
    modId,
    previousState.publicTokens,
    nextPublicTokens,
    getPublicSearchTokenKey,
    publicItem
      ? getPublishedScore({
          publishedAt: publicItem.publishedAt,
          updatedAt: publicItem.updatedAt,
        })
      : 0
  );
  await syncSearchTokenDomain(
    modId,
    previousState.adminTokens,
    nextAdminTokens,
    getAdminSearchTokenKey,
    adminItem ? getAdminCatalogScore(adminItem) : 0
  );

  if (nextPublicTokens.length === 0 && nextAdminTokens.length === 0) {
    await redis.del(getSearchStateKey(modId));
    return;
  }

  await redis.set(
    getSearchStateKey(modId),
    JSON.stringify({
      adminTokens: nextAdminTokens,
      publicTokens: nextPublicTokens,
    } satisfies SearchState)
  );
};

const clearCatalogSearchIndexes = async (modId: string) => {
  const state = parseSearchState(await redis.get(getSearchStateKey(modId)));
  await Promise.all([
    ...state.publicTokens.map(
      async (token) => await redis.zRem(getPublicSearchTokenKey(token), [modId])
    ),
    ...state.adminTokens.map(
      async (token) => await redis.zRem(getAdminSearchTokenKey(token), [modId])
    ),
  ]);
  await redis.del(getSearchStateKey(modId));
};

const syncDerivedIndexesForMod = async (
  modId: string,
  options: {
    refreshRankCache: boolean;
  }
) => {
  const publishedItem = await loadPublishedListItem(modId);
  const adminItem = await buildAdminListItem(modId);

  if (publishedItem) {
    await redis.zAdd(catalogKey, {
      member: modId,
      score: getPublishedScore({
        publishedAt: publishedItem.publishedAt,
        updatedAt: publishedItem.updatedAt,
      }),
    });

    const rankCache = options.refreshRankCache
      ? await buildRankCacheForPublishedItem(publishedItem)
      : await readRankCache(modId);

    if (rankCache) {
      await redis.zAdd(bestCatalogKey, {
        member: modId,
        score: getBestCatalogScore(rankCache.bestScore),
      });
    }
  } else {
    await redis.zRem(catalogKey, [modId]);
    await removeRankCache(modId);
  }

  if (publishedItem?.featuredAt) {
    await redis.zAdd(featuredCatalogKey, {
      member: modId,
      score: getFeaturedScore(publishedItem.featuredAt),
    });
  } else {
    await redis.zRem(featuredCatalogKey, [modId]);
  }

  if (adminItem) {
    await redis.zAdd(adminCatalogKey, {
      member: modId,
      score: getAdminCatalogScore(adminItem),
    });
  } else {
    await redis.zRem(adminCatalogKey, [modId]);
  }

  await syncCatalogSearchIndexes(modId, publishedItem, adminItem);
};

const removeDerivedIndexesForMod = async (modId: string) => {
  await Promise.all([
    redis.zRem(bestCatalogKey, [modId]),
    redis.zRem(featuredCatalogKey, [modId]),
    redis.zRem(adminCatalogKey, [modId]),
    clearCatalogSearchIndexes(modId),
    removeRankCache(modId),
  ]);
};

const loadAllZsetMembers = async (key: string) => {
  const total = await redis.zCard(key);
  if (total === 0) {
    return [];
  }

  const results: { member: string; score: number }[] = [];
  for (let start = 0; start < total; start += 200) {
    results.push(...(await redis.zRange(key, start, Math.min(total - 1, start + 199))));
  }
  return results;
};

const ensureCatalogIndexes = async () => {
  if ((await redis.exists(indexesVersionKey)) > 0) {
    return;
  }

  const [catalogEntries, allEntries] = await Promise.all([
    loadAllZsetMembers(catalogKey),
    loadAllZsetMembers(allModsKey),
  ]);
  const modIds = Array.from(
    new Set([...catalogEntries, ...allEntries].map(({ member }) => member))
  );

  for (const modId of modIds) {
    await syncDerivedIndexesForMod(modId, {
      refreshRankCache: true,
    });
  }

  await redis.set(indexesVersionKey, '1');
};

const searchCatalogIds = async (
  query: string,
  getTokenKey: (token: string) => string
) => {
  const tokens = Array.from(new Set(tokenizeSearchValue(query))).map((token) =>
    token.slice(0, maxSearchPrefixLength)
  );
  if (tokens.length === 0) {
    return [];
  }

  const [firstToken, ...remainingTokens] = tokens;
  if (!firstToken) {
    return [];
  }

  const initialIds = (
    await redis.zRange(getTokenKey(firstToken), 0, -1, { by: 'rank' })
  ).map(({ member }) => member);
  if (remainingTokens.length === 0 || initialIds.length === 0) {
    return initialIds;
  }

  const remainingSets = await Promise.all(
    remainingTokens.map(async (token) =>
      new Set(
        (
          await redis.zRange(getTokenKey(token), 0, -1, {
            by: 'rank',
          })
        ).map(({ member }) => member)
      )
    )
  );

  return initialIds.filter((id) => remainingSets.every((set) => set.has(id)));
};

const paginateIds = (ids: string[], args: PaginationArgs) =>
  ids.slice(args.page * args.pageSize, args.page * args.pageSize + args.pageSize);

const loadPublishedItemsByIds = async (
  modIds: string[],
  options: ListItemEnrichmentOptions = {},
  rankOptions?: {
    forceRefresh?: boolean;
    refreshIfStale?: boolean;
  }
) =>
  (
    await Promise.all(
      modIds.map(async (modId) => {
        const item = await loadPublishedListItem(modId);
        if (!item) {
          await removeDerivedIndexesForMod(modId);
          return null;
        }

        return await applyRankCacheToListItem(item, options, rankOptions);
      })
    )
  ).filter((item): item is ModListItem => item !== null);

const loadAdminItemsByIds = async (
  modIds: string[],
  options: ListItemEnrichmentOptions = {}
) =>
  (
    await Promise.all(
      modIds.map(async (modId) => {
        const item = await buildAdminListItem(modId);
        if (!item) {
          await removeDerivedIndexesForMod(modId);
          return null;
        }

        return await applyRankCacheToListItem(item, {
          includeCompletionCount: options.includeCompletionCount ?? true,
        });
      })
    )
  ).filter((item): item is AdminModListItem => item !== null);

export const recordUniqueModPlayer = async (modId: string, userId: string) => {
  await redis.zAdd(getPlayerKey(modId), { member: userId, score: 0 });

  const latest = await getPublishedMod(modId);
  if (!latest) {
    return;
  }

  const cached = await readRankCache(modId);
  if (!cached) {
    return;
  }

  const playerCount = await getModPlayerCount(modId);
  await writeRankCache(modId, {
    ...cached,
    bestScore: getModBestScore({
      playerCount,
      upvotes: cached.upvotes,
    }),
    playerCount,
  });
};

export const recordUniqueModCompletion = async (
  modId: string,
  userId: string
) => {
  const latest = await loadLatestMod(modId);
  if (!latest || latest.status !== 'published') {
    return false;
  }

  await redis.zAdd(getCompletionKey(modId), {
    member: userId,
    score: Date.now(),
  });
  return true;
};

export const listCatalogMods = async (
  options: ListItemEnrichmentOptions = {}
) => {
  await ensureCatalogIndexes();
  const entries = await redis.zRange(catalogKey, 0, 99, { by: 'rank' });
  return await loadPublishedItemsByIds(
    entries.map(({ member }) => member),
    options,
    {
      refreshIfStale: true,
    }
  );
};

export const listModsForUser = async (
  userId: string,
  options: ListItemEnrichmentOptions = {}
) => {
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
      .map((item) =>
        applyRankCacheToListItem(item, options, {
          refreshIfStale: true,
        })
      )
  );
};

export const listAllAdminMods = async (): Promise<AdminModListItem[]> => {
  await ensureCatalogIndexes();
  const entries = await redis.zRange(adminCatalogKey, 0, 199, { by: 'rank' });
  return await loadAdminItemsByIds(
    entries.map(({ member }) => member),
    {
      includeCompletionCount: true,
    }
  );
};

export const listBestMods = async (
  limit: number,
  options: ListItemEnrichmentOptions = {}
) => {
  await ensureCatalogIndexes();
  const candidateCount = Math.max(limit * 5, 50);
  const candidateEntries = await redis.zRange(bestCatalogKey, 0, candidateCount - 1, {
    by: 'rank',
  });

  await Promise.all(
    candidateEntries.map(async ({ member }) => {
      const item = await loadPublishedListItem(member);
      if (!item) {
        await removeDerivedIndexesForMod(member);
        return;
      }

      const cache = await readRankCache(member);
      if (!isRankCacheFresh(cache)) {
        await buildRankCacheForPublishedItem(item);
      }
    })
  );

  const topEntries = await redis.zRange(bestCatalogKey, 0, limit - 1, {
    by: 'rank',
  });
  return await loadPublishedItemsByIds(
    topEntries.map(({ member }) => member),
    options
  );
};

export const listNewMods = async (
  limit: number,
  options: ListItemEnrichmentOptions = {}
) => {
  await ensureCatalogIndexes();
  const entries = await redis.zRange(catalogKey, 0, limit - 1, { by: 'rank' });
  return await loadPublishedItemsByIds(
    entries.map(({ member }) => member),
    options,
    {
      refreshIfStale: true,
    }
  );
};

export const listFeaturedMods = async (
  limit: number,
  options: ListItemEnrichmentOptions = {}
) => {
  await ensureCatalogIndexes();
  const entries = await redis.zRange(featuredCatalogKey, 0, -1, { by: 'rank' });
  const items = await loadPublishedItemsByIds(
    entries.map(({ member }) => member),
    options,
    {
      refreshIfStale: true,
    }
  );

  return shuffleArray(items).slice(0, limit);
};

export const listAllPublishedMods = async (
  args: PaginationArgs & {
    query?: string;
  },
  options: ListItemEnrichmentOptions = {}
): Promise<PaginatedResult<ModListItem>> => {
  await ensureCatalogIndexes();

  if (args.query?.trim()) {
    const matchedIds = await searchCatalogIds(args.query, getPublicSearchTokenKey);
    const pageIds = paginateIds(matchedIds, args);
    return buildPaginatedResult(
      await loadPublishedItemsByIds(pageIds, options, {
        refreshIfStale: true,
      }),
      args.page,
      args.pageSize,
      matchedIds.length
    );
  }

  const totalItems = await redis.zCard(catalogKey);
  const { start, stop } = getPageBounds(args);
  const entries = await redis.zRange(catalogKey, start, stop, { by: 'rank' });
  return buildPaginatedResult(
    await loadPublishedItemsByIds(
      entries.map(({ member }) => member),
      options,
      {
        refreshIfStale: true,
      }
    ),
    args.page,
    args.pageSize,
    totalItems
  );
};

export const listAllAdminModsPage = async (
  args: PaginationArgs & {
    query?: string;
  }
): Promise<PaginatedResult<AdminModListItem>> => {
  await ensureCatalogIndexes();

  if (args.query?.trim()) {
    const matchedIds = await searchCatalogIds(args.query, getAdminSearchTokenKey);
    const pageIds = paginateIds(matchedIds, args);
    return buildPaginatedResult(
      await loadAdminItemsByIds(pageIds, {
        includeCompletionCount: true,
      }),
      args.page,
      args.pageSize,
      matchedIds.length
    );
  }

  const totalItems = await redis.zCard(adminCatalogKey);
  const { start, stop } = getPageBounds(args);
  const entries = await redis.zRange(adminCatalogKey, start, stop, { by: 'rank' });
  return buildPaginatedResult(
    await loadAdminItemsByIds(entries.map(({ member }) => member), {
      includeCompletionCount: true,
    }),
    args.page,
    args.pageSize,
    totalItems
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

export const getPublishedModListItem = async (
  modId: string,
  options: ListItemEnrichmentOptions = {}
) => {
  const item = await loadPublishedListItem(modId);
  if (!item) {
    return null;
  }

  return await applyRankCacheToListItem(item, options, {
    refreshIfStale: true,
  });
};

export const validateDraftInput = (input: SaveDraftInput): ValidationResult =>
  validateModDraft(input);

const deriveValidatedDraftInput = (input: SaveDraftInput): SaveDraftInput => {
  const parsed = deriveDraftFromReactionText(input);
  if (!parsed.ok) {
    const firstIssue = parsed.errors[0];
    throw new Error(
      firstIssue
        ? formatReactionTextIssue(firstIssue)
        : 'Fix reaction text errors first.'
    );
  }

  return {
    ...parsed.draft,
    reactionText: getCanonicalReactionText(input),
  };
};

export const saveDraftForUser = async (
  userId: string,
  username: string,
  rawInput: SaveDraftInput
) => {
  const input = deriveValidatedDraftInput(saveDraftInputSchema.parse(rawInput));
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
    ...(input.coverImageUrl ? { coverImageUrl: input.coverImageUrl } : {}),
    intro: input.intro.trim(),
    ownerUserId,
    ownerUsername,
    startingElementIds: input.startingElementIds,
    counters: input.counters,
    showPalette: input.showPalette,
    compactElements: input.compactElements,
    elements: input.elements,
    reactions: input.reactions,
    events: input.events,
    functions: input.functions,
    reactionText: input.reactionText,
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
  await syncDerivedIndexesForMod(modId, {
    refreshRankCache: false,
  });
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

  const draftForPublish = deriveValidatedDraftInput({
    id: draft.id,
    title: draft.title,
    summary: draft.summary,
    ...(draft.coverImageUrl ? { coverImageUrl: draft.coverImageUrl } : {}),
    intro: draft.intro,
    startingElementIds: draft.startingElementIds,
    counters: draft.counters,
    showPalette: draft.showPalette,
    compactElements: draft.compactElements,
    elements: draft.elements,
    reactions: draft.reactions,
    events: draft.events,
    functions: draft.functions ?? [],
    reactionText: draft.reactionText,
    reactionComments: draft.reactionComments,
  });

  const validation = validateDraftInput({
    id: draftForPublish.id,
    title: draftForPublish.title,
    summary: draftForPublish.summary,
    ...(draftForPublish.coverImageUrl
      ? { coverImageUrl: draftForPublish.coverImageUrl }
      : {}),
    intro: draftForPublish.intro,
    startingElementIds: draftForPublish.startingElementIds,
    counters: draftForPublish.counters,
    showPalette: draftForPublish.showPalette,
    compactElements: draftForPublish.compactElements,
    elements: draftForPublish.elements,
    reactions: draftForPublish.reactions,
    events: draftForPublish.events,
    functions: draftForPublish.functions,
  });

  if (!validation.isValid || validation.warnings.length > 0) {
    throw new Error(
      validation.errors[0] ??
        validation.scriptErrors[0] ??
        validation.warnings[0] ??
        'Draft validation failed.'
    );
  }

  const publishedAt =
    existingPublished?.status === 'published' && existingPublished.publishedAt
      ? existingPublished.publishedAt
      : new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const published: ModDoc = {
    ...draftForPublish,
    id: modId,
    ownerUserId: source.ownerUserId,
    ownerUsername: source.ownerUsername,
    status: 'published',
    updatedAt,
    publishedAt,
    publishedHash: createModFingerprint(draft),
    ...(existingPublished?.status === 'published' &&
    existingPublished.sharePostId
      ? { sharePostId: existingPublished.sharePostId }
      : {}),
    ...(existingPublished?.status === 'published' &&
    existingPublished.featuredAt
      ? { featuredAt: existingPublished.featuredAt }
      : {}),
    ...(existingPublished?.status === 'published' &&
    existingPublished.featuredBy
      ? { featuredBy: existingPublished.featuredBy }
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
  await syncDerivedIndexesForMod(modId, {
    refreshRankCache: true,
  });
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
    featuredAt: undefined,
    featuredBy: undefined,
  };

  await redis.set(getLatestKey(modId), JSON.stringify(hidden));
  await redis.set(getMetaKey(modId), JSON.stringify(serializeListItem(hidden)));
  await indexModGlobally(hidden);
  await syncDerivedIndexesForMod(modId, {
    refreshRankCache: false,
  });
  return hidden;
};

export const setFeaturedModForUser = async (
  userId: string,
  username: string | undefined,
  modId: string,
  featured: boolean
) => {
  const latest = await loadLatestMod(modId);
  if (!latest) {
    throw new Error('Mod not found.');
  }

  if (!(await isCurrentUserModerator(username))) {
    throw new Error('You are not allowed to feature this mod.');
  }

  if (latest.status !== 'published') {
    throw new Error('Only published realms can be featured.');
  }

  const next: ModDoc = featured
    ? {
        ...latest,
        featuredAt: latest.featuredAt ?? new Date().toISOString(),
        featuredBy: username ?? userId,
      }
    : {
        ...latest,
        featuredAt: undefined,
        featuredBy: undefined,
      };

  await redis.set(getLatestKey(modId), JSON.stringify(next));
  await saveMeta(next);
  await syncDerivedIndexesForMod(modId, {
    refreshRankCache: false,
  });

  return await applyRankCacheToListItem(serializeListItem(next), {
    includeCompletionCount: true,
  });
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
  const draftOwnerEntries = await redis.zRange(
    getDraftOwnersKey(modId),
    0,
    999
  );
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
    ].filter((candidate): candidate is string => Boolean(candidate))
  );

  await redis.del(
    ...Array.from(ownerIds).map((ownerId) => getDraftKey(ownerId, modId)),
    getLatestKey(modId),
    getMetaKey(modId),
    getPlayerKey(modId),
    getCompletionKey(modId),
    getDraftOwnersKey(modId)
  );
  await Promise.all(
    Array.from(ownerIds).map(
      async (ownerId) => await redis.zRem(getOwnerKey(ownerId), [modId])
    )
  );
  await redis.zRem(catalogKey, [modId]);
  await redis.zRem(allModsKey, [modId]);
  await removeDerivedIndexesForMod(modId);

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
    await syncDerivedIndexesForMod(modId, {
      refreshRankCache: true,
    });
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
    latest,
    post.id
  );
  await syncDerivedIndexesForMod(modId, {
    refreshRankCache: true,
  });

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
  await syncDerivedIndexesForMod(modId, {
    refreshRankCache: false,
  });

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
