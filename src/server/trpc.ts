import { initTRPC } from '@trpc/server';
import { transformer } from '../transformer';
import { Context } from './context';
import { context, reddit } from '@devvit/web/server';
import { countDecrement, countGet, countIncrement } from './core/count';
import { z } from 'zod';

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
import { getProgress, saveProgress } from './core/progress';

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create({
	transformer,
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = t.router({
	init: t.router({
		get: publicProcedure.query(async () => {
			const [count, username, userId] = await Promise.all([
				countGet(),
				reddit.getCurrentUsername(),
				context.userId,
			]);

			const redditProgress = userId ? await getProgress(userId) : { discovered: [], elements: [] };

			return {
				count,
				postId: context.postId,
				username,
				redditProgress,
			};
		}),
	}),
	progress: t.router({
		save: publicProcedure
			.input(z.object({
				discovered: z.array(z.string()),
				elements: z.array(z.object({
					id: z.string(),
					name: z.string(),
					x: z.number(),
					y: z.number(),
				})),
			}))
			.mutation(async ({ input }) => {
				const userId = context.userId;
				if (userId) {
					await saveProgress(userId, input);
				}
				return { success: true };
			}),
	}),
	counter: t.router({
		increment: publicProcedure
			.input(z.number().optional())
			.mutation(async ({ input }) => {
				const { postId } = context;
				return {
					count: await countIncrement(input),
					postId,
					type: 'increment',
				};
			}),
		decrement: publicProcedure
			.input(z.number().optional())
			.mutation(async ({ input }) => {
				const { postId } = context;
				return {
					count: await countDecrement(input),
					postId,
					type: 'decrement',
				};
			}),
		get: publicProcedure.query(async () => {
			return await countGet();
		}),
	}),
});

export type AppRouter = typeof appRouter;
