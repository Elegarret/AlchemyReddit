import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyReactionScriptAutocompleteSuggestion,
  getReactionScriptAutocomplete,
  getReactionTextAutocomplete,
  type ReactionScriptAutocompleteMode,
  type ReactionScriptAutocompleteSuggestion,
} from '../modding/reaction-script-autocomplete';
import {
  formatReactionScript,
  parseReactionScript,
  splitReactionScriptLineComment,
  validateReactionScript,
} from '../modding/reaction-script';
import { type SaveDraftInput } from '../modding/types';
import {
  getReactionTextMissingElementNames,
  parseReactionTextToDraft,
  type ReactionTextIssue,
} from './draft';

type ScriptAutocompleteTextareaProps = {
  beautifyOnBlur?: boolean;
  className: string;
  counterNames: string[];
  elementNames: string[];
  iconElementNames?: string[];
  mode: ReactionScriptAutocompleteMode;
  onBlur?: (() => void) | undefined;
  onChange: (value: string) => void;
  onEditingSettled?: (() => void) | undefined;
  onElementCommitted?: ((name: string) => void) | undefined;
  onPasteMissingElements?: ((names: string[]) => void) | undefined;
  placeholder: string;
  reactionTextDraft?: SaveDraftInput | undefined;
  reactionTextIssues?: ReactionTextIssue[] | undefined;
  rows?: number;
  textareaClassName?: string;
  value: string;
};

type CaretPopupPosition = {
  left: number;
  top: number;
};

type HighlightToken = {
  isUnknown?: boolean;
  text: string;
  tone: 'base' | 'comment' | 'element' | 'keyword' | 'symbol';
};

type HighlightLine = {
  lineNumber: number;
  tokens: HighlightToken[];
};

const POPUP_WIDTH = 240;
const POPUP_MARGIN = 12;
const POPUP_OFFSET = 8;

const SYSTEM_WORDS = new Set([
  'add',
  'always',
  'and',
  'count',
  'counters',
  'crossing',
  'discovered',
  'event',
  'if',
  'message',
  'not_discovered',
  'not_on_table',
  'nonconsumables',
  'on_table',
  'popup',
  'remove',
  'remove_all',
  'set',
  'starters',
  'stop',
  'reaction',
  'once',
  'undiscovered',
  'win',
  'lose',
]);

const TOKEN_PATTERN =
  /(\r\n|\n|\s+|"(?:\\.|[^"\\])*"|==|!=|<=|>=|\+=|-=|[=(),:+\-<>])/g;

const WORD_PATTERN = /([A-Za-z_][A-Za-z0-9_]*)/g;

const REACTION_TEXT_NAME_BOUNDARY_PATTERN = /[\s,:+=]/;

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

const getLineStart = (value: string, cursor: number) =>
  value.lastIndexOf('\n', Math.max(cursor - 1, 0)) + 1;

const getLineEnd = (value: string, cursor: number) => {
  const lineEnd = value.indexOf('\n', cursor);
  return lineEnd === -1 ? value.length : lineEnd;
};

