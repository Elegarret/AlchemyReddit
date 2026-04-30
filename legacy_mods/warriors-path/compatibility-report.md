# Warrior's Path Compatibility Report

This report records the compatibility-driven changes made while porting the legacy mod into an importable Reddit Alchemy realm.

## Summary

- Legacy reactions: `79`
- Final authored reactions: `79`
- Multi-input legacy reactions rewritten for binary runtime: `21`
- Scripted authored reactions: `79`
- Explicit `lose` outcomes added: `7`
- Explicit narrative `popup` stops added: `3`
- Starting elements kept on the board with `showPalette: false`

## What Changed

### 1. Legacy 3+ input reactions became binary reactions with script guards

The current realm format only supports authored binary reactions, so every legacy reaction with 3 or more inputs was rewritten as:

- one binary trigger pair
- one or more `if (count(... ) < N) stop` guards
- explicit `remove ...` calls for extra consumed ingredients
- normal scripted `add`, `remove`, `message`, `popup`, or `lose` actions

Examples:

- Legacy `Воин + Острая палка + Стражник`
  became `Warrior + Sharpened Stick` with `if (count(Guard) < 1) stop`
- Legacy `Боец + Инструмент + Гвозди + Доска + Доска + Доска`
  became `Tools + Nails` with:
  - `if (count(Fighter) < 1) stop`
  - `if (count(Board) < 3) stop`
  - three explicit `remove Board`
- Legacy `Боец + Скелет-мечник + Скелет-мечник + Скелет-лучник`
  became `Fighter + Skeleton Swordsman` with:
  - `if (count(Skeleton Swordsman) < 2) stop`
  - `if (count(Skeleton Archer) < 1) stop`

### 2. Duplicate binary collisions were reassigned to unique trigger pairs

Several different legacy recipes would collapse onto the same binary pair after removing extra inputs. The runtime rejects duplicate reaction pairs, so those branches were reassigned to distinct binary triggers.

Collision families that had to be separated:

- `Воин + Старик` produced `4` legacy branches
- `Воин + Поручение` produced `2` legacy branches
- `Воин + Жажда нагрождения` produced `2` legacy branches
- `Боец + Инструмент` produced `2` legacy branches

Examples of the final reassignment:

- `Воин + Старик + Тайная дверь`
  became `Warrior + Secret Door`
- `Воин + Старик + Вернуться к клеткам`
  became `Warrior + Return to the Cells`
- `Воин + Старик + Дорога вперед`
  became `Warrior + Path Ahead`
- `Воин + Поручение + Выход из кузници`
  became `Warrior + Exit the Forge`
- `Воин + Поручение + Торговец`
  became `Warrior + Merchant`
- `Воин + Жажда нагрождения + Кузница`
  became `Payment Due + Forge`
- `Воин + Жажда нагрождения + Кузнец`
  became `Payment Due + Blacksmith`
- `Боец + Инструмент + Доска`
  became `Tools + Board`
- `Боец + Инструмент + Гвозди + Доска + Доска + Доска`
  became `Tools + Nails`

### 3. Death placeholders were replaced with explicit loss states

The legacy mod used a reusable `Смерть` element as a generic dead-end result. In the port, fatal branches were rewritten into explicit `lose` actions with player-facing text.

This removed the need to rely on a lingering `Death` state element for gameplay progression.

Examples:

- cave dragon branch
- swimming in the lake
- attacking the prison guard unprepared
- freeing the ogre
- trusting the friendly-looking prisoner
- striking the enraged guard in the wrong place

### 4. Narrative text moved into modern script actions

Legacy flavor text was redistributed into:

- element `message` text for discovered scenes and objects
- per-reaction `message` lines for short branch feedback
- blocking `popup` lines where the story needed a clearer authored stop

This keeps the realm readable in the modern UI without depending on legacy message semantics.

### 5. The realm was authored as a quest board, not a palette realm

The old mod behaves like a guided adventure rather than freeform crafting, so the port uses:

- `showPalette: false`
- starter elements seeded directly onto the board
- scripted scene cleanup to move the story between locations

### 6. Repetitive or noisy legacy outputs were normalized

The legacy data often re-added carrier elements or repeated results mechanically. The port kept duplicates only where quantity mattered to progression and normalized the rest where they were just state noise.

Examples:

- mass enemy spawns in the battle branch were preserved because quantity matters
- menu-like scene carriers were kept only where they were needed for navigation
- fatal branches no longer add a separate `Death` output in addition to killing the player

### 7. One incomplete legacy branch was turned into an intentional cliffhanger

The house branch ends abruptly in the source. In the port it remains reachable, but now resolves into a clear authored cliffhanger instead of a silent broken dead end.

Final authored behavior:

- entering the house triggers a `popup`
- the table is cleared with `remove_all`
- the branch leaves `Room 1`, `Room 2`, `Severe Wound`, and `Fighter` on the board
- the text explicitly states that the old story ends before the medkit can be found

### 8. Canonical English naming was locked before reaction authoring

All player-facing names were translated and normalized into a single canonical English naming set before scripting.

Examples:

- `Воин` -> `Warrior`
- `Боец` -> `Fighter`
- `Жажда нагрождения` -> `Payment Due`
- typo/case variant `Рыцари Смерти` was normalized into the same canonical concept as `Рыцари смерти` -> `Death Knights`

## Validation Outcome

The final `draft.json`:

- imports through the editor import path
- passes `saveDraftInputSchema`
- passes `validateModDraft`
- avoids duplicate normalized reaction pairs
