# Reaction Script Tutorial

## 1. Basics

Every reaction can use a script instead of fixed output elements.
If the script box is empty, the reaction uses its normal outputs. Otherwise the script takes over.

A normal reaction always makes the same outputs:

```
Fire + Water = Steam
```

A scripted reaction can ask questions first, choose different outputs, remove things from the table, show text, or end the realm.

```
Open + Chest:
    add Coin
    message "The old rusty coin lies inside the chest."
```

These examples use the full text editor format. If you are typing inside a single reaction's script box, write only the script lines:

```
add Coin
message "The old rusty coin lies inside the chest."
```

### How Scripts Run

Scripts are executed from top to bottom. Think of it as a list of actions. You can also add conditions to the actions. Each line does one thing. You can put `if (...)` before a line to make only that one action conditional:

```
Open + Chest:
    add Chest
    if (discovered(Key)) add Coin
    if (not_discovered(Key)) message "The chest is locked."
```

In that example, the player gets the chest back either way. They receive the coin only if `Key` was found earlier; otherwise they see a failure message.

If you want several actions to depend on `Key`, write the condition on each line. There are no multi-line `if` blocks.

```
if (discovered(Key)) add Coin
if (discovered(Key)) add Old Map
if (discovered(Key)) message "The chest creaks open and you take out its contents."
```

### Autocomplete

The script editor has autocomplete for commands, element names, and common script patterns. It makes writing scripts faster and less typo-prone.

Start typing a word like `add`, `popup`, `on_table`, or an element name, then accept a suggestion from the popup.

Unknown names are not created automatically while you type. If you write a name that does not exist yet, the editor shows a validation issue and lets you explicitly add it.

### Actions In One Minute

Actions tell the game what to do.

Create elements. Use the `add` command for one or more elements. A single bare element name also works as shorthand for `add`.

```
add Gold Coin, Old Map
Smoke
```

Remove one element from the table:

```
remove Key
```

Remove all copies of one table element:

```
remove_all Smoke
```

Clear the table:

```
remove_all
```

Show a small text bubble near the top of the screen:

```
message "The gears click into place."
```

Show a big blocking message popup. You can add an element name after the comma to use that element as the popup icon:

```
popup "A hidden compartment opens."
popup "A hidden compartment opens.", Key
```

End the realm. After this, the player can exit the game or start it over:

```
win "You restored the realm.", Crown
lose "The reactor melts down.", Broken Core
```

### Conditions In One Minute

Conditions answer yes/no questions.

Check the table right now:

```
if (on_table(Dragon)) lose "The Dragon burns you to ashes.", Fire
if (not_on_table(Dragon)) add Gold
```

Check the player's discoveries:

```
if (discovered(Light)) message "The text on the note reads: RUN"
if (not_discovered(Light)) message "In the darkness you can't make out a single letter"
```

The difference between table and discovery checks matters:

- `on_table(Key)` means a `Key` tile is on the screen right now.
- `discovered(Key)` means the player has unlocked `Key` at some point, even if it is not on the board anymore.

## 2. Medium

The basics are enough for many scripts. The medium tools are what make scripts comfortable to maintain: non-consumables, comments, combined conditions, and `stop`.

### Non-Consumable Elements

Some elements can be marked `non-consumable` in the editor. A non-consumable ingredient stays on the table after a successful reaction.

That is great for reusable tools:

- `Furnace`
- `Workbench`
- `Magic Lens`
- `Catalyst`

If a script needs to remove one anyway, it can:

```
remove Furnace
add Broken Furnace
```

Non-consumable outputs are also single-copy on the table. If `Furnace` is already sitting there, adding another `Furnace` will not create duplicates unless the same reaction removes the old one first.

### Comments

Use `//` for notes.

```
// This branch rewards players who solved the key puzzle.
if (discovered(Key)) add Treasure // special reward
```

Comments can be full-line or trailing. A `//` inside quoted text stays part of the text:

```
message "The sign says: north // danger"
```

Comments do not count as active script lines, so this is still treated like an empty script:

```
// TODO: make this more dramatic later
```

The formatter preserves script comments.

### AND Conditions

Use `and` when more than one thing must be true.

```
if (on_table(Key) and not_discovered(Treasure)) add Treasure
```

Only `and` is supported. There is no `or` yet.

If you need "or" behavior, write separate conditional lines:

```
if (on_table(Red Key)) add Open Door
if (on_table(Blue Key)) add Open Door
```

### Stop Action

`stop` ends the script immediately. It is most useful after a successful branch, so the fallback lines do not run too.

```
if (discovered(Key)) add Open Door
if (discovered(Key)) stop
message "The door is locked."
add Locked Door
```

`stop` can also protect a dangerous or invalid path:

