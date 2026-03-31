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
- Mod realms now expose authored counters with min/max/initial values in both the editor and the game. Counter values persist locally per ruleset, reset to authored initial values, and clamp during scripted updates.
- Playtest sessions use `PLAYTEST_RULESET_STORAGE_KEY` in local storage and bypass Reddit progress syncing.
- Editor saves persist draft data through tRPC, then publish/share actions operate on the saved draft id.
- Published realms can be shared to a Reddit post and reopened from the game/options flow for authors.
- Mod reactions can optionally carry per-reaction script text. Non-empty scripts override `outputIds` at runtime, and the editor validates script lines inline plus during overall draft validation.
- Reaction script syntax now canonically uses `add`, `set(...)`, `message(...)`, `popup(...)`, `win(...)`, `lose(...)`, `not_discovered(...)`, and `count(...)` comparisons. The per-reaction textarea exposes lightweight local autocomplete for those token families, while the full text editor serializes valid scripts back out in canonical form.
- The full-text reaction editor now opens expanded by default when authors switch into text mode, can compact back to the split layout, autocompletes top-level `A + B =` reaction lines, and falls through to standard script autocomplete on indented lines.
- Counter-marked elements remain editable in the general element list for icon/name/style changes, but they are treated as non-gameplay elements by validation and script authoring.
- Elements can be marked `non-consumable`; those elements stay on the table after successful reactions unless a script explicitly removes them.
- Scripted `popup(...)` actions render queued blocking modals, while scripted `win(...)` and `lose(...)` actions render blocking end-state screens with reset and realm-list navigation actions.
- Realms can hide the palette for quest-like play. In that mode the game removes the footer palette entirely and seeds starter elements onto the table in a circular layout around the viewport center on first load and reset.
- The mod editor emoji picker uses a self-hosted dataset at `public/emoji-data.json`, sourced from `emoji-picker-element-data/en/emojibase/data.json` via `npm run sync:emoji-data`.
- The emoji picker follows `prefers-color-scheme` by default, so it renders in light or dark mode to match the rest of the app instead of forcing dark mode.

## Future Plans

- Add a user-facing tutorial, including guidance for reaction scripts and other modding flows where needed.
- starred mods - >90% upvotes
- featured mods, section on the main page, choose 5 random featured every time
- Advanced realm settings: 
- - inventory-style palette. Opened elements don't get there automatically, only by special script action. Same elememnts must stack there, i.e if stone was added twice, display as stone and (2) in the corner. Elements are not permamnet there, they being consumed when dragged out.
- add user profiles

## Commands

- `npm run type-check`: required after changes
- `npm test -- my-file-name`: targeted test execution
- `npm test`: full test suite
- `npm run sync:emoji-data`: refreshes `public/emoji-data.json` from the installed official emoji dataset

## Current Known Verification Note

- As of this refactor, `npm run type-check` passes.
- As of this refactor, `npm test` still has a failing client test in `src/splash.test.ts` for the secondary create-mod CTA.
