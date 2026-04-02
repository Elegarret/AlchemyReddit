# Reaction Script Tutorial

Reaction scripts let a recipe do more than just output fixed elements.

If the script box is empty, the reaction uses its normal results. If the script box has text in it, the script decides what happens instead.

## The Simple Idea

For non-coders:

- Think of it as a tiny checklist.
- The game reads one line at a time, from top to bottom.
- Each line tells the game to do one thing.

For coders:

- It is a small line-based scripting format.
- One action per line.
- You can put `if (...)` in front of a line to make that action conditional.

## A More Interesting Example

Instead of always giving the same result, imagine `Door + Push` can lead to different outputs:

```txt
if (discovered(key)) add open door
if (discovered(key)) stop
message "The door is locked tight."
add locked door
```

What that means:

- If the player has already discovered `key`, the reaction creates `open door`.
- `stop` ends the script right there.
- If the player does not have `key`, the script keeps going.
- In that case, it shows a message and creates `locked door` instead.

So this one reaction has two possible outcomes:

- `open door`
- `locked door`

## The Most Common Commands

Create things:

- `add gold coin`
- `add open chest, gold coin`

Remove things:

- `remove key`
- `remove_all smoke`

Show text:

- `message "A hidden compartment slides open."`
- `popup "A hidden compartment slides open."`
- `popup "A hidden compartment slides open.", key`

Finish the realm:

- `win "You restored the realm."`
- `lose "The realm is lost.", corpse`

Stop the rest of the script:

- `stop`

## Conditional Lines

Use `if (...)` when something should happen only in a specific situation.

Examples:

- `if (on_table(key)) add treasure`
- `if (not_on_table(key)) message("It is still locked.")`
- `if (discovered(treasure)) add empty chest`
- `if (not_discovered(old map)) add old map`

You can combine checks with `and`:

```txt
if (on_table(key) and not_discovered(old map)) add old map
```

## Counters

If your realm uses counters, scripts can read and change them:

- `set(score += 1)`
- `set(score = 10)`
- `if (count(score) >= 3) add trophy`

If you are not using counters, you can ignore this part.

## Good To Know

- One statement per line.
- Lines run top to bottom.
- Blank lines are ignored.
- `//` starts a comment that runs to the end of the line.
- `stop` ends the script immediately.
- `message "..."` shows a non-blocking toast.
- `popup "..."` shows a blocking popup.
- `win "..."` and `lose "..."` show blocking end-state screens.
- `if (...)` only affects the action on that same line.
- Element names must match the names in your realm.

## Quick Reference

Actions:

- `add elementName`
- `add firstElement, secondElement`
- `remove elementName`
- `remove_all elementName`
- `set counterName += number`
- `set counterName -= number`
- `set counterName = number`
- `message "Text here"`
- `popup "Text here"`
- `popup "Text here", elementName`
- `win "Text here"`
- `lose "Text here", elementName`
- `stop`

Conditions:

- `on_table(elementName)`
- `not_on_table(elementName)`
- `discovered(elementName)`
- `not_discovered(elementName)`
- `count(counterName) < number`
- `count(counterName) <= number`
- `count(counterName) > number`
- `count(counterName) >= number`
- `count(counterName) == number`
- `count(counterName) != number`
