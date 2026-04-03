# Reaction Script

One statement per line. Lines run top to bottom.

Canonical formatting uses bracket-less actions such as `set health += 1` and `popup "Text", key`. Older wrapped action forms like `set(health += 1)` or `message("Text")` may still parse, but the formatter rewrites them to canonical syntax.

A bare element name is shorthand for `add elementName`, but canonical formatting still uses `add elementName`.

## Grammar

- `line := action | if_line`
- `if_line := if ( condition_list ) action`
- `condition_list := condition (and condition)*`
- `// comment` starts a line comment outside double-quoted strings and runs to end of line

## Actions

- `add element_1`
- `add element_1, element_2`
- `element_1`
- `remove element_1`
- `remove_all`
- `remove_all element_1`
- `set counter += 1`
- `set counter -= 1`
- `set counter = 10`
- `message "Message at the top of the screen"`
- `popup "Blocking popup text"`
- `popup "Blocking popup text", icon_name`
- `win "Win popup, game over"`
- `win "Win popup, game over", icon_name`
- `lose "You lose, start over"`
- `lose "You lose, start over", icon_name`
- `stop`

## Counter Behavior

- `set counterName ...` changes a counter value.
- `add counterName` shows that counter chip if the name resolves to a configured counter.
- `remove counterName` hides that counter chip.
- `add` and `remove` do not change the counter value by themselves.
- `remove_all counterName` is invalid. `remove_all` only clears table elements.
- Counter values clamp to authored `min` / `max` bounds when those bounds exist.

This means counters can be invisible until a script reveals them:

- `add Health`
- `set Health -= 1`
- `remove Health`

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
- `if (not_on_table(key)) message "It is locked."`
- `if (not_on_table(key)) popup "It is locked.", key`
- `if (not_on_table(key)) stop`

Bracketed tokens are whitespace-tolerant on input, so `if(count(health)<10)add bandage` also parses, but canonical output uses one space where needed.

## Notes

- Blank lines are ignored.
- Comments can be full-line or trailing:
- `// explain why this line exists`
- `add bandage // reward for low health`
- `message "Use // literally in text."`
- `message "..."` shows a non-blocking message.
- `popup "..."` shows a blocking modal the player must dismiss.
- `win "..."` and `lose "..."` show blocking end-state screens.
- `stop` ends the script immediately.

## Example

```txt
// cupboard branch
message "The cupboard is locked."
popup "You found a hidden compartment.", key
if (not_on_table(key)) stop
remove flashlight
add scratched-note, bandage
add Health
set money += 1
```

## Possible Autocomplete Flaws

High: element names still allow syntax delimiters that the text/script editors treat as grammar, so some valid-looking elements cannot round-trip safely. Nothing in validation rejects names containing +, =, :, ,, (, ), or quotes in runtime.ts, but the full-text parser splits on +, = and : in draft.ts, and script parsing splits add on commas plus parses wrapped calls by parentheses in reaction-script.ts and reaction-script.ts. Cases like Iron+Wood, Door: Locked, or Key, Rusty are likely to serialize or parse incorrectly.

High: malformed lines in the full reaction text editor are silently dropped on blur/toggle instead of surfacing an error. applyReactionTextToDraft() just continues when a line does not match the expected shape in draft.ts. That means an author can type an incomplete or slightly malformed reaction, switch back to visual mode, and lose that line without feedback.

Medium: autocomplete keyboard navigation can select invisible items. The component keeps selectedSuggestionIndex across the full suggestion list in ReactionScriptAutocompleteTextarea.tsx, but the popup only renders suggestions.slice(0, 8) in ReactionScriptAutocompleteTextarea.tsx. If there are 9+ matches, arrow keys can move to a hidden suggestion and Enter will accept something the user cannot see.

Medium: auto-add can still fire when editing in the middle of a line, not just when finishing a token at the end. The commit hook runs for ,, +, and Enter in ReactionScriptAutocompleteTextarea.tsx without checking that the caret is at the token end or that the selection is collapsed. Combined with the prefix-only extraction in reaction-script-autocomplete.ts, splitting a line mid-token can still create unintended elements.

Medium: full-text mode can create “orphan” elements from incomplete reactions. Example: typing Water + NewThing, pressing Enter, and later blurring will auto-add NewThing, but because the line has no = or :, the parser will skip the reaction entirely in draft.ts. You end up with a new element but no reaction, which is likely surprising.

Lower: the script-toggle bootstrap from visual outputs can preserve temporary typos as real script text. When opening script mode on a visual reaction, handleToggleScript() seeds add ... from the current raw outputTexts in components.tsx, not from committed canonical outputs. If the last visual output field still contains an uncommitted typo, the generated script inherits it.
