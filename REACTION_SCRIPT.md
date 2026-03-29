# Reaction Script

One statement per line. Lines run top to bottom. A bare element name is shorthand for `add elementName`, but canonical formatting uses `add elementName`.

## Grammar

- `line := action | if_line`
- `if_line := if ( condition_list ) action`
- `condition_list := condition (and condition)*`

## Actions

- `add dust`
- `add dust, key`
- `dust`
- `remove flashlight`
- `remove_all dust`
- `set(money += 1)`
- `set(money -= 1)`
- `set(health = 10)`
- `message("The cupboard is locked.")`
- `stop`

## Conditions

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

Use `if (...) action` for a single conditional action. Conditions are flat and AND-only, for example:

- `if (on_table(flashlight)) add scratched-note`
- `if (on_table(flashlight) and not_discovered(jacket)) add jacket`
- `if (count(health) < 10) add bandage`
- `if (not_on_table(key)) message("It is locked.")`
- `if (not_on_table(key)) stop`

Bracketed tokens are whitespace-tolerant on input, so `if(count(health)<10)add bandage` also parses, but canonical output uses one space where needed.

## Example

```txt
message("The cupboard is locked.")
if (not_on_table(key)) stop
remove flashlight
add scratched-note, bandage
set(money += 1)
```
