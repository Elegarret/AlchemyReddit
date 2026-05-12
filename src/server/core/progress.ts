import { redis, context } from '@devvit/web/server';
import {
  createEmptyPlayerProgress,
  PLAYER_PROGRESS_VERSION,
  type PlayerProgress,
  type PlayerProgressInput,
  type SavedTableElement,
} from '../../game-progress';

const getBaseProgressKey = (userId: string) => {
  const subredditId = context.subredditId || 'default-sub';
  return `prog_v3:${userId}:${subredditId}`;
};

const getProgressKey = (userId: string, progressScope: string) => {
  if (progressScope === 'base') {
    return getBaseProgressKey(userId);
  }

  const subredditId = context.subredditId || 'default-sub';
  return `prog_mod_v1:${userId}:${subredditId}:${progressScope}`;
};

export const getDiscoveredElements = async (
  userId: string,
  progressScope: string
): Promise<string[]> => {
  const progress = await getPlayerProgress(userId, progressScope);
  return progress.discovered;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string')
    : [];

const getNumberRecord = (value: unknown) => {
  if (!isRecord(value)) {
    return {};
  }

  const entries = Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === 'number' ? [[key, entry]] : []
  );
  return Object.fromEntries(entries);
};

const getEventState = (value: unknown) => {
  if (!isRecord(value)) {
    return createEmptyPlayerProgress().eventState;
  }

  return {
    activeEventIds: getStringArray(value.activeEventIds),
    firedEventIds: getStringArray(value.firedEventIds),
  };
};

const getTableElements = (value: unknown): SavedTableElement[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    if (
      typeof entry.id !== 'string' ||
      typeof entry.name !== 'string' ||
      typeof entry.x !== 'number' ||
      typeof entry.y !== 'number' ||
      !Number.isFinite(entry.x) ||
      !Number.isFinite(entry.y)
    ) {
      return [];
    }

    return [
      {
        id: entry.id,
        name: entry.name,
        x: entry.x,
        y: entry.y,
        ...(typeof entry.icon === 'string' ? { icon: entry.icon } : {}),
        ...(typeof entry.hint === 'string' ? { hint: entry.hint } : {}),
      },
    ];
  });
};

const parseProgressData = (data: string): PlayerProgress => {
  const emptyProgress = createEmptyPlayerProgress();

  try {
    const parsed: unknown = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return {
        ...emptyProgress,
        discovered: getStringArray(parsed),
      };
    }

    if (!isRecord(parsed)) {
      return emptyProgress;
    }

    return {
      counterValues: getNumberRecord(parsed.counterValues),
      discovered: getStringArray(parsed.discovered),
      eventState: getEventState(parsed.eventState),
      tableElements: getTableElements(parsed.tableElements),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      version: PLAYER_PROGRESS_VERSION,
      visibleCounterNames: getStringArray(parsed.visibleCounterNames),
    };
  } catch (e) {
    console.error('[Progress] Failed to parse player progress:', e);
    return emptyProgress;
  }
};

export const getPlayerProgress = async (
  userId: string,
  progressScope: string
): Promise<PlayerProgress> => {
  const key = getProgressKey(userId, progressScope);
  console.log(
    `[Progress] Loading player progress for user ${userId} with key ${key}`
  );
  const data = await redis.get(key);
  if (!data) {
    console.log(`[Progress] No player progress found for key ${key}`);
    return createEmptyPlayerProgress();
  }

  return parseProgressData(data);
};

export const saveDiscoveredElements = async (
  userId: string,
  progressScope: string,
  discovered: string[]
) => {
  await savePlayerProgress(userId, progressScope, {
    counterValues: {},
    discovered,
    eventState: createEmptyPlayerProgress().eventState,
    tableElements: [],
    visibleCounterNames: [],
  });
};

export const savePlayerProgress = async (
  userId: string,
  progressScope: string,
  progress: PlayerProgressInput
) => {
  const key = getProgressKey(userId, progressScope);
  const savedProgress: PlayerProgress = {
    ...progress,
    updatedAt: new Date().toISOString(),
    version: PLAYER_PROGRESS_VERSION,
  };
  const data = JSON.stringify(savedProgress);

  console.log(
    `[Progress] Saving session with ${progress.discovered.length} discovered items and ${progress.tableElements.length} table items for ${userId}`
  );

  if (data.length > 128000) {
    console.error('[Progress] Player progress data too large for Redis');
    return savedProgress;
  }
  await redis.set(key, data);
  return savedProgress;
};
