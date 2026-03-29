import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyReactionScriptAutocompleteSuggestion,
  getReactionScriptAutocomplete,
  type ReactionScriptAutocompleteSuggestion,
} from '../modding/reaction-script-autocomplete';

type ScriptAutocompleteMode = 'script' | 'reaction-text';

type ScriptAutocompleteTextareaProps = {
  className: string;
  counterNames: string[];
  elementNames: string[];
  mode: ScriptAutocompleteMode;
  onBlur?: (() => void) | undefined;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
  value: string;
};

type CaretPopupPosition = {
  left: number;
  top: number;
};

const POPUP_WIDTH = 240;
const POPUP_MARGIN = 12;
const POPUP_OFFSET = 8;

const shouldTriggerAutocompleteFromKey = (event: {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
}) => {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }

  return (
    event.key.length === 1 ||
    event.key === 'Backspace' ||
    event.key === 'Delete' ||
    event.key === 'Enter'
  );
};

const isIndentLine = (linePrefix: string) =>
  linePrefix.startsWith('    ') || linePrefix.startsWith('\t');

const getIndentLength = (linePrefix: string) =>
  linePrefix.startsWith('    ') ? 4 : linePrefix.startsWith('\t') ? 1 : 0;

const getLineStart = (value: string, cursor: number) =>
  value.lastIndexOf('\n', Math.max(cursor - 1, 0)) + 1;

const shouldOpenAutocompleteAtCursor = (params: {
  counterNames: string[];
  cursor: number;
  elementNames: string[];
  mode: ScriptAutocompleteMode;
  value: string;
}) => getSuggestionsForMode(params).length > 0;

const insertIndentAtSelection = (params: {
  selectionEnd: number;
  selectionStart: number;
  value: string;
}) => {
  const { selectionEnd, selectionStart, value } = params;
  const nextValue =
    value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd);
  const cursor = selectionStart + 4;

  return {
    cursor,
    value: nextValue,
  };
};

const getSuggestionsForMode = (params: {
  counterNames: string[];
  cursor: number;
  elementNames: string[];
  mode: ScriptAutocompleteMode;
  value: string;
}) => {
  const { counterNames, cursor, elementNames, mode, value } = params;
  if (mode === 'script') {
    return getReactionScriptAutocomplete({
      counterNames,
      cursor,
      elementNames,
      value,
    }).suggestions;
  }

  const lineStart = getLineStart(value, cursor);
  const linePrefix = value.slice(lineStart, cursor);
  if (!isIndentLine(linePrefix)) {
    return [];
  }

  const indentLength = getIndentLength(linePrefix);
  const lineCursor = cursor - lineStart - indentLength;
  if (lineCursor < 0) {
    return [];
  }

  const lineEndIndex = value.indexOf('\n', cursor);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const lineValue = value.slice(lineStart + indentLength, lineEnd);

  return getReactionScriptAutocomplete({
    counterNames,
    cursor: Math.min(lineCursor, lineValue.length),
    elementNames,
    value: lineValue,
  }).suggestions.map((suggestion) => ({
    ...suggestion,
    replaceEnd: suggestion.replaceEnd + lineStart + indentLength,
    replaceStart: suggestion.replaceStart + lineStart + indentLength,
  }));
};

