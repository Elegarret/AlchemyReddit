import { expect } from 'vitest';
import { context, redis } from '@devvit/web/server';
import { test } from '../test';
import {
  getDiscoveredElements,
  getPlayerProgress,
  savePlayerProgress,
} from './progress';

const getScopedProgressKey = (userId: string, progressScope: string) => {
  const subredditId = context.subredditId || 'default-sub';
  return progressScope === 'base'
    ? `prog_v3:${userId}:${subredditId}`
    : `prog_mod_v1:${userId}:${subredditId}:${progressScope}`;
};

test('loads legacy discovered element arrays', async () => {
  const userId = 'legacy-user';
  await redis.set(
    getScopedProgressKey(userId, 'base'),
    JSON.stringify(['air', 'fire', 'steam'])
  );

  const progress = await getPlayerProgress(userId, 'base');

  expect(progress.discovered).toEqual(['air', 'fire', 'steam']);
  expect(progress.tableElements).toEqual([]);
  expect(await getDiscoveredElements(userId, 'base')).toEqual([
    'air',
    'fire',
    'steam',
  ]);
});

test('saves and loads full player progress', async () => {
  const userId = 'session-user';

  const saved = await savePlayerProgress(userId, 'mod:test', {
    counterValues: { Health: 7 },
    discovered: ['air', 'fire', 'steam'],
    eventState: {
      activeEventIds: ['event:active'],
      firedEventIds: ['event:fired'],
    },
    tableElements: [
      {
        hint: 'try fire',
        icon: '🔥',
        id: 'el-9',
        name: 'fire',
        x: 120,
        y: 240,
      },
    ],
    visibleCounterNames: ['Health'],
  });

  const progress = await getPlayerProgress(userId, 'mod:test');

  expect(progress).toEqual(saved);
  expect(progress.version).toBe(1);
  expect(progress.updatedAt).toEqual(expect.any(String));
});

test('falls back to empty progress for malformed redis data', async () => {
  const userId = 'malformed-user';
  await redis.set(getScopedProgressKey(userId, 'base'), '{not-json');

  const progress = await getPlayerProgress(userId, 'base');

  expect(progress.discovered).toEqual([]);
  expect(progress.tableElements).toEqual([]);
  expect(progress.counterValues).toEqual({});
  expect(progress.visibleCounterNames).toEqual([]);
  expect(progress.eventState).toEqual({
    activeEventIds: [],
    firedEventIds: [],
  });
});