```
if (not_on_table(Battery)) message "The machine has no power."
if (not_on_table(Battery)) stop
add Powered Machine
```

### Medium Example: Reusable Furnace

Reaction: `Furnace + Ore`

```
// Furnace is non-consumable, so it stays on the table.
if (not_on_table(Coal)) message "The furnace needs coal."
if (not_on_table(Coal)) stop

remove Coal
popup "The ore softens into a bright ingot.", Ingot
add Ingot
```

The furnace survives because it is non-consumable. `Coal` is spent because the script explicitly removes it.

## 3. Advanced

Advanced scripting is mostly about counters, full text editing, table cleanup, and validation details.

### Counters

Counters are named values such as `Health`, `Heat`, `Money`, or `Trust`.

Change a counter:

```
set Health -= 1
set Heat += 5
set Money = 0
```

Check a counter:

```
if (count(Health) <= 0) lose "You collapse.", Skull
if (count(Heat) >= 10) add Steam
if (count(Money) != 0) message "Your purse jingles."
```

Counters can have authored `min` and `max` bounds. If a script tries to move past those bounds, the value clamps automatically.

Counters also have visibility:

```
add Health
set Health -= 1
remove Health
```

For counters, `add Health` shows the counter chip and `remove Health` hides it. They do not change the counter value by themselves.

Important: `remove_all Health` is invalid if `Health` is a counter. Use `remove Health` to hide a counter.

### Counter Example: A Dangerous Door

Suppose the player can force a door open, but it costs health.

```
add Health
set Health -= 2
if (count(Health) <= 0) lose "The door gives way, but so do you.", Broken Door
if (count(Health) <= 0) stop
popup "You shoulder the door open.", Open Door
add Open Door
```

What happens:

- The `Health` counter becomes visible.
- Health drops by 2.
- If health reaches 0 or below, the realm ends with a lose screen.
- Otherwise, the player gets a popup and `Open Door`.

### Puzzle Example: A Three-Step Ritual

This pattern is useful for rituals, machines, recipes, or locks that need repeated progress.

Reaction: `Altar + Rune`

```
add Ritual Progress
set Ritual Progress += 1

if (count(Ritual Progress) < 3) message "The rune glows, then fades."
if (count(Ritual Progress) < 3) add Warm Altar
if (count(Ritual Progress) < 3) stop

popup "The altar wakes."
remove_all Warm Altar
add Awakened Altar, Moon Key
```

What happens:

- First and second use: the counter increases, the player gets a hint, and the script stops.
- Third use: the script reaches the final lines, clears old `Warm Altar` tiles, and creates the real reward.

### Table Control

Use `remove`, `remove_all Element`, and bare `remove_all` to control the board.

Reaction: `Bell + Ring`

```
message "The sound sweeps the room clean."
remove_all Smoke
remove_all Dust
add Clear Air
```

Reaction: `Reset Sigil + Touch`

```
popup "Everything returns to the beginning."
remove_all
add Air, Fire, Earth, Water
```

Bare `remove_all` clears table elements. It does not erase discoveries or reset progress.

### Popup, Win, And Lose Text

`message` is meant for short, dismissible bubbles.

`popup`, `win`, and `lose` are blocking screens. Their text can use the same markdown-style rendering as other authored story text.

```
popup "The mirror whispers: **Bring me moonlight.**", Mirror
```

### Names And Validation

Element and counter names must match the names in your realm.

The editor no longer auto-creates unknown names while you type. Unknown names show as validation issues until you explicitly add them from the inline issue, the main validation panel, or the post-paste `Add all` popup.

This is intentional. It prevents typos like `Goldd Coin` from quietly becoming real elements.

Avoid reserved syntax characters in element names:

```
+ , = : ( ) "
```

Good names:

```
Rusty Key
Door Locked
Iron Wood
```

Risky names:

```
Key, Rusty
Door: Locked
Iron+Wood
```

New elements created through the editor are cleaned up to avoid these syntax problems, and publishing blocks stale invalid names from older data.

### Full Text Editor Syntax

In the visual editor, scripts live in the script box for one reaction.

In the full reaction-text editor, normal reactions use `=`:

```
Air+Fire=Steam
```

Scripted reactions use `:` and indented script lines:

```
Chest+Open:
    if (discovered(Key)) add Gold Coin
    if (discovered(Key)) stop
    message "The chest is locked."
    add Locked Chest
```

The full text editor can also start with a declaration block:

```
starters: Air, Fire, Earth, Water
counters: Health min=0 max=10 initial=10, Ritual Progress initial=0
nonconsumables: Furnace, Workbench

Air+Fire=Steam
Furnace+Ore:
    set Heat += 1
    if (count(Heat) >= 3) add Ingot
```