const getCaretPopupPosition = (
  textarea: HTMLTextAreaElement,
  popupHeight: number
): CaretPopupPosition | null => {
  const styles = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');

  mirror.style.position = 'fixed';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.boxSizing = styles.boxSizing;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.border = styles.border;
  mirror.style.font = styles.font;
  mirror.style.fontFamily = styles.fontFamily;
  mirror.style.fontSize = styles.fontSize;
  mirror.style.fontWeight = styles.fontWeight;
  mirror.style.letterSpacing = styles.letterSpacing;
  mirror.style.lineHeight = styles.lineHeight;
  mirror.style.padding = styles.padding;
  mirror.style.tabSize = styles.tabSize;
  mirror.style.textTransform = styles.textTransform;
  mirror.style.textIndent = styles.textIndent;

  const selectionStart = textarea.selectionStart;
  const beforeCaret = textarea.value.slice(0, selectionStart);
  mirror.textContent = beforeCaret.endsWith('\n') ? `${beforeCaret} ` : beforeCaret;
  marker.textContent = textarea.value[selectionStart] ?? ' ';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const textareaRect = textarea.getBoundingClientRect();
  const caretLeft = textareaRect.left + marker.offsetLeft - textarea.scrollLeft;
  const caretTop = textareaRect.top + marker.offsetTop - textarea.scrollTop;
  const caretHeight =
    Number.parseFloat(styles.lineHeight) ||
    marker.getBoundingClientRect().height ||
    18;

  document.body.removeChild(mirror);

  const fitsBelow =
    caretTop + caretHeight + POPUP_OFFSET + popupHeight <=
    window.innerHeight - POPUP_MARGIN;
  const left = Math.min(
    Math.max(POPUP_MARGIN, caretLeft),
    window.innerWidth - POPUP_WIDTH - POPUP_MARGIN
  );
  const top = fitsBelow
    ? caretTop + caretHeight + POPUP_OFFSET
    : Math.max(POPUP_MARGIN, caretTop - popupHeight - POPUP_OFFSET);

  return {
    left,
    top,
  };
};

