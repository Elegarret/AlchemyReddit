---
name: manual-legacy-mod-porting
description: Convert old alchemygame.ru JSON mods into importable Reddit Alchemy realm JSON by manually authoring a polished port. Use when the user asks for legacy mod conversion, old Alchemy Game JSON migration, or a manual port instead of a scripted converter.
---

# Manual Legacy Mod Porting

Use this skill when a legacy `alchemygame.ru` mod needs to become a modern Reddit Alchemy realm without relying on a generic conversion script.

## Goal

Produce a valid `SaveDraftInput` JSON payload that the editor can import through `parseImportedDraftText`, while preserving the original mod's progression and improving weak wording where needed.

## Workflow

1. Read the legacy JSON and inventory:
   - starters from `inits`
   - all referenced element names from reaction inputs and outputs
   - scene-state tokens such as directions, locations, exits, wounds, menus, and quest flags
   - narrative text from `messages`
   - multi-ingredient reactions that cannot map 1:1 to binary reactions
2. Lock one canonical English name per legacy concept before writing reactions.
   - Keep names under the editor's limits.
   - Remove ambiguity and typos.
   - Normalize obvious legacy duplicates or typo variants into one canonical name.
3. Choose the realm shape.
   - Use `showPalette: false` for story/quest mods where starters should live directly on the board.
   - Use normal palette play only when the legacy mod behaves like freeform discovery.
4. Author elements first.
   - Give every player-facing element its final English name.
   - Prefer real emoji icons whenever a stable, recognizable emoji fits the element.
   - Choose the emoji for the element's role in context, not just the surface word.
     Verb/action elements should read like actions or choices, people should look like characters, places like locations, and materials like materials.
   - Do not assign object emojis to action tokens just because the English translation is a bare verb.
     Example: `Drink` in a lake scene is an action choice, not a cup.
   - Fall back to a plain first-letter glyph only for truly abstract or internal state tokens that do not have a useful emoji.
   - Carry over useful lore into `element.message`.
   - Use the legacy class family only as a rough color hint; exact visual parity is not required.
5. Port reactions manually.
   - Binary legacy reactions can be authored directly or as scripts.
   - Legacy outputs that remove things, clear the table, show narration, kill the player, or depend on extra state should become scripted reactions.
   - Multi-ingredient legacy reactions must become one binary trigger plus explicit `count(...)` guards and manual `remove ...` actions for extra ingredients.
   - When one guard condition needs multiple recovery or setup actions, prefer one grouped conditional such as `if (count(Key) < 1) add Left; add Right; stop` instead of repeating the same `if (...)` line.
6. Validate the import payload.
   - The final artifact must parse through `parseImportedDraftText`.
   - The parsed draft must also satisfy `saveDraftInputSchema`.
   - Duplicate reaction pairs are invalid and must be merged or re-authored onto unique binary trigger pairs.
7. Write a compatibility report beside the final JSON.
   - Explain every compatibility-driven rewrite category.
   - Call out multi-input rewrites, duplicate-pair merges or re-pairings, narrative adaptations, and any unfinished-branch handling.
   - Include concrete examples from the finished realm.

## Authoring Rules

- Prefer polished-but-faithful adaptation.
  Keep structure, progression, and outcomes. Improve grammar, clarity, and naming.
- Prefer current engine affordances over literal legacy artifacts.
  Use `message`, `popup`, `win`, and `lose` instead of carrying dead-end placeholder elements when that produces clearer play.
- Use hidden state elements when the original mod tracked story state through temporary board items.
  Examples: quest notes, exits, room states, injury states, fair/battle phases.
- Use `nonConsumable` only when an element should persist across reactions by default.
  Do not mark story-state elements non-consumable unless that persistence is intentional.
- Keep duplicate outputs only when quantity matters for gameplay.
  If repeated adds are just legacy noise, collapse them.
- If the legacy mod has unfinished branches, keep them readable.
  Convert silent broken dead ends into a deliberate cliffhanger or a clear unresolved stop.
- Prefer semantically readable emoji over decorative variety.
  Reuse the same emoji for related state variants when that keeps the realm legible.
- When an element is a scene choice or state flag, prioritize clarity over literalness.
  A navigation arrow or status icon is usually better than a misleading prop.

## Multi-Ingredient Strategy

- The current runtime is binary-only at authoring time.
- Choose one binary trigger pair that is both unique and intuitive for the player.
- Guard the missing ingredients with `if (count(Name) < N) stop`.
- Manually `remove Name` for every extra consumed ingredient that is not part of the authored pair.
- If a legacy mod contains multiple reactions that would collapse onto the same binary pair, do not rely on duplicate authored reactions.
  Either merge them into one conditional script or move each branch to a different binary pair.

## Validation Checklist

- Import path: [src/mod-editor/draft.ts](/b:/Reddit/alchemygame/src/mod-editor/draft.ts)
- Schema: [src/modding/types.ts](/b:/Reddit/alchemygame/src/modding/types.ts)
- Runtime duplicate-pair validation: [src/modding/runtime.ts](/b:/Reddit/alchemygame/src/modding/runtime.ts)

Before finishing:

- Confirm every `startingElementId` exists.
- Confirm every reaction pair is unique after left/right normalization.
- Confirm all element names are already English and final.
- Confirm no reaction references a missing element ID.
- Confirm the JSON imports as a `SaveDraftInput`, not only as a published `ModDoc`.
- Confirm a `compatibility-report.md` exists beside the final realm JSON and explains what changed for compatibility and why.
