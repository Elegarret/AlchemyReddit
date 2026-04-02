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
- Programmatic post creation is Devvit Web-only: new `reddit.submitCustomPost()` flows must target named `devvit.json` entrypoints (`default`, `game`, `mod-catalog`, `mod-splash`, etc.) and must not reintroduce Blocks-era APIs, config, or splash fields.
- Mod realms now expose authored counters with min/max/initial values in both the editor and the game. Counter values persist locally per ruleset, reset to authored initial values, and clamp during scripted updates.
- Playtest sessions use `PLAYTEST_RULESET_STORAGE_KEY` in local storage and bypass Reddit progress syncing.
- Editor saves persist draft data through tRPC, then publish/share actions operate on the saved draft id.
- Published realms can be shared to a Reddit post and reopened from the game/options flow for authors.
- Publishing updates now reuses an existing realm share post when available and refreshes that post body instead of creating a fresh Reddit post. Share-post IDs are normalized server-side so republish/edit/delete flows keep working even if Reddit returns bare post IDs.
- Published realm player counts only increment when the expanded `game` view loads a published realm; opening inline splash views reads the current count without recording a player.
- Inline splash entrypoints cache their last rendered state in session storage and revalidate on `window.focus`, which keeps return-from-game popup closes from falling back to a visibly cold inline reload.
- The inline splash now routes its secondary CTA to the realm catalog (`Alchemy Hub`) instead of opening a fresh editor directly.
- The shared realm splash swaps its secondary CTA to `Edit Realm` for the realm author or moderators/admins and preloads that realm into the editor; other viewers still get `Create My Realm`.
- Mod reactions can optionally carry per-reaction script text. Non-empty scripts override `outputIds` at runtime, and the editor validates script lines inline plus during overall draft validation.
- Reaction script syntax now canonically uses `add`, bracket-less action forms such as `set health += 1`, `message "..."`, `popup "..."`, `win "..."`, and `lose "..."`, plus condition predicates like `not_discovered(...)` and `count(...)` comparisons. The per-reaction textarea exposes lightweight local autocomplete for those token families, while the full text editor serializes valid scripts back out in canonical form.
- Reaction scripts and the full reaction-text editor now support `//` comments outside quoted strings. Script beautifying preserves comment lines and trailing comments, and comment-only script bodies do not count as active scripted overrides.
- Full reaction-text comments persist through save/load and visual/text mode switches via editor-only `reactionComments` metadata stored alongside reactions. That metadata must stay out of gameplay/runtime behavior and out of the published fingerprint.
- `remove_all` now supports both `remove_all ElementName` to clear one element kind and a bare `remove_all` form that clears the entire table.
- The full-text reaction editor now opens expanded by default when authors switch into text mode, can compact back to the split layout, autocompletes top-level `A + B =` reaction lines, and falls through to standard script autocomplete on indented lines.
- The full-text reaction editor now starts with a declaration block for `starters:`, `counters:`, and `nonconsumables:`. Those lines round-trip with the visual editor, must stay above the first blank line, and `counters:` supports optional `min=` / `max=` bounds while still requiring `initial=`.
- Both reaction text editors now auto-add newly finished element names to the realm when authors end an unknown element token with `+`, `,`, or non-autosuggest `Enter`, while deduping names case-insensitively after trimming outer whitespace.
- Element names now reject reserved reaction/script syntax characters such as `+`, `,`, `=`, `:`, `(`, `)`, and `"` during authoring. New auto-created names are also normalized away from reserved scripting prefixes like `add` or `set`, and publish-time validation blocks any stale invalid names that slip in from older data.
- Script-editor auto-add now parses complete `popup "..."`, `win "..."`, `lose "..."`, legacy popup-call syntax, and element-predicate calls safely, so closing syntax like `)` is not folded into new element names.
- Name autocomplete now replaces the whole current token when accepted mid-word in either script mode or the full reaction-text editor, so accepting `sand` inside `sand` no longer produces duplicated suffixes like `sandnd`.
- Reaction script actions now use bracket-less canonical syntax in the editor and formatter: `set counter += 10`, `message "Text"`, `popup "Text", Icon`, `win "Text"`, and `lose "Text"`. Condition predicates such as `count(...)` and `on_table(...)` still keep their existing parentheses form, and the parser remains backward-compatible with older saved action syntax.
- Reaction tiles now use a left-edge dotted drag gutter and place the delete `X` beside the script button instead of floating it above the card.
- The editor now exposes a separate subreddit-configured `Scripting Help Page URL`. Reaction widgets link to it from the script editor, the text reaction editor shows it under the expand/compact control, and the element counter help icon now opens scripting help. The `Authors Help` link moved next to the `Realm Info` heading.
- The editor meta area now uses a two-column realm-info layout on wide screens, keeps validation in a sticky narrow plank at the top of the editor column, and merges `Starting Elements` / `Advanced Options` into one shared tabbed panel.
- Counter-marked elements remain editable in the general element list for icon/name/style changes, but they are treated as non-gameplay elements by validation and script authoring.
- Elements can be marked `non-consumable`; those elements stay on the table after successful reactions unless a script explicitly removes them.
- Non-consumable outputs are now single-copy on the table: if one already survives a reaction, duplicate emitted copies are silently suppressed unless the same reaction removed the existing copy first.
- Scripted `message "..."` actions now render as a dismissible in-game bubble near the options cog, and successful reactions clear or replace that bubble instead of using the Reddit system toast.
- Scripted `popup "..."` actions render queued blocking modals, while scripted `win "..."` and `lose "..."` actions render blocking end-state screens with reset and realm-list navigation actions.
- Realms can hide the palette for quest-like play. In that mode the game removes the footer palette entirely and seeds starter elements onto the table in a circular layout around the viewport center on first load and reset.
- Custom realm titles now only appear inside the authored intro card; after the first successful reaction dismisses that intro, both the intro text and realm name stay hidden in the background.
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

## Documentation Convention

- Assistant responses that reference repo files should use absolute local links with a leading slash, for example `[ModEditorApp.tsx](/b:/Reddit/alchemygame/src/mod-editor/ModEditorApp.tsx#L1727)`, so the UI opens the local file instead of treating the path as a web URL.

## Current Known Verification Note

- `npm run type-check` passes after the current splash and gameplay updates.
- `npm run test -- post` passes after making the default custom-post entrypoint explicit and covering Web entry selection in server tests.
- `npm run test -- splash` passes after updating the inline splash CTA coverage.
- `npm run test -- reaction-script-autocomplete` passes after the editor token-commit auto-add flow update.
- `npm run test -- reaction-script` passes after adding preserved `//` comment support to the parser/formatter.
- `npm run test -- draft` passes after adding reaction-text comment metadata round-tripping.
- `npm run test -- runtime` passes after the single-copy non-consumable runtime filter.
- `npm run test -- mods` passes after the share-post reuse-on-republish change.
- The shared realm splash CTA change does not have dedicated automated coverage yet.