export const ReactionScriptAutocompleteTextarea = ({
  className,
  counterNames,
  elementNames,
  mode,
  onBlur,
  onChange,
  placeholder,
  rows = 5,
  value,
}: ScriptAutocompleteTextareaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const shouldEnableAutocompleteOnChangeRef = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectionStart, setSelectionStart] = useState(0);
  const [isAutocompleteEnabled, setIsAutocompleteEnabled] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [popupPosition, setPopupPosition] = useState<CaretPopupPosition | null>(
    null
  );

  const suggestions = useMemo(() => {
    if (!isFocused || !isAutocompleteEnabled) {
      return [];
    }

    return getSuggestionsForMode({
      counterNames,
      cursor: Math.min(selectionStart, value.length),
      elementNames,
      mode,
      value,
    });
  }, [
    counterNames,
    elementNames,
    isAutocompleteEnabled,
    isFocused,
    mode,
    selectionStart,
    value,
  ]);

  useEffect(() => {
    if (suggestions.length === 0) {
      setSelectedSuggestionIndex(0);
      return;
    }

    setSelectedSuggestionIndex((current) =>
      Math.min(current, suggestions.length - 1)
    );
  }, [suggestions.length]);

  useEffect(() => {
    const textarea = textareaRef.current;
    const popup = popupRef.current;
    if (!textarea || !popup || suggestions.length === 0 || !isFocused) {
      setPopupPosition(null);
      return;
    }

    const updatePopupPosition = () => {
      const nextPosition = getCaretPopupPosition(textarea, popup.offsetHeight);
      setPopupPosition(nextPosition);
    };

    updatePopupPosition();
    textarea.addEventListener('scroll', updatePopupPosition);
    window.addEventListener('resize', updatePopupPosition);
    window.addEventListener('scroll', updatePopupPosition, true);

    return () => {
      textarea.removeEventListener('scroll', updatePopupPosition);
      window.removeEventListener('resize', updatePopupPosition);
      window.removeEventListener('scroll', updatePopupPosition, true);
    };
  }, [isFocused, selectionStart, suggestions.length, value]);

  const acceptSuggestion = (suggestion: ReactionScriptAutocompleteSuggestion) => {
    const applied = applyReactionScriptAutocompleteSuggestion({
      suggestion,
      value,
    });
    const nextSuggestions = getSuggestionsForMode({
      counterNames,
      cursor: applied.cursor,
      elementNames,
      mode,
      value: applied.value,
    });

    onChange(applied.value);
    setSelectionStart(applied.cursor);
    setSelectedSuggestionIndex(0);
    setIsAutocompleteEnabled(nextSuggestions.length > 0);

    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) {
        return;
      }

      target.focus();
      target.setSelectionRange(applied.cursor, applied.cursor);
    });
  };

  return (
    <>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setSelectionStart(event.target.selectionStart);
          setSelectedSuggestionIndex(0);
          setIsAutocompleteEnabled(
            shouldEnableAutocompleteOnChangeRef.current
          );
          shouldEnableAutocompleteOnChangeRef.current = false;
        }}
        onFocus={(event) => {
          setIsFocused(true);
          setSelectionStart(event.currentTarget.selectionStart);
          setIsAutocompleteEnabled(false);
        }}
        onBlur={() => {
          setIsFocused(false);
          setIsAutocompleteEnabled(false);
          onBlur?.();
        }}
        onMouseDown={() => {
          setIsAutocompleteEnabled(false);
        }}
        onSelect={(event) => {
          const nextSelectionStart = event.currentTarget.selectionStart;
          setSelectionStart(nextSelectionStart);
          setSelectedSuggestionIndex(0);
          setIsAutocompleteEnabled(
            event.currentTarget.selectionStart ===
              event.currentTarget.selectionEnd &&
              shouldOpenAutocompleteAtCursor({
                counterNames,
                cursor: nextSelectionStart,
                elementNames,
                mode,
                value: event.currentTarget.value,
              })
          );
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Tab' &&
            event.currentTarget.selectionStart === event.currentTarget.selectionEnd &&
            event.currentTarget.selectionStart ===
              getLineStart(
                event.currentTarget.value,
                event.currentTarget.selectionStart
              )
          ) {
            event.preventDefault();
            const applied = insertIndentAtSelection({
              selectionEnd: event.currentTarget.selectionEnd,
              selectionStart: event.currentTarget.selectionStart,
              value: event.currentTarget.value,
            });

            onChange(applied.value);
            setSelectionStart(applied.cursor);
            setSelectedSuggestionIndex(0);
            setIsAutocompleteEnabled(
              shouldOpenAutocompleteAtCursor({
                counterNames,
                cursor: applied.cursor,
                elementNames,
                mode,
                value: applied.value,
              })
            );

            requestAnimationFrame(() => {
              const target = textareaRef.current;
              if (!target) {
                return;
              }

              target.focus();
              target.setSelectionRange(applied.cursor, applied.cursor);
            });
            return;
          }

          if (suggestions.length > 0) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelectedSuggestionIndex((current) =>
                current + 1 >= suggestions.length ? 0 : current + 1
              );
              return;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelectedSuggestionIndex((current) =>
                current === 0 ? suggestions.length - 1 : current - 1
              );
              return;
            }

            if (event.key === 'Enter' || event.key === 'Tab') {
              const suggestion = suggestions[selectedSuggestionIndex];
              if (!suggestion) {
                return;
              }

              event.preventDefault();
              acceptSuggestion(suggestion);
              return;
            }
          }

          if (event.key === 'Escape') {
            setIsAutocompleteEnabled(false);
            return;
          }

          shouldEnableAutocompleteOnChangeRef.current =
            shouldTriggerAutocompleteFromKey(event);
        }}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />

      {suggestions.length > 0 &&
        isFocused &&
        createPortal(
          <div
            ref={popupRef}
            className="fixed z-[100003] max-h-56 w-[240px] overflow-hidden rounded-xl border shadow-2xl backdrop-blur-xl"
            style={{
              background: 'var(--catalog-card-fill)',
              borderColor: 'var(--catalog-soft-border)',
              left: popupPosition?.left ?? -9999,
              top: popupPosition?.top ?? -9999,
            }}
          >
            {suggestions.slice(0, 8).map((suggestion, suggestionIndex) => (
              <button
                key={`${suggestion.label}-${suggestion.replaceStart}-${suggestionIndex}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => acceptSuggestion(suggestion)}
                className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left font-mono text-xs transition-colors ${
                  suggestionIndex === selectedSuggestionIndex
                    ? 'bg-cyan-500/18 text-cyan-50'
                    : 'text-[color:var(--catalog-ink)] hover:bg-white/6'
                }`}
              >
                <span className="text-inherit">{suggestion.text}</span>
                <span
                  className={`text-[10px] ${
                    suggestionIndex === selectedSuggestionIndex
                      ? 'text-cyan-100/85'
                      : 'text-[color:var(--catalog-muted)]'
                  }`}
                >
                  {suggestion.label}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};