const shouldOpenAutocompleteAtCursor = (params: {
  counterNames: string[];
  cursor: number;
  elementNames: string[];
  iconElementNames?: string[];
  mode: ReactionScriptAutocompleteMode;
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

const insertIndentedNewlineAtSelection = (params: {
  selectionEnd: number;
  selectionStart: number;
  value: string;
}) => {
  const { selectionEnd, selectionStart, value } = params;
  const nextValue =
    value.slice(0, selectionStart) + '\n    ' + value.slice(selectionEnd);
  const cursor = selectionStart + '\n    '.length;

  return {
    cursor,
    value: nextValue,
  };
};

const insertNewlineWithIndentAtSelection = (params: {
  indent: string;
  selectionEnd: number;
  selectionStart: number;
  value: string;
}) => {
  const { indent, selectionEnd, selectionStart, value } = params;
  const insertion = `\n${indent}`;
  const nextValue =
    value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
  const cursor = selectionStart + insertion.length;

  return {
    cursor,
    value: nextValue,
  };
};

const getNextIfBlockIndent = (line: string) => {
  const splitLine = splitReactionScriptLineComment(line);
  const code = splitLine.code.trimEnd();
  if (!code.endsWith(':') || !/^if(?=\s|\()/.test(code.trimStart())) {
    return null;
  }

  const leadingWhitespace = line.match(/^\s*/)?.[0] ?? '';
  const indentUnit =
    leadingWhitespace.includes('\t') && !leadingWhitespace.includes(' ')
      ? '\t'
      : '    ';
  const bodyIndent = `${leadingWhitespace}${indentUnit}`;
  const probe = `${line}\n${bodyIndent}stop`;
  return parseReactionScript(probe).ok ? bodyIndent : null;
};

const getLineIndent = (line: string) => line.match(/^\s*/)?.[0] ?? '';

const getSuggestionsForMode = (params: {
  counterNames: string[];
  cursor: number;
  elementNames: string[];
  iconElementNames?: string[];
  mode: ReactionScriptAutocompleteMode;
  value: string;
}) => {
  const { counterNames, cursor, elementNames, iconElementNames, mode, value } =
    params;
  if (mode === 'script') {
    return getReactionScriptAutocomplete({
      counterNames,
      cursor,
      elementNames,
      ...(iconElementNames ? { iconElementNames } : {}),
      value,
    }).suggestions;
  }

  return getReactionTextAutocomplete({
    counterNames,
    cursor,
    elementNames,
    ...(iconElementNames ? { iconElementNames } : {}),
    value,
  }).suggestions;
};

const dedupeElementNames = (names: string[]) => {
  const seen = new Set<string>();
  const dedupedNames: string[] = [];

  names.forEach((name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const normalizedKey = trimmed.toLowerCase();
    if (seen.has(normalizedKey)) {
      return;
    }

    seen.add(normalizedKey);
    dedupedNames.push(trimmed);
  });

  return dedupedNames;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeMissingElementName = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const isReactionTextNameBoundary = (character: string | undefined) =>
  character === undefined || REACTION_TEXT_NAME_BOUNDARY_PATTERN.test(character);

const getMissingScriptElementNames = (params: {
  counterNames: string[];
  elementNames: string[];
  iconElementNames?: string[];
  value: string;
}) => {
  const {
    counterNames,
    elementNames,
    iconElementNames = elementNames,
    value,
  } = params;
  const validation = validateReactionScript(value, {
    counterNames,
    elements: iconElementNames.map((name) => ({
      id: name,
      name,
    })),
    nonGameplayElementIds: counterNames,
  });

  if (validation.ok) {
    return [];
  }

  return dedupeElementNames(
    validation.errors.flatMap((error) => {
      const missingElementName =
        error.message.match(/^Unknown element "(.+)"\.$/)?.[1] ?? null;

      return missingElementName ? [missingElementName] : [];
    })
  );
};

const getMissingReactionTextElementNames = (params: {
  draft: SaveDraftInput;
  value: string;
}) =>
  getReactionTextMissingElementNames(
    parseReactionTextToDraft(params.draft, params.value).errors
  );

const getCaretPopupPosition = (
  textarea: HTMLTextAreaElement,
  cursor: number,
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

  const safeCursor = Math.min(cursor, textarea.value.length);
  const beforeCaret = textarea.value.slice(0, safeCursor);
  mirror.textContent = beforeCaret.endsWith('\n') ? `${beforeCaret} ` : beforeCaret;
  marker.textContent = textarea.value[safeCursor] ?? ' ';
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

const tokenizeSegment = (segment: string): HighlightToken[] => {
  const tokens: HighlightToken[] = [];
  let lastIndex = 0;

  for (const match of segment.matchAll(WORD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({
        text: segment.slice(lastIndex, index),
        tone: 'base',
      });
    }

    const word = match[0];
    tokens.push({
      text: word,
      tone: SYSTEM_WORDS.has(word) ? 'keyword' : 'element',
    });
    lastIndex = index + word.length;
  }

  if (lastIndex < segment.length) {
    tokens.push({
      text: segment.slice(lastIndex),
      tone: 'base',
    });
  }

  return tokens;
};

const applyUnknownTone = (tokens: HighlightToken[]): HighlightToken[] =>
  tokens.map((token) =>
    token.text.trim().length > 0
      ? {
          ...token,
          isUnknown: true,
        }
      : token
  );

const highlightReactionEditorCode = (value: string): HighlightToken[] => {
  const tokens: HighlightToken[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push(...tokenizeSegment(value.slice(lastIndex, index)));
    }

    const token = match[0];
    tokens.push({
      text: token,
      tone:
        token.trim().length > 0 &&
        token !== '\n' &&
        token !== '\r\n' &&
        !token.startsWith('"')
          ? 'symbol'
          : 'base',
    });
    lastIndex = index + token.length;
  }

  if (lastIndex < value.length) {
    tokens.push(...tokenizeSegment(value.slice(lastIndex)));
  }

  return tokens;
};

const findUnknownRanges = (
  value: string,
  missingElementNames: Set<string> | null
) => {
  if (!missingElementNames || missingElementNames.size === 0 || !value.trim()) {
    return [];
  }

  const candidateRanges = [...missingElementNames].flatMap((missingElementName) => {
    const pattern = missingElementName
      .split(' ')
      .map((part) => escapeRegExp(part))
      .join('\\s+');
    const matcher = new RegExp(pattern, 'gi');
    const ranges: Array<{
      end: number;
      start: number;
    }> = [];

    let match = matcher.exec(value);
    while (match) {
      const start = match.index ?? 0;
      const text = match[0] ?? '';
      const end = start + text.length;

      if (
        text.length > 0 &&
        isReactionTextNameBoundary(value[start - 1]) &&
        isReactionTextNameBoundary(value[end])
      ) {
        ranges.push({
          end,
          start,
        });
      }

      if (text.length === 0) {
        matcher.lastIndex += 1;
      }

      match = matcher.exec(value);
    }

    return ranges;
  });

  const selectedRanges: Array<{
    end: number;
    start: number;
  }> = [];

  candidateRanges
    .sort((left, right) =>
      left.start === right.start
        ? right.end - right.start - (left.end - left.start)
        : left.start - right.start
    )
    .forEach((range) => {
      const overlapsExisting = selectedRanges.some(
        (existing) => range.start < existing.end && range.end > existing.start
      );
      if (!overlapsExisting) {
        selectedRanges.push(range);
      }
    });

  return selectedRanges.sort((left, right) => left.start - right.start);
};

const highlightReactionEditorCodeWithUnknowns = (
  value: string,
  missingElementNames: Set<string> | null
): HighlightToken[] => {
  const unknownRanges = findUnknownRanges(value, missingElementNames);
  if (unknownRanges.length === 0) {
    return highlightReactionEditorCode(value);
  }

  const tokens: HighlightToken[] = [];
  let lastIndex = 0;

  unknownRanges.forEach((range) => {
    if (range.start > lastIndex) {
      tokens.push(...highlightReactionEditorCode(value.slice(lastIndex, range.start)));
    }

    tokens.push(
      ...applyUnknownTone(
        highlightReactionEditorCode(value.slice(range.start, range.end))
      )
    );
    lastIndex = range.end;
  });

  if (lastIndex < value.length) {
    tokens.push(...highlightReactionEditorCode(value.slice(lastIndex)));
  }

  return tokens;
};

const buildReactionTextMissingElementsByLine = (issues: ReactionTextIssue[]) => {
  const missingElementsByLine = new Map<number, Set<string>>();

  issues.forEach((issue) => {
    const missingElementName = issue.missingElementName?.trim();
    if (!missingElementName) {
      return;
    }

    const lineMissingElements =
      missingElementsByLine.get(issue.line) ?? new Set<string>();
    lineMissingElements.add(normalizeMissingElementName(missingElementName));
    missingElementsByLine.set(issue.line, lineMissingElements);
  });

  return missingElementsByLine;
};

const highlightReactionTextLine = (
  value: string,
  lineNumber: number,
  missingElementsByLine: Map<number, Set<string>>
): HighlightLine => {
  const { code, commentText } = splitReactionScriptLineComment(value);
  const tokens = highlightReactionEditorCodeWithUnknowns(
    code,
    missingElementsByLine.get(lineNumber) ?? null
  );

  if (commentText !== null) {
    tokens.push({
      text: `//${commentText}`,
      tone: 'comment',
    });
  }

  return {
    lineNumber,
    tokens,
  };
};

const getDisplayHighlightedLines = (
  value: string,
  reactionTextIssues: ReactionTextIssue[]
): HighlightLine[] => {
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const missingElementsByLine = buildReactionTextMissingElementsByLine(
    reactionTextIssues
  );

  return lines.map((line, index) =>
    highlightReactionTextLine(line, index + 1, missingElementsByLine)
  );
};

const highlightReactionEditorValue = (value: string): HighlightToken[] =>
  value
    .replace(/\r\n/g, '\n')
    .split(/(\n)/)
    .flatMap((segment) => {
      if (segment === '\n') {
        return [
          {
            text: segment,
            tone: 'base',
          } satisfies HighlightToken,
        ];
      }

      const { code, commentText } = splitReactionScriptLineComment(segment);
      const tokens = highlightReactionEditorCode(code);
      if (commentText !== null) {
        tokens.push({
          text: `//${commentText}`,
          tone: 'comment',
        });
      }

      return tokens;
    });

const getDisplayHighlightedTokens = (value: string): HighlightToken[] => {
  const tokens = highlightReactionEditorValue(value);

  // Preserve a final blank wrapped line so the overlay scroll height matches
  // the native textarea when the content ends with a newline.
  if (value.endsWith('\n')) {
    return [...tokens, { text: '\u200b', tone: 'base' }];
  }

  return tokens;
};

const getHighlightTokenClassName = (token: HighlightToken) => {
  const toneClassName =
    token.tone === 'keyword'
      ? 'editor-code-token-keyword'
      : token.tone === 'element'
        ? 'editor-code-token-element'
        : token.tone === 'comment'
          ? 'editor-code-token-comment'
          : token.tone === 'symbol'
            ? 'editor-code-token-symbol'
            : 'editor-code-token-base';

  return token.isUnknown
    ? `${toneClassName} editor-code-token-unknown`
    : toneClassName;
};

export const ReactionScriptAutocompleteTextarea = ({
  beautifyOnBlur = false,
  className,
  counterNames,
  elementNames,
  iconElementNames,
  mode,
  onBlur,
  onChange,
  onEditingSettled,
  onPasteMissingElements,
  placeholder,
  reactionTextDraft,
  reactionTextIssues = [],
  rows = 5,
  textareaClassName,
  value,
}: ScriptAutocompleteTextareaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const suggestionItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const shouldEnableAutocompleteOnChangeRef = useRef(false);
  const hasPendingEditRef = useRef(false);
  const ignoreNextSelectRef = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectionStart, setSelectionStart] = useState(0);
  const [isAutocompleteEnabled, setIsAutocompleteEnabled] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<
    number | null
  >(null);
  const [popupPosition, setPopupPosition] = useState<CaretPopupPosition | null>(
    null
  );
  const highlightedTokens = useMemo(
    () => (mode === 'reaction-text' ? [] : getDisplayHighlightedTokens(value)),
    [mode, value]
  );
  const highlightedLines = useMemo(
    () =>
      mode === 'reaction-text'
        ? getDisplayHighlightedLines(value, reactionTextIssues)
        : [],
    [mode, reactionTextIssues, value]
  );
  const reactionTextGutterClassName =
    highlightedLines.length >= 1000
      ? 'editor-code-layout-gutter-4'
      : highlightedLines.length >= 100
        ? 'editor-code-layout-gutter-3'
        : 'editor-code-layout-gutter-default';

  const suggestions = useMemo(() => {
    if (!isFocused || !isAutocompleteEnabled) {
      return [];
    }

    return getSuggestionsForMode({
      counterNames,
      cursor: Math.min(selectionStart, value.length),
      elementNames,
      ...(iconElementNames ? { iconElementNames } : {}),
      mode,
      value,
    });
  }, [
    counterNames,
    elementNames,
    iconElementNames,
    isAutocompleteEnabled,
    isFocused,
    mode,
    selectionStart,
    value,
  ]);

  const settleEditing = () => {
    if (!hasPendingEditRef.current) {
      return;
    }

    hasPendingEditRef.current = false;
    onEditingSettled?.();
  };

  const syncHighlightScroll = (target: HTMLTextAreaElement) => {
    if (!highlightRef.current) {
      return;
    }

    highlightRef.current.scrollTop = target.scrollTop;
    highlightRef.current.scrollLeft = target.scrollLeft;
  };

  const maybeBeautifyValue = () => {
    if (!beautifyOnBlur || mode !== 'script') {
      return value;
    }

    const formatted = formatReactionScript(value);
    if (!formatted || formatted === value) {
      return value;
    }

    onChange(formatted);
    hasPendingEditRef.current = true;
    return formatted;
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    syncHighlightScroll(textarea);
  }, [value]);

  useEffect(() => {
    if (suggestions.length === 0) {
      suggestionItemRefs.current = [];
      setSelectedSuggestionIndex(null);
      return;
    }

    setSelectedSuggestionIndex((current) =>
      current === null ? null : Math.min(current, suggestions.length - 1)
    );
  }, [suggestions.length]);

  useEffect(() => {
    if (suggestions.length === 0 || selectedSuggestionIndex === null) {
      return;
    }

    const selectedItem = suggestionItemRefs.current[selectedSuggestionIndex];
    selectedItem?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedSuggestionIndex, suggestions.length]);

  useEffect(() => {
    const textarea = textareaRef.current;
    const popup = popupRef.current;
    if (!textarea || !popup || suggestions.length === 0 || !isFocused) {
      setPopupPosition(null);
      return;
    }

    const updatePopupPosition = () => {
      const nextPosition = getCaretPopupPosition(
        textarea,
        selectionStart,
        popup.offsetHeight
      );
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
      ...(iconElementNames ? { iconElementNames } : {}),
      mode,
      value: applied.value,
    });

    onChange(applied.value);
    hasPendingEditRef.current = true;
    setSelectionStart(applied.cursor);
    setSelectedSuggestionIndex(null);
    setIsAutocompleteEnabled(nextSuggestions.length > 0);

    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) {
        return;
      }

      ignoreNextSelectRef.current = true;
      target.focus();
      target.setSelectionRange(applied.cursor, applied.cursor);
    });
  };

  const applyTextareaMutation = (nextValue: string, nextCursor: number) => {
    onChange(nextValue);
    hasPendingEditRef.current = true;
    setSelectionStart(nextCursor);
    setSelectedSuggestionIndex(null);
    setIsAutocompleteEnabled(
      shouldOpenAutocompleteAtCursor({
        counterNames,
        cursor: nextCursor,
        elementNames,
        ...(iconElementNames ? { iconElementNames } : {}),
        mode,
        value: nextValue,
      })
    );

    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) {
        return;
      }

      ignoreNextSelectRef.current = true;
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const renderHighlightedToken = (token: HighlightToken, key: string) => (
    <span key={key} className={getHighlightTokenClassName(token)}>
      {token.text}
    </span>
  );

  const renderTextarea = (gridClassName: string) => (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        hasPendingEditRef.current = true;
        setSelectionStart(event.target.selectionStart);
        setSelectedSuggestionIndex(null);
        setIsAutocompleteEnabled(shouldEnableAutocompleteOnChangeRef.current);
        shouldEnableAutocompleteOnChangeRef.current = false;
      }}
      onFocus={(event) => {
        setIsFocused(true);
        setSelectionStart(event.currentTarget.selectionStart);
        setIsAutocompleteEnabled(false);
      }}
      onBlur={() => {
        maybeBeautifyValue();
        setIsFocused(false);
        setIsAutocompleteEnabled(false);
        settleEditing();
        onBlur?.();
      }}
      onMouseDown={() => {
        setIsAutocompleteEnabled(false);
      }}
      onScroll={(event) => {
        syncHighlightScroll(event.currentTarget);
      }}
      onPaste={(event) => {
        if (!onPasteMissingElements) {
          return;
        }

        const pastedText = event.clipboardData.getData('text');
        if (!pastedText) {
          return;
        }

        const nextValue =
          value.slice(0, event.currentTarget.selectionStart) +
          pastedText +
          value.slice(event.currentTarget.selectionEnd);
        const missingElementNames =
          mode === 'reaction-text'
            ? reactionTextDraft
              ? getMissingReactionTextElementNames({
                  draft: reactionTextDraft,
                  value: nextValue,
                })
              : []
            : getMissingScriptElementNames({
                counterNames,
                elementNames,
                ...(iconElementNames ? { iconElementNames } : {}),
                value: nextValue,
              });

        if (missingElementNames.length > 0) {
          onPasteMissingElements(missingElementNames);
        }
      }}
      onSelect={(event) => {
        const nextSelectionStart = event.currentTarget.selectionStart;
        if (ignoreNextSelectRef.current) {
          ignoreNextSelectRef.current = false;
        } else {
          settleEditing();
        }
        setSelectionStart(nextSelectionStart);
        setSelectedSuggestionIndex(null);
        setIsAutocompleteEnabled(
          event.currentTarget.selectionStart ===
            event.currentTarget.selectionEnd &&
            shouldOpenAutocompleteAtCursor({
              counterNames,
              cursor: nextSelectionStart,
              elementNames,
              ...(iconElementNames ? { iconElementNames } : {}),
              mode,
              value: event.currentTarget.value,
            })
        );
      }}
      onKeyDown={(event) => {
        if (
          mode === 'script' &&
          event.shiftKey &&
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === 'f'
        ) {
          event.preventDefault();
          const formatted = formatReactionScript(event.currentTarget.value);
          if (formatted && formatted !== event.currentTarget.value) {
            applyTextareaMutation(
              formatted,
              Math.min(formatted.length, event.currentTarget.selectionStart)
            );
          }
          return;
        }

        if (
          event.key === 'Tab' &&
          event.currentTarget.selectionStart ===
            event.currentTarget.selectionEnd &&
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
          applyTextareaMutation(applied.value, applied.cursor);
          return;
        }

        if (
          event.key === 'Enter' &&
          event.currentTarget.selectionStart === event.currentTarget.selectionEnd
        ) {
          const lineEnd = getLineEnd(
            event.currentTarget.value,
            event.currentTarget.selectionStart
          );
          const lineStart = getLineStart(
            event.currentTarget.value,
            event.currentTarget.selectionStart
          );
          const currentLine = event.currentTarget.value.slice(lineStart, lineEnd);
          const atLineEnd =
            event.currentTarget.selectionStart === lineEnd &&
            event.currentTarget.selectionEnd === lineEnd;
          const nextIfBlockIndent = atLineEnd
            ? getNextIfBlockIndent(currentLine)
            : null;

          if (nextIfBlockIndent !== null) {
            event.preventDefault();
            const applied = insertNewlineWithIndentAtSelection({
              indent: nextIfBlockIndent,
              selectionEnd: event.currentTarget.selectionEnd,
              selectionStart: event.currentTarget.selectionStart,
              value: event.currentTarget.value,
            });
            applyTextareaMutation(applied.value, applied.cursor);
            return;
          }
        }

        if (
          event.key === 'Enter' &&
          event.currentTarget.selectionStart === event.currentTarget.selectionEnd &&
          (suggestions.length === 0 || selectedSuggestionIndex === null)
        ) {
          const lineEnd = getLineEnd(
            event.currentTarget.value,
            event.currentTarget.selectionStart
          );
          const lineStart = getLineStart(
            event.currentTarget.value,
            event.currentTarget.selectionStart
          );
          const currentLine = event.currentTarget.value.slice(lineStart, lineEnd);
          const atLineEnd =
            event.currentTarget.selectionStart === lineEnd &&
            event.currentTarget.selectionEnd === lineEnd;
          const currentIndent = getLineIndent(currentLine);

          if (atLineEnd && currentIndent) {
            event.preventDefault();
            const applied = insertNewlineWithIndentAtSelection({
              indent: currentIndent,
              selectionEnd: event.currentTarget.selectionEnd,
              selectionStart: event.currentTarget.selectionStart,
              value: event.currentTarget.value,
            });
            applyTextareaMutation(applied.value, applied.cursor);
            return;
          }
        }

        if (
          mode === 'reaction-text' &&
          event.key === 'Enter' &&
          event.currentTarget.selectionStart === event.currentTarget.selectionEnd &&
          (suggestions.length === 0 || selectedSuggestionIndex === null)
        ) {
          const lineEnd = getLineEnd(
            event.currentTarget.value,
            event.currentTarget.selectionStart
          );
          const lineStart = getLineStart(
            event.currentTarget.value,
            event.currentTarget.selectionStart
          );
          const currentLine = event.currentTarget.value.slice(lineStart, lineEnd);
          const atLineEnd =
            event.currentTarget.selectionStart === lineEnd &&
            event.currentTarget.selectionEnd === lineEnd;
          const isIndentedLine =
            currentLine.startsWith('    ') || currentLine.startsWith('\t');
          const isScriptBlockHeader =
            !/^\s/.test(currentLine) && currentLine.trimEnd().endsWith(':');
          const isEventConditionHeader =
            !/^\s/.test(currentLine) &&
            /^event(?:\s+(?:crossing|once|always))?:\s*\S/.test(
              currentLine.trimEnd()
            );

          if (
            atLineEnd &&
            (isIndentedLine || isScriptBlockHeader || isEventConditionHeader)
          ) {
            event.preventDefault();
            const applied = insertIndentedNewlineAtSelection({
              selectionEnd: event.currentTarget.selectionEnd,
              selectionStart: event.currentTarget.selectionStart,
              value: event.currentTarget.value,
            });
            applyTextareaMutation(applied.value, applied.cursor);
            return;
          }
        }

        if (suggestions.length > 0) {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelectedSuggestionIndex((current) =>
              current === null || current + 1 >= suggestions.length
                ? 0
                : current + 1
            );
            return;
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedSuggestionIndex((current) =>
              current === null || current === 0
                ? suggestions.length - 1
                : current - 1
            );
            return;
          }

          if (event.key === 'Enter' || event.key === 'Tab') {
            if (selectedSuggestionIndex === null) {
              return;
            }

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
          settleEditing();
          return;
        }

        shouldEnableAutocompleteOnChangeRef.current =
          shouldTriggerAutocompleteFromKey(event);
      }}
      rows={rows}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      placeholder={placeholder}
      className={`custom-scrollbar ${gridClassName} h-full w-full overflow-auto border-0 bg-transparent text-transparent caret-[color:var(--catalog-ink)] outline-none selection:bg-sky-500/25 placeholder:text-[color:var(--catalog-input-placeholder)] ${
        textareaClassName ?? 'resize-none'
      }`}
      style={{
        font: 'inherit',
        lineHeight: 'inherit',
        tabSize: 'inherit',
      }}
    />
  );

  return (
    <>
      <div className={`${className} ${mode === 'reaction-text' ? 'min-h-0' : ''}`}>
        {mode === 'reaction-text' ? (
          <div
            className={`editor-code-layout ${reactionTextGutterClassName} relative grid h-full min-h-0 overflow-hidden`}
          >
            <div
              ref={(node) => {
                highlightRef.current = node;
              }}
              aria-hidden={true}
              className="editor-code-highlight editor-code-highlight-lines custom-scrollbar absolute inset-0 m-0 overflow-auto"
              style={{
                font: 'inherit',
                lineHeight: 'inherit',
                tabSize: 'inherit',
              }}
            >
              {highlightedLines.map((line) => (
                <div key={`line-${line.lineNumber}`} className="editor-code-line">
                  <span
                    className="editor-code-line-number"
                    data-line-number={line.lineNumber}
                  >
                    {line.lineNumber}
                  </span>
                  <span className="editor-code-line-content">
                    {line.tokens.length === 0 ? (
                      <span className="editor-code-token-base">{'\u200b'}</span>
                    ) : (
                      line.tokens.map((token, index) =>
                        renderHighlightedToken(
                          token,
                          `${line.lineNumber}-${token.tone}-${index}-${token.text}`
                        )
                      )
                    )}
                  </span>
                </div>
              ))}
            </div>
            {renderTextarea(
              'editor-code-textarea-with-gutter absolute inset-0 z-10'
            )}
          </div>
        ) : (
          <div className="grid">
            <pre
              ref={(node) => {
                highlightRef.current = node;
              }}
              aria-hidden={true}
              className="editor-code-highlight custom-scrollbar col-start-1 row-start-1 m-0 overflow-auto whitespace-pre-wrap break-words"
              style={{
                font: 'inherit',
                lineHeight: 'inherit',
                tabSize: 'inherit',
              }}
            >
              {highlightedTokens.length === 0 ? (
                <span className="editor-code-token-base">{'\u200b'}</span>
              ) : (
                highlightedTokens.map((token, index) =>
                  renderHighlightedToken(
                    token,
                    `${token.tone}-${index}-${token.text}`
                  )
                )
              )}
            </pre>
            {renderTextarea('col-start-1 row-start-1')}
          </div>
        )}
      </div>

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
            <div
              className="custom-scrollbar max-h-48 overflow-y-auto"
              onWheel={() => {
                setSelectedSuggestionIndex((current) =>
                  current === null && suggestions.length > 0 ? 0 : current
                );
              }}
            >
              {suggestions.map((suggestion, suggestionIndex) => {
                const isSelected = suggestionIndex === selectedSuggestionIndex;
                return (
                  <button
                    key={`${suggestion.label}-${suggestion.replaceStart}-${suggestionIndex}`}
                    ref={(node) => {
                      suggestionItemRefs.current[suggestionIndex] = node;
                    }}
                    type="button"
                    onMouseEnter={() => setSelectedSuggestionIndex(suggestionIndex)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => acceptSuggestion(suggestion)}
                    className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left font-mono text-xs transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/18 text-cyan-50'
                        : 'text-[color:var(--catalog-ink)] hover:bg-white/6'
                    }`}
                  >
                    <span className="text-inherit">
                      {suggestion.previewText ?? suggestion.text}
                    </span>
                    <span
                      className={`text-[10px] ${
                        isSelected
                          ? 'text-cyan-100/85'
                          : 'text-[color:var(--catalog-muted)]'
                      }`}
                    >
                      {suggestion.description ?? suggestion.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-[color:var(--catalog-soft-border)] px-3 py-2 text-[10px] text-[color:var(--catalog-muted)]">
              Press `Enter` or `Tab` to accept, `Esc` to close.
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
