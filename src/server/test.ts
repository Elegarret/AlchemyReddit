import { createDevvitTest } from '@devvit/test/server/vitest';
import { Scope } from '@devvit/protos/json/reddit/devvit/app_permission/v1/app_permission.js';
import { getDefaultAppConfig } from '@devvit/shared-types/test/index.js';

/**
 * Initializes a test environment for the server. This is a great place
 * to put Devvit settings so you don't need to mock them per file. For example:
 *
 * ```ts
 * export const test = createDevvitTest({
 *  settings: {
 *    API_KEY: 'foo'
 *  },
 * });
 * ```
 */
const appConfig = getDefaultAppConfig();
appConfig.permissions.reddit.asUser = [
  Scope.SUBMIT_POST,
  Scope.SUBMIT_COMMENT,
  Scope.SUBSCRIBE_TO_SUBREDDIT,
];

export const test = createDevvitTest({ appConfig });
