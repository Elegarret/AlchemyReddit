import { initTRPC } from '@trpc/server';
import { transformer } from '../transformer';
import { Context } from './context';
import { context, media, reddit, settings } from '@devvit/web/server';
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
  listAllAdminModsPage,
  listAllPublishedMods,
  listBestMods,
  listCatalogMods,
  listFeaturedMods,
  listModsForUser,
  listNewMods,
  publishDraftForUser,
  recordUniqueModCompletion,
  recordUniqueModPlayer,
  removeModForUser,
  resolveRulesetForModId,
  resolveRulesetFromPostData,
  saveDraftForUser,
  isCurrentUserModerator,
  setFeaturedModForUser,
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

const normalizedPngDataUrlSchema = z
  .string()
  .min(1)
  .max(4_000_000)
  .regex(
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/,
    'Expected a normalized PNG data URL.'
  );

const reviewTextSchema = z.string().trim().min(1).max(5_000);

const normalizeRedditPostThingId = (postId: string): `t3_${string}` => {
  const barePostId = postId.startsWith('t3_') ? postId.slice(3) : postId;
  return `t3_${barePostId}`;
};

const getCurrentUsernameIfLoggedIn = async () =>
  context.userId
    ? reddit.getCurrentUsername().catch(() => undefined)
    : Promise.resolve(undefined);

const completionCountersArePublic = async () =>
  (await settings.get<boolean>('completionCountersPublic')) === true;

const canViewCompletionCounters = async (username: string | undefined) =>
  (await completionCountersArePublic()) ||
  (await isCurrentUserModerator(username));

const catalogListInputSchema = z
  .object({
    limit: z.number().int().positive().max(20).optional(),
  })
  .optional();

const paginatedCatalogInputSchema = z
  .object({
    page: z.number().int().nonnegative().optional(),
    pageSize: z.number().int().positive().max(50).optional(),
    query: z.string().trim().max(80).optional(),
  })
  .optional();

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
          getCurrentUsernameIfLoggedIn(),
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

        const [redditDiscovered, isModerator] = await Promise.all([
          userId
            ? getDiscoveredElements(userId, resolvedRuleset.progressScope)
            : Promise.resolve([]),
          isCurrentUserModerator(username),
        ]);
        const includeCompletionCount =
          (await completionCountersArePublic()) || isModerator;
        const activeModListing = resolvedRuleset.modId
          ? await getPublishedModListItem(resolvedRuleset.modId, {
              includeCompletionCount,
            })
          : null;

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
    complete: publicProcedure
      .input(z.object({ modId: z.string().min(1).max(64) }))
      .mutation(async ({ input }) => {
        const userId = context.userId;
        if (!userId) {
          return { success: false };
        }

        return {
          success: await recordUniqueModCompletion(input.modId, userId),
        };
      }),
  }),
  mods: t.router({
    listCatalog: publicProcedure.query(async () => {
      const username = await getCurrentUsernameIfLoggedIn();
      return await listCatalogMods({
        includeCompletionCount: await canViewCompletionCounters(username),
      });
    }),
    listBest: publicProcedure
      .input(catalogListInputSchema)
      .query(async ({ input }) => {
        const username = await getCurrentUsernameIfLoggedIn();
        return await listBestMods(input?.limit ?? 5, {
          includeCompletionCount: await canViewCompletionCounters(username),
        });
      }),
    listNew: publicProcedure
      .input(catalogListInputSchema)
      .query(async ({ input }) => {
        const username = await getCurrentUsernameIfLoggedIn();
        return await listNewMods(input?.limit ?? 5, {
          includeCompletionCount: await canViewCompletionCounters(username),
        });
      }),
    listFeatured: publicProcedure
      .input(catalogListInputSchema)
      .query(async ({ input }) => {
        const username = await getCurrentUsernameIfLoggedIn();
        return await listFeaturedMods(input?.limit ?? 8, {
          includeCompletionCount: await canViewCompletionCounters(username),
        });
      }),
    listAllPublished: publicProcedure
      .input(paginatedCatalogInputSchema)
      .query(async ({ input }) => {
        const username = await getCurrentUsernameIfLoggedIn();
        return await listAllPublishedMods(
          {
            page: input?.page ?? 0,
            pageSize: input?.pageSize ?? 15,
            ...(input?.query ? { query: input.query } : {}),
          },
          {
            includeCompletionCount: await canViewCompletionCounters(username),
          }
        );
      }),
    listAllAdmin: publicProcedure
      .input(paginatedCatalogInputSchema)
      .query(async ({ input }) => {
      const username = await getCurrentUsernameIfLoggedIn();

      if (!(await isCurrentUserModerator(username))) {
        throw new Error('You are not allowed to view all realms.');
      }

      return await listAllAdminModsPage({
        page: input?.page ?? 0,
        pageSize: input?.pageSize ?? 15,
        ...(input?.query ? { query: input.query } : {}),
      });
    }),
    listMine: publicProcedure.query(async () => {
      if (!context.userId) {
        return [];
      }
      const username = await getCurrentUsernameIfLoggedIn();
      return await listModsForUser(context.userId, {
        includeCompletionCount: await canViewCompletionCounters(username),
      });
    }),
    getDraft: publicProcedure
      .input(z.string().min(1).max(64))
      .query(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }
        return await getEditableModForUser(
          context.userId,
          await reddit.getCurrentUsername(),
          input
        );
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
    uploadElementIcon: publicProcedure
      .input(normalizedPngDataUrlSchema)
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }

        const uploaded = await media.upload({
          url: input,
          type: 'image',
        });

        return { url: uploaded.mediaUrl };
      }),
    uploadRealmCover: publicProcedure
      .input(normalizedPngDataUrlSchema)
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }

        const uploaded = await media.upload({
          url: input,
          type: 'image',
        });

        return { url: uploaded.mediaUrl };
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
        return await publishDraftForUser(
          context.userId,
          await reddit.getCurrentUsername(),
          input
        );
      }),
    unpublish: publicProcedure
      .input(z.string().min(1).max(64))
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }
        return await unpublishModForUser(
          context.userId,
          await reddit.getCurrentUsername(),
          input
        );
      }),
    createSharePost: publicProcedure
      .input(z.string().min(1).max(64))
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }
        return await createSharePostForMod(context.userId, input);
      }),
    submitReview: publicProcedure
      .input(
        z.object({
          modId: z.string().min(1).max(64),
          text: reviewTextSchema,
        })
      )
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }

        const mod = await getPublishedMod(input.modId);
        if (!mod?.sharePostId) {
          throw new Error('This realm does not have a Reddit post yet.');
        }

        await reddit.submitComment({
          id: normalizeRedditPostThingId(mod.sharePostId),
          text: input.text,
          runAs: 'USER',
        });

        return { success: true };
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
    setFeatured: publicProcedure
      .input(
        z.object({
          modId: z.string().min(1).max(64),
          featured: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }

        return await setFeaturedModForUser(
          context.userId,
          await reddit.getCurrentUsername(),
          input.modId,
          input.featured
        );
      }),
    remove: publicProcedure
      .input(z.string().min(1).max(64))
      .mutation(async ({ input }) => {
        if (!context.userId) {
          throw new Error('You must be logged in.');
        }

        return await removeModForUser(
          context.userId,
          await reddit.getCurrentUsername(),
          input
        );
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
