import { redis, context } from '@devvit/web/server';

const getProgressKey = (userId: string) => {
	const subredditId = context.subredditId || 'default-sub';
	return `prog_v2:${userId}:${subredditId}`;
};

export type SavedProgress = {
	discovered: string[];
	elements: { id: string; name: string; x: number; y: number }[];
};

export const getProgress = async (userId: string): Promise<SavedProgress> => {
	const key = getProgressKey(userId);
	console.log(`[Progress] Loading for user ${userId} with key ${key}`);
	const data = await redis.get(key);
	if (!data) {
		console.log(`[Progress] No data found for key ${key}`);
		return { discovered: [], elements: [] };
	}
	try {
		const parsed = JSON.parse(data);
		console.log(`[Progress] Loaded ${parsed.discovered?.length || 0} items for ${userId}`);
		return parsed;
	} catch (e) {
		console.error(`[Progress] Failed to parse data for ${userId}:`, e);
		return { discovered: [], elements: [] };
	}
};

export const saveProgress = async (userId: string, progress: SavedProgress) => {
	const key = getProgressKey(userId);

	const limitedElements = progress.elements.slice(-20);
	const dataToSave = {
		discovered: progress.discovered,
		elements: limitedElements,
	};

	const data = JSON.stringify(dataToSave);
	console.log(`[Progress] Saving ${progress.discovered.length} items for ${userId} (Size: ${data.length}b)`);

	if (data.length > 32000) {
		console.error('[Progress] Data too large for Redis');
		return;
	}
	await redis.set(key, data);
};
