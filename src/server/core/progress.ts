import { redis, context } from '@devvit/web/server';

const getProgressKey = (userId: string) => {
	const subredditId = context.subredditId || 'default-sub';
	return `prog_v3:${userId}:${subredditId}`;
};

export const getDiscoveredElements = async (userId: string): Promise<string[]> => {
	const key = getProgressKey(userId);
	console.log(`[Progress] Loading discovered elements for user ${userId} with key ${key}`);
	const data = await redis.get(key);
	if (!data) {
		console.log(`[Progress] No discovery data found for key ${key}`);
		return [];
	}
	try {
		const parsed = JSON.parse(data);
		return Array.isArray(parsed) ? parsed : (parsed.discovered || []);
	} catch (e) {
		console.error(`[Progress] Failed to parse discovery data for ${userId}:`, e);
		return [];
	}
};

export const saveDiscoveredElements = async (userId: string, discovered: string[]) => {
	const key = getProgressKey(userId);
	const data = JSON.stringify(discovered);

	console.log(`[Progress] Saving ${discovered.length} discovered items for ${userId}`);

	if (data.length > 32000) {
		console.error('[Progress] Discovery data too large for Redis');
		return;
	}
	await redis.set(key, data);
};
