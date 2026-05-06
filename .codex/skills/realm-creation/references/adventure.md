# Adventure Realm Patterns

Use this guide for story-first, scene-based realms like the polished Valheim Meadows realm.

## Core Model

Build the realm like a small adventure game:

- one clear protagonist element
- authored scenes entered through navigation reactions
- carried inventory that survives scene swaps
- hidden counters for state and progression
- milestone guidance from an NPC or narrator
- explicit fail, recovery, and boss-resolution loops

Do not treat an adventure realm like a freeform alchemy sandbox.

## Scene Structure

Use scenes as the main board unit.

- Every location entry should start with `remove_all`.
- Re-add only the elements that belong to that scene.
- Keep the player and carried non-consumables persistent through the runtime's non-consumable behavior.
- Use one hidden `Location` counter as the current-scene register when future reactions must restore the correct exits.

Good adventure scenes usually fall into these roles:

- hub scene
- branch scene
- resource scene
- camp/base scene
- locked encounter scene
- boss scene

## Progression Shape

Design the golden path first:

1. arrival and first guidance
2. local exploration
3. first resource loop
4. first tool unlock
5. first combat prey/predator
6. base or camp establishment
7. ranged or advanced unlock
8. quest token acquisition
9. preparation state
10. boss or chapter end

Side systems should reinforce this path, not compete with it.

## Counters vs Elements

Use counters for:

- stackable resources such as `Wood`, `Stone`, `Flint`, `Leather`, `Arrows`
- hidden current-scene state such as `Location`
- boss stats and other hidden combat state such as `Boss_Health` and `Boss_State`

Use non-consumable elements for:

- protagonist
- carried weapons/tools
- carried food
- visible status that should persist on the board such as `Rested`
- boss entities that should stay visible during a fight

Use normal scene elements for:

- locations
- exits
- gatherable props like `Branch`, `Rock`, `Flint Shard`
- enemies
- temporary menus
- combat tells

Do not use the same concept as both a counter and a normal element. Use proxy pickups:

- `Rock` -> `Stone`
- `Flint Shard` -> `Flint`
- `Branch` -> `Wood`

## Inventory and Menus

Adventure realms read better when interaction happens through world objects instead of abstract UI.

Recommended pattern:

- `Viking + Workbench` reveals craft options
- `Viking + Build` reveals structure options
- menu choices are separate elements from their outputs

Examples:

- `Craft Bow` is not `Bow`
- `Build Bed` is not `Bed`

This avoids prematurely discovering finished items just by opening a menu.

## Guidance NPC

Use one guidance reaction with a short milestone ladder.

Keep it to the next 6-8 important progression checkpoints:

- explore
- find camp site
- build workbench
- craft key tool
- unlock hunting/combat upgrade
- obtain quest token
- prepare with bed/rest
- summon or finish chapter

The guidance reaction should point at the next milestone only. Avoid broad hint spam.

## Combat Patterns

Use different combat depth for different enemy tiers.

### Basic enemy

Use weapon-specific reactions for simple prey or roaming enemies.

- bare hands are possible but costly
- wrong weapon can win but at worse health cost
- ranged weapons should check ammo explicitly
- reward outputs can include both loot and counter increments

### Forced encounter

When an encounter locks the player in a scene:

- spawn the enemy from a world interaction
- remove exits
- do not overwrite the hidden `Location` counter
- restore exits after the enemy dies by branching on `count(Location)`

### Boss fight

Prefer a visible telegraph + hidden state machine.

- visible elements show the current boss tell
- hidden counters store boss health and boss state
- different weapons/actions are better in different states
- defensive actions should meaningfully change the next state
- the boss should not feel like a larger boar

For reusable boss authoring:

- use generic names like `Boss_Health` and `Boss_State`
- keep the boss entity itself specific, like `Eikthyr`

## Healing and Preparation

Layer recovery so it supports progression:

- berries = light field recovery
- cooked meat = meaningful heal
- bed/rested = pre-boss preparation or once-per-cycle reset

Preparation should matter before major encounters. Use quest guidance to teach that.

## Good Changes To Reuse

These are the strongest patterns from the polished Valheim realm and should carry into future adventure realms:

- replace vague location hopping with a real scene graph
- make the map feel larger by using nested locations rather than one flat biome screen
- use hidden `Location` state so forced fights restore the exact scene exits
- separate pickup props from resource counters
- make carried items persistent through non-consumables
- make NPC hints milestone-based and sparse
- use camp/workbench interactions as the hub for build/craft progression
- make regular enemies weapon-aware and ammo-aware
- make bosses stateful and telegraphed instead of simple damage sponges
- keep all flavor text in scripts rather than static element descriptions

## Validation Checklist

- Every location-entry reaction writes the correct hidden `Location` state.
- Every forced encounter restores the right exits.
- Every counter-backed resource has a distinct pickup prop if it is gathered from scenes.
- Menu option elements are distinct from the items they create.
- Carried food and weapons survive scene swaps as intended.
- Death resets the scene cleanly and drops only the intended items.
- Boss fights expose visible tells and change hidden state correctly.
- Hints never skip the intended next milestone.
