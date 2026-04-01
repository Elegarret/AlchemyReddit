import { initTRPC } from '@trpc/server';
import { transformer } from '../transformer';
import { Context } from './context';
import { context, reddit, settings } from '@devvit/web/server';
import { countDecrement, countGet, countIncrement } from './core/count';
import { z } from 'zod';
import { saveDraftInputSchema } from '../modding/types';

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
import { getDiscoveredElements, saveDiscoveredElements } from './core/progress';
import {
  createSharePostForMod,
  getEditableModForUser,
  getPublishedMod,
  getPublishedModListItem,
  hidePublishedMod,
  listCatalogMods,
  listModsForUser,
  publishDraftForUser,
  recordUniqueModPlayer,
  removeModForUser,
  resolveRulesetForModId,
  resolveRulesetFromPostData,
  saveDraftForUser,
  isCurrentUserModerator,
  unpublishModForUser,
  validateDraftInput,
} from './core/mods';

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
    get: publicProcedure
      .input(
        z
          .object({
            modId: z.string().optional(),
            countPlayerOpen: z.boolean().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const userId = context.userId;
        const [count, username] = await Promise.all([
          countGet(),
          userId
            ? reddit.getCurrentUsername().catch(() => undefined)
            : Promise.resolve(undefined),
        ]);

        let resolvedRuleset;
        if (input?.modId) {
          resolvedRuleset = await resolveRulesetForModId(input.modId);
        } else {
          resolvedRuleset = await resolveRulesetFromPostData();
        }

        if (input?.countPlayerOpen && userId && resolvedRuleset.modId) {
          await recordUniqueModPlayer(resolvedRuleset.modId, userId);
        }

        const [redditDiscovered, activeModListing] = await Promise.all([
          userId
            ? getDiscoveredElements(userId, resolvedRuleset.progressScope)
            : Promise.resolve([]),
          resolvedRuleset.modId
            ? getPublishedModListItem(resolvedRuleset.modId)
            : Promise.resolve(null),
        ]);
        const isModerator = await isCurrentUserModerator(username);

        return {
          count,
          isModerator,
          postId: context.postId,
          username,
          redditDiscovered,
          activeRuleset: resolvedRuleset.ruleset,
          activeModListing,
          progressScope: resolvedRuleset.progressScope,
          rulesetUnavailableReason: resolvedRuleset.unavailableReason,
        };
      }),
  }),
  progress: t.router({
    save: publicProcedure
      .input(
        z.object({
          discovered: z.array(z.string()),
          progressScope: z.string().min(1).max(128),
        })
      )
      .mutation(async ({ input }) => {
        const userId = context.userId;
        if (userId) {
          await saveDiscoveredElements(
            userId,
            input.progressScope,
            input.discovered
          );
        }
        return { success: true };
      }),
  }),
  mods: t.router({
    listCatalog: publicProcedure.query(async () => await listCatalogMods()),
    listMine: publicProcedure.query(async () => {
      if (!context.userId) {
        return [];
      }
      return await listModsForUser(context.userId);
    }),
    getDraft: publicProcedure
      .input(z.string().min(1).max(64))
      .query(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }
        return await getEditableModForUser(context.userId, input);
      }),
    getPublished: publicProcedure
      .input(z.string().min(1).max(64))
      .query(async ({ input }) => await getPublishedMod(input)),
    getEditorSettings: publicProcedure.query(async () => {
      const authorsHelpPageUrl =
        (await settings.get<string>('authorsHelpPage'))?.trim() ?? '';
      const scriptingHelpPageUrl =
        (await settings.get<string>('scriptingHelpPage'))?.trim() ?? '';

      return {
        authorsHelpPageUrl:
          authorsHelpPageUrl.length > 0 ? authorsHelpPageUrl : null,
        scriptingHelpPageUrl:
          scriptingHelpPageUrl.length > 0 ? scriptingHelpPageUrl : null,
      };
    }),
    validateDraft: publicProcedure
      .input(saveDraftInputSchema)
      .mutation(async ({ input }) => validateDraftInput(input)),
    saveDraft: publicProcedure
      .input(saveDraftInputSchema)
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }

        const username = await reddit.getCurrentUsername();
        if (!username) {
          throw new Error('You must be logged in.');
        }

        return await saveDraftForUser(context.userId, username, input);
      }),
    publish: publicProcedure
      .input(z.string().min(1).max(64))
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }
        return await publishDraftForUser(context.userId, input);
      }),
    unpublish: publicProcedure
      .input(z.string().min(1).max(64))
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }
        return await unpublishModForUser(context.userId, input);
      }),
    createSharePost: publicProcedure
      .input(z.string().min(1).max(64))
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }
        return await createSharePostForMod(context.userId, input);
      }),
    hide: publicProcedure
      .input(z.string().min(1).max(64))
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }

        return await hidePublishedMod(
          context.userId,
          await reddit.getCurrentUsername(),
          input
        );
      }),
    remove: publicProcedure
      .input(z.string().min(1).max(64))
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }

        return await removeModForUser(context.userId, input);
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
