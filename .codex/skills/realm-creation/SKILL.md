---
name: realm-creation
description: Design, revise, and validate Reddit Alchemy realms authored as reaction text or importable realm JSON. Use when Codex needs to create a new realm, reshape progression, tighten scene flow, improve combat or counters, add quest guidance, or translate a rough concept into a coherent realm type. Supports multiple realm families; currently includes the full workflow and patterns for adventure realms, and is structured to expand later for escape room, farm, labyrinth, and other realm types.
---

# Realm Creation

## Overview

Author realms as game structures, not as loose reaction lists. Start from the realm type, lock the progression shape, then write scenes, inventory systems, encounter rules, and narrative guidance so the board reads like a playable game.

## Workflow

1. Identify the realm family before authoring.
   - Use [references/adventure.md](references/adventure.md) for story-first, scene-based progression realms.
   - If the request is for another family such as escape room, farm, or labyrinth, keep the generic workflow here and add a sibling reference file for that family instead of overloading the adventure guide.
2. Lock the progression spine before writing flavor.
   - Define the player role, the opening state, the main goal, the midgame unlocks, and the fail/win loops.
   - Decide which systems use counters, which use carried non-consumables, and which are just transient scene props.
3. Author the scene graph.
   - Treat locations as authored scenes entered through `Viking + Location` style reactions.
   - Use `remove_all` for scene swaps.
   - Use a hidden current-location counter when forced encounters or traps must restore scene exits afterward.
4. Author world systems in layers.
   - Resource gathering
   - Crafting/building menus
   - Combat
   - Healing/rest/status
   - Quest guidance
5. Keep player-facing text in scripts.
   - Prefer `message`, `popup`, `win`, and `lose` over static element descriptions.
   - Make NPC guidance milestone-based rather than chatty.
6. Validate both structure and playability.
   - Confirm unique binary pairs.
   - Confirm all hidden-state counters are written on every relevant scene entry.
   - Confirm recoverability after death, scene locks, and boss resolution.

## Realm Type Structure

Keep this skill expandable by separating:

- **Generic workflow in this file**: type selection, progression design, validation rules, and shared engine conventions.
- **Type-specific references**: one file per realm family.

Use this naming pattern for future expansion:

- `references/adventure.md`
- `references/escape-room.md`
- `references/farm.md`
- `references/labyrinth.md`

Each type file should define:

- board structure
- progression shape
- hidden-state patterns
- resource/inventory conventions
- encounter or puzzle style
- guidance style
- validation checklist

## Validation

Before finishing a realm:

- Confirm the authored type guide was followed consistently.
- Confirm counters are used only where quantity or hidden state truly matters.
- Confirm non-consumables are reserved for persistent carried items, status, or intentional survivors.
- Confirm scene exits, menus, and forced-encounter restores are deterministic.
- Confirm progression hints point to the next important milestone, not every possible action.
- Confirm the realm can be explained in one short golden-path walkthrough.
