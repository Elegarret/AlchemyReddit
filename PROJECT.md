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
- `src/mod-catalog.tsx`: full realm catalog/mod listing view
- `src/mod-catalog-compact.tsx`: compact fixed-layout realm catalog view

## Frontend Structure

- `src/game/GameApp.tsx`: main gameplay screen logic and rendering
- `src/game/playtest.ts`: playtest ruleset loading from local storage
- `src/game/types.ts`: gameplay UI types
- `src/game/visuals.ts`: snow/background visual generators
- `src/MarkdownBody.tsx`: shared markdown renderer for authored long-form UI copy
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
- `src/server/core/mods.ts`: mod draft, publish, share, cached catalog ranking, and removal logic
- `src/server/core/post.ts`: Reddit post integration helpers
- `legacy_mods/`: manual AI-authored ports of legacy `alchemygame.ru` mods plus their original source JSON references and compatibility reports
- `.codex/skills/manual-legacy-mod-porting/`: repo-local Codex skill for future legacy mod migrations without reviving a scripted converter

## Key Flows

- Game progress is stored locally per ruleset and synced to Reddit progress for non-playtest sessions.
- Programmatic post creation is Devvit Web-only: new `reddit.submitCustomPost()` flows must target named `devvit.json` entrypoints (`default`, `game`, `mod-catalog`, `mod-splash`, etc.) and must not reintroduce Blocks-era APIs, config, or splash fields.
- Moderator subreddit menu actions can now create the full `mod-catalog` post, the default compact `mod-catalog-compact` post, or a featured-tab compact post via `mod-catalog-compact-featured`, so catalog UX variants stay separate.
- Mod realms now expose authored counters with min/max/initial values in both the editor and the game. Counter values persist locally per ruleset, reset to authored initial values, clamp during scripted updates, and now persist a separate shown/hidden panel state per ruleset.
- Playtest sessions use `PLAYTEST_RULESET_STORAGE_KEY` in local storage and bypass Reddit progress syncing.
- Editor saves persist draft data through tRPC, then publish/share actions operate on the saved draft id.
- Published realms can be shared to a Reddit post and reopened from the game/options flow for authors.
- Publishing updates now reuses an existing realm share post when available and refreshes that post body instead of creating a fresh Reddit post. Share-post IDs are normalized server-side so republish/edit/delete flows keep working even if Reddit returns bare post IDs.
- Republished realms keep their original `publishedAt` timestamp and New catalog position while still updating `updatedAt` for latest-update metadata.
- Published realm player counts only increment when the expanded `game` view loads a published realm; opening inline splash views reads the current count without recording a player.
- Published realm completion counts are unique per user and increment when a non-playtest realm reaches a scripted `win` screen or all gameplay elements have been discovered. The subreddit setting `completionCountersPublic` controls visibility: disabled/default means moderator-only API responses, enabled means public counters.
- Published custom realm win/lose and all-elements-complete screens prompt signed-in players to leave an authored Reddit comment review on the realm share post. Successful review submission opens a follow-up prompt encouraging players to upvote the Reddit post from Reddit itself.
- Inline splash entrypoints cache their last rendered state in session storage and revalidate on `window.focus`, which keeps return-from-game popup closes from falling back to a visibly cold inline reload.
- The inline splash now routes its secondary CTA to the realm catalog (`Alchemy Hub`) instead of opening a fresh editor directly.
- The compact realm catalog is a fixed single-view screen with `Featured` / `Best` / `New` tabs, capped to 8 realms per tab in a 2x4 grid, and conditionally adds `My Realms` for signed-in users who have created realms. It keeps realm creation as a compact header action instead of a separate section. Separate compact entrypoints can open directly to public tabs. Moderators can mark published realms as featured from the full catalog admin view; featured realms show an editorial-choice star in catalogs and realm splashes.
- Catalog ranking is now cache-first on the server. Published realms keep a per-realm Redis rank cache (`upvotes`, `playerCount`, `bestScore`, `lastSyncedAt`) plus derived indexes for `Best`, `Featured`, and admin-visible `All`. The cache freshness target for vote-based ranking is 15 minutes, and the cached `bestScore` is now a bounded `0-100` rating derived from Reddit net score with player-count dampening.
- `Best` no longer comes from loading a bulk catalog payload and sorting it in the client. The server reads a cached Redis best-score zset, refreshes only a top candidate window when entries are stale, and returns the top requested realms from that index.
- `New` continues to use the existing published catalog zset ordered by original `publishedAt`, so republishing edits do not bump a realm back to the top.
- `Featured` now reads from a dedicated featured-membership index on the server and still returns a randomized subset for the compact hub rather than a deterministic sort.
- The full catalog `All` section now pages and searches on the server instead of fetching one large array and slicing/filtering in the browser. Public `All` pages the published catalog index and searches title/owner prefixes; moderator `All` pages a dedicated admin index that keeps published realms first, then hidden/draft realms by latest update.
- The shared realm splash swaps its secondary CTA to `Edit Realm` for the realm author or moderators/admins and preloads that realm into the editor; other viewers still get `Create My Realm`. Its primary CTA now changes to `Continue...` when that realm already has saved local or Reddit-backed progress for the active ruleset.
- Authored intro text plus authored element-message and scripted `popup` / `win` / `lose` bodies now render through the shared markdown renderer with visible line breaks. Titles and short summaries/descriptions remain plain text only.
- The mod editor now supports clipboard `Export JSON` and paste-based `Import JSON`, both tucked under the round three-dots realm action menu along with `Realm Page`. Export writes the full editor realm payload including reaction comments, while import accepts either that payload or published `ModDoc` JSON and always hydrates a new unsaved draft after stripping server-owned metadata.
- The full catalog keeps `Best` and `New` published-only, while the `All` section switches to a moderator/admin dataset for moderator users. That admin dataset is backed by a global realm index plus the existing published catalog index, so it includes all published realms plus indexed draft/hidden realms; older draft-only or hidden realms appear after their next save-like action because no historical global index existed for them.
- The `All` section admin edit action uses the same `alchemy-editor-target-mod-id` handoff and `getDraft` load path as the in-realm `Edit Realm` action.
- Moderator/admin realm edits preserve the original author and save into the author's single current draft slot. Realm listings derive one item per realm from that current draft plus published metadata, and cleanup opportunistically removes stale historical draft-owner entries. Complete realm deletion removes the latest record, all indexed drafts, metadata/indexes, player counts, and the share post when possible.
- Mod reactions can optionally carry per-reaction script text. Non-empty scripts override `outputIds` at runtime, and the editor validates script lines inline plus during overall draft validation.
- Reaction script syntax now canonically uses `add`, bracket-less action forms such as `set health += 1`, `message "..."`, `popup "..."`, `win "..."`, and `lose "..."`, plus condition predicates like `not_discovered(...)` and `count(...)` comparisons. `count(Counter)` reads a counter value, while `count(Element)` in reaction scripts reads the amount of that element on the table. The per-reaction textarea exposes lightweight local autocomplete for those token families, while the full text editor serializes valid scripts back out in canonical form.
- Reaction scripts and the full reaction-text editor now support `//` comments outside quoted strings. Script beautifying preserves comment lines and trailing comments, and comment-only script bodies do not count as active scripted overrides.
- Full reaction-text comments persist through save/load and visual/text mode switches via editor-only `reactionComments` metadata stored alongside reactions. That metadata must stay out of gameplay/runtime behavior and out of the published fingerprint.
- `remove` now accepts comma-separated targets and removes one matching table instance per listed gameplay element in order; for counters it hides each listed counter chip. `remove_all` supports both `remove_all ElementName` to clear one element kind and a bare `remove_all` form that clears consumable table elements while preserving non-consumables. Counter visibility is separate: `add CounterName` shows a counter chip, `remove CounterName` hides it, and `remove_all CounterName` remains invalid.
- The full-text reaction editor now opens expanded by default when authors switch into text mode, can compact back to the split layout, autocompletes top-level `A + B =` reaction lines, and falls through to standard script autocomplete on indented lines.
- The full-text reaction editor supports grouped empty reaction headers such as `A+B=, C+D=` followed by one indented shared script body; the shorthand expands to separate normal reactions.
- The full-text reaction editor now supports an optional top declaration block for `starters:`, `counters:`, and `nonconsumables:`. Those lines round-trip with the visual editor, may be followed immediately by reactions or by a blank line, must stay in one contiguous block at the top, and `counters:` supports optional `min=` / `max=` bounds while still requiring `initial=`.
- The full-text reaction editor now supports top-level counter `event` blocks. Event autocomplete offers `event` first, mode names after `event `, and counter-name expression suggestions after the event colon. Event conditions are counter-only numeric comparisons such as `Health <= 0` or `Health < MaxHealth`, joined by `and`; legacy `count(Health)` event conditions still parse for saved realms. Event bodies reuse reaction script actions, can use event-only `stop-reaction`, and support `crossing` / `once` / `always` repeat modes. Events are saved with drafts/mods but have no visual editor authoring UI.
- The full-text reaction editor now supports top-level `function Name:` script blocks plus `call Name` actions. Functions are saved with drafts/mods, run inline from reaction or event scripts, contribute emitted elements to reachability, reject recursive call graphs, and are intended for reusable no-return script snippets.
- Reaction script numeric expressions now support counter reads and random integers in addition to integer literals. `set Score += Money`, `set Luck += random(-5,5)`, and conditions such as `if (random(100) < 33) add Spark` are valid. Event headers use the same numeric comparison parser but must reference at least one counter and cannot use table/discovery predicates.
- Reaction script and full reaction-text editors no longer auto-create elements while typing. Unknown names stay as validation issues until authors explicitly add them from inline/script validation, the main validation plank, or the post-paste `Add all` popup.
- Element names reject reserved reaction/script syntax characters such as `+`, `,`, `=`, `:`, `(`, `)`, and `"` during authoring. New auto-created names are also normalized away from reserved scripting prefixes like `add` or `set`, and publish-time validation blocks any stale invalid names that slip in from older data.
- Post-paste missing-element detection in both code editors parses complete `popup "..."`, `win "..."`, `lose "..."`, legacy popup-call syntax, and element-predicate calls safely, so closing syntax like `)` is not folded into suggested new element names.
- Name autocomplete now replaces the whole current token when accepted mid-word in either script mode or the full reaction-text editor, so accepting `sand` inside `sand` no longer produces duplicated suffixes like `sandnd`.
- Reaction script actions now use bracket-less canonical syntax in the editor and formatter: `set counter += 10`, `message "Text"`, `popup "Text", Icon`, `win "Text"`, and `lose "Text"`. Condition predicates such as `count(...)` and `on_table(...)` still keep their existing parentheses form, and the parser remains backward-compatible with older saved action syntax.
- Reaction scripts now support grouped conditionals with either semicolon action lists (`if (condition) action; action`) or colon blocks (`if (condition):` followed by indented actions). Multi-action groups format to the colon block form and evaluate their condition once before the group runs.
- Reaction tiles now use a left-edge dotted drag gutter and place the delete `X` beside the script button instead of floating it above the card.
- The editor now exposes a separate subreddit-configured `Scripting Help Page URL`. Reaction widgets link to it from the script editor, the text reaction editor shows it under the expand/compact control, and the element counter help icon now opens scripting help. The `Authors Help` link moved next to the `Realm Info` heading.
- The editor meta area now uses a two-column realm-info layout on wide screens, keeps validation in a sticky narrow plank at the top of the editor column, and merges `Starting Elements` / `Advanced Options` into one shared tabbed panel.
- Counter-marked elements remain editable in the general element list for icon/name/style changes, but they are treated as non-gameplay elements for ingredients, outputs, reachability, and discovery. Counters may also appear in authored starters as panel-only starter counters.
- Mod elements now store explicit icon state via `iconSource: 'emoji' | 'image' | 'none'` plus the corresponding `emoji` or Reddit-hosted `imageUrl`. Legacy JSON that only carries `emoji` still imports and parses as `iconSource: 'emoji'`.
- Mod elements still support emoji, uploaded-image, and no-icon states end-to-end, but the editor currently hides the image/no-icon controls behind the temporary `SHOW_CUSTOM_ELEMENT_ICON_EDITOR` flag in [src/mod-editor/components.tsx](/b:/Reddit/alchemygame/src/mod-editor/components.tsx#L111). With that flag off, authors only see the legacy emoji picker UI while the upload/no-icon plumbing remains available for later restoration.
- Realms can store an optional Reddit-hosted `coverImageUrl`; the editor uploads a cropped wide banner cover, save/publish/import/export preserve it, and the shared realm splash renders it as a dimmed top background with the catalog art fade.
- Elements can be marked `non-consumable`; those elements stay on the table after successful reactions unless a script explicitly removes them.
- Non-consumable outputs are now single-copy on the table: if one already survives a reaction, duplicate emitted copies are silently suppressed unless the same reaction removed the existing copy first.
- Scripted `message "..."` actions now render as a dismissible in-game bubble near the options cog, and successful reactions clear or replace that bubble instead of using the Reddit system toast.
- Scripted `popup "..."` actions render queued blocking modals, while scripted `win "..."` and `lose "..."` actions render blocking end-state screens with the same realm review prompt used by completion screens.
- Completing all non-counter elements in a realm shows a once-per-progress-scope celebration popup.
- Realms can hide the palette for quest-like play. In that mode the game removes the footer palette entirely and seeds starter elements onto the table in a circular layout around the viewport center on first load and reset.
- Realms can enable `compactElements` from the editor's Advanced Options. The setting defaults off, persists with drafts/published mods/imports/playtests, and makes regular board tiles use the same compact visual size as palette tiles.
- Board-only no-icon elements render as horizontal text planks with rectangular hit/merge footprints, while palette tiles, editor previews, and modal cards stay square and simply omit the icon art.
- Draft saves and playtest now allow reactions with more than 8 outputs, but publish still blocks on that rule and surfaces it as a warning instead of a save-blocking validation error.
- Playtest now shows every authored counter on the counter panel. Counters that are currently hidden in normal gameplay render at half opacity there and expose a hover hint explaining that they are visible only in playtest mode.
- Custom realm titles now only appear inside the authored intro card; after the first successful reaction dismisses that intro, both the intro text and realm name stay hidden in the background.
- The mod editor emoji picker uses a self-hosted dataset at `public/emoji-data.json`, sourced from `emoji-picker-element-data/en/emojibase/data.json` via `npm run sync:emoji-data`.
- The emoji picker follows `prefers-color-scheme` by default, so it renders in light or dark mode to match the rest of the app instead of forcing dark mode.

## TODO
- game, bug: hit shows "element-1-2" instead of real element's name like Water
-* editor: make the full-text script a source of truth
- - Viking+Block=, Block+Eikthyr= converts to 2 separate reactions

## Future Plans

- featured mods, section on the main page, choose 5 random featured every time
- Advanced realm settings:
- - inventory-style palette. Opened elements don't get there automatically, only by special script action. Same elememnts must stack there, i.e if stone was added twice, display as stone and (2) in the corner. Elements are not permamnet there, they being consumed when dragged out.
- add user profiles
- improved saves backward compatibility, do not wipe after every realm edit
- plan: convert current hardcoded reactions set into the realm + replace all paths leading to old hardcoded game so the realm must open instead of hardcoded game. But that hardcoded realm must have no difference in expirience with the old one. It must also catch up saves from the hardcoded ga,e
- game: multi-element reaction, by rect-select

## Commands

- `npm run type-check`: required after changes
- `npm test -- my-file-name`: targeted test execution
- `npm test`: full test suite
- `npm run sync:emoji-data`: refreshes `public/emoji-data.json` from the installed official emoji dataset
- Legacy `alchemygame.ru` migrations are now manual AI-authored ports.
- The target artifact is an importable `SaveDraftInput` JSON payload that passes the editor import path in `src/mod-editor/draft.ts`.
- Reference inputs and final ports live under `legacy_mods/`.
- Each finished port should also include a compatibility report describing how legacy mechanics were adapted to the current runtime.

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
- `npm run test -- mod-splash.test.tsx mod-catalog.test.tsx draft.test.ts ModEditorApp.test.tsx MarkdownBody.test.tsx src/server/core/mods.test.ts` passes after the realm resume CTA, markdown, import/export, and admin tooling updates.
- `npm run test -- mod-catalog.test.tsx ModEditorApp.test.tsx src/server/core/mods.test.ts` passes after folding admin-visible realms into the `All` catalog section and moving utility actions under the round three-dots editor menu.