Declaration lines are optional, but if you use them they must stay together at the top of the text. `counters:` entries require `initial=...`; `min=` and `max=` are optional.

### Formatting

The editor prefers canonical bracket-less action syntax:

```
set Health += 1
message "Done."
popup "Done.", Star
```

Older wrapped forms may still parse in saved data:

```
set(Health += 1)
message("Done.")
```

But the formatter rewrites them to the canonical style. For new scripts, use the bracket-less form.

A bare element name is accepted as shorthand for `add Element Name`, but `add Element Name` is clearer and is what the formatter writes.

### Troubleshooting

If a line does not work, check these first:

- Did you spell the element or counter exactly like it appears in the realm?
- Is the name an element when the command expects an element, or a counter when the command expects a counter?
- Did you use `count(Health) >= 3` instead of `Health >= 3`?
- Did you use `and` instead of `or`?
- Did you remember that `if (...)` affects only the action on the same line?
- Did you use `remove Health` instead of `remove_all Health` for counters?
- Did you put declaration lines only at the top of the full text editor?

## 4. System Words

System words are the special words the script understands. Element and counter names are your own realm words; system words are the built-in commands, conditions, operators, and declarations.

### Actions

`add`

Creates one or more elements. If the name is a counter, it shows that counter chip instead.

```
add Element
add First Element, Second Element
```

`remove`

Removes one copy of a table element. If the name is a counter, it hides that counter chip instead.

```
remove Element
```

`remove_all`

With an element name, removes all table copies of that element. By itself, clears the whole table. It cannot target counters.

```
remove_all Element
remove_all
```

`set`

Changes a counter value.

```
set Counter += 1
set Counter -= 1
set Counter = 10
```

`message`

Shows a short dismissible in-game bubble.

```
message "Short text"
```

`popup`

Shows a blocking popup. The optional element after the comma is used as the icon.

```
popup "Popup text"
popup "Popup text", Icon Element
```

`win`

Shows the win screen and stops the script. The optional element after the comma is used as the icon.

```
win "Win text"
win "Win text", Icon Element
```

`lose`

Shows the lose screen and stops the script. The optional element after the comma is used as the icon.

```
lose "Lose text"
lose "Lose text", Icon Element
```

`stop`

Stops the script immediately.

```
stop
```

### Conditions

`if`

Runs one action only when the condition inside parentheses is true.

```
if (discovered(Key)) add Open Door
```

`on_table(...)`

True when that element is currently on the table.

```
on_table(Element)
```

`not_on_table(...)`

True when that element is not currently on the table.

```
not_on_table(Element)
```

`discovered(...)`

True when the player has discovered that element at least once.

```
discovered(Element)
```

`not_discovered(...)`

True when the player has not discovered that element yet.

```
not_discovered(Element)
```

`count(...)`

Reads a counter value so it can be compared to a number.

```
count(Counter) < 3
count(Counter) <= 3
count(Counter) > 3
count(Counter) >= 3
count(Counter) == 3
count(Counter) != 3
```

`and`

Combines multiple conditions. All of them must be true.

```
if (condition and condition) action
```

### Operators

`+=`

Adds to a counter.

```
set Health += 1
```

`-=`

Subtracts from a counter.

```
set Health -= 1
```

`=`

Sets a counter to an exact value in scripts. In the full reaction-text editor, it also separates a reaction from normal outputs.

```
set Health = 10
Air+Fire=Steam
```

`<`, `<=`, `>`, `>=`, `==`, `!=`

Compare a counter value to a number.

```
if (count(Health) <= 0) lose "You collapse."
```

### Comments

`//`

Starts a comment outside quoted strings. The comment runs to the end of the line.

```
// note
add Spark // trailing note
```

### Full Text Declarations

`starters:`

Lists the elements the player starts with.

```
starters: Air, Fire, Earth, Water
```

`counters:`

Defines counters. Each counter needs `initial=...`; `min=...` and `max=...` are optional.

```
counters: Health min=0 max=10 initial=10
```

`initial=`

Sets the starting value for a counter. Required for every counter in `counters:`.

```
counters: Health initial=10
```

`min=`

Sets the lowest value a counter can reach. Optional.

```
counters: Health min=0 initial=10
```

`max=`

Sets the highest value a counter can reach. Optional.

```
counters: Heat max=100 initial=0
```

`nonconsumables:`

Lists elements that should stay on the table after being used as ingredients.

```
nonconsumables: Furnace, Workbench
```

### Full Text Reaction Separators

`+`

Separates the two ingredients in a reaction line.

```
Air+Fire=Steam
```

`=`

Creates a normal reaction with fixed outputs.

```
Air+Fire=Steam
```

`:`

Starts an indented script block for that reaction.

```
Air+Fire:
    add Steam
    message "The air hisses."
```
