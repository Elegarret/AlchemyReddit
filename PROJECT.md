# Alchemy Game Project Notes

Keep this file updated when architecture, major flows, or important project conventions change.

## Product

- Reddit Devvit web app for an alchemy-combination game with moddable custom realms.
- Players combine discovered elements in the game view and persist discovery progress.
- Moderators/authors can build, save, publish, share, unpublish, and remove custom realms from the editor.

## Stack

- Frontend: React 19, Vite, Tailwind CSS 4
- Backend: Devvit web serverless environment, Hono, tRPC v11
- Tests: Vitest with `@devvit/test` for server harness coverage

## Runtime Entry Points

- `src/splash.tsx`: inline/feed entry view
- `src/game.tsx`: expanded gameplay entrypoint
- `src/mod-editor.tsx`: realm editor entrypoint
- `src/mod-catalog.tsx`: realm catalog/mod listing view

## Frontend Structure

- `src/game/GameApp.tsx`: main gameplay screen logic and rendering
- `src/game/playtest.ts`: playtest ruleset loading from local storage
- `src/game/types.ts`: gameplay UI types
- `src/game/visuals.ts`: snow/background visual generators
- `src/mod-editor/ModEditorApp.tsx`: realm editor screen and save/publish/share flows
- `src/mod-editor/components.tsx`: reusable editor controls/widgets
- `src/mod-editor/constants.ts`: editor-local types and option lists
- `src/mod-editor/draft.ts`: editor draft helpers, reaction text conversion, and draft creation utilities
- `src/modding/reaction-script-autocomplete.ts`: lightweight per-reaction script autocomplete context detection and insertion helpers
- `src/modding/reaction-script.ts`: handwritten reaction script parser, validator, and execution helpers shared by editor validation and gameplay runtime

## Backend Structure

- `src/server/trpc.ts`: tRPC router definitions
- `src/server/index.ts`: Hono server entrypoint
- `src/server/core/progress.ts`: player discovery persistence
- `src/server/core/mods.ts`: mod draft, publish, share, and removal logic
- `src/server/core/post.ts`: Reddit post integration helpers

## Key Flows

- Game progress is stored locally per ruleset and synced to Reddit progress for non-playtest sessions.
- Game state now also persists per-ruleset script counters locally, even though the editor does not expose a counter-definition UI yet.
- Playtest sessions use `PLAYTEST_RULESET_STORAGE_KEY` in local storage and bypass Reddit progress syncing.
- Editor saves persist draft data through tRPC, then publish/share actions operate on the saved draft id.
- Published realms can be shared to a Reddit post and reopened from the game/options flow for authors.
- Mod reactions can optionally carry per-reaction script text. Non-empty scripts override `outputIds` at runtime, and the editor validates script lines inline plus during overall draft validation.
- Reaction script syntax now canonically uses `add`, `set(...)`, `message(...)`, `not_discovered(...)`, and `count(...)` comparisons. The per-reaction textarea exposes lightweight local autocomplete for those token families, while the full text editor serializes valid scripts back out in canonical form.

## Commands

- `npm run type-check`: required after changes
- `npm test -- my-file-name`: targeted test execution
- `npm test`: full test suite

## Current Known Verification Note

- As of this refactor, `npm run type-check` passes.
- As of this refactor, `npm test` still has a failing client test in `src/splash.test.ts` for the secondary create-mod CTA.
