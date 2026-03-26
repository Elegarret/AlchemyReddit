import './index.css';
import 'emoji-picker-element';
import { navigateTo, showShareSheet, showToast } from '@devvit/web/client';
import {
  StrictMode,
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import {
  IoAddSharp,
  IoChevronDownSharp,
  IoCloseSharp,
  IoPlaySharp,
  IoRocketSharp,
  IoSaveSharp,
  IoShareOutline,
  IoTrashSharp,
  IoCopyOutline,
} from 'react-icons/io5';
import {
  DEFAULT_MOD_BG_COLOR_TOKEN,
  DEFAULT_MOD_FRAME_COLOR_TOKEN,
  getModElementClasses,
  MOD_COLOR_TOKENS,
  MOD_COLOR_OPTIONS,
} from './modding/colors';
import {
  DEFAULT_MOD_TITLE,
  buildRulesetFromDraft,
  createElementIdFromName,
  PLAYTEST_RULESET_STORAGE_KEY,
  validateModDraft,
} from './modding/runtime';
import type { ModElement, ModListItem, SaveDraftInput } from './modding/types';
import { trpc } from './trpc';
import {
  getEditorTargetModId,
  openEntry,
  setEditorTargetModId,
} from './webview-navigation';

type EditorTab = 'mine' | 'editor';

type ReactionWidgetProps = {
  index: number;
  reaction: SaveDraftInput['reactions'][number];
  elements: ModElement[];
  onCommit: (
    index: number,
    leftName: string,
    rightName: string,
    outputNames: string[]
  ) => void;
  onDelete: (index: number) => void;
  onNewReaction?: () => void;
};

const ELEMENT_DATALIST_ID = 'alchemy-mod-elements';
const DEFAULT_ELEMENT_NAME_PREFIX = 'Element';

const getSharePostUrl = (mod: Pick<ModListItem, 'sharePostId'>) => {
  if (!mod.sharePostId) {
    return null;
  }

  return `https://www.reddit.com/comments/${mod.sharePostId.replace('t3_', '')}`;
};

const deriveElementGlyph = (name: string) => {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '•';
};

type EmojiPickerElement = HTMLElement & {
  shadowRoot: ShadowRoot | null;
};

const isEmojiPickerEvent = (
  event: Event
): event is Event & { detail: { unicode: string } } => {
  const detail = Reflect.get(event, 'detail');
  if (typeof detail !== 'object' || detail === null) {
    return false;
  }

  return typeof Reflect.get(detail, 'unicode') === 'string';
};

const createStarterElement = (
  id: string,
  name: string,
  bgColorToken: string = DEFAULT_MOD_BG_COLOR_TOKEN,
  frameColorToken: string = DEFAULT_MOD_FRAME_COLOR_TOKEN
): ModElement => ({
  id,
  name,
  emoji: deriveElementGlyph(name),
  bgColorToken,
  frameColorToken,
});

const createEmptyDraft = (): SaveDraftInput => ({
  title: DEFAULT_MOD_TITLE,
  summary: '',
  startingElementIds: ['air', 'fire', 'earth', 'water'],
  elements: [
    createStarterElement('air', 'Air', 'ice', 'ocean'),
    createStarterElement('fire', 'Fire', 'sun', 'ember'),
    createStarterElement('earth', 'Earth', 'sand', 'stone'),
    createStarterElement('water', 'Water', 'ocean', 'royal'),
  ],
  reactions: [],
});

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));

const findElementByName = (elements: ModElement[], name: string) => {
  const normalized = name.trim().toLowerCase();
  return (
    elements.find(
      (element) => element.name.trim().toLowerCase() === normalized
    ) ?? null
  );
};

const ensureUniqueElementId = (elements: ModElement[], name: string) => {
  const usedIds = new Set(elements.map((element) => element.id));
  const baseId = createElementIdFromName(name);
  let nextId = baseId;
  let suffix = 2;

  while (usedIds.has(nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return nextId;
};

const getNextGeneratedElementName = (elements: ModElement[]) => {
  let suffix = 1;
  const usedNames = new Set(
    elements.map((element) => element.name.trim().toLowerCase())
  );

  while (
    usedNames.has(`${DEFAULT_ELEMENT_NAME_PREFIX}-${suffix}`.toLowerCase())
  ) {
    suffix += 1;
  }

  return `${DEFAULT_ELEMENT_NAME_PREFIX}-${suffix}`;
};

const ensureElementInDraft = (draft: SaveDraftInput, rawName: string) => {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return {
      draft,
      elementId: draft.elements[0]?.id ?? '',
    };
  }

  const existing = findElementByName(draft.elements, trimmed);
  if (existing) {
    return {
      draft,
      elementId: existing.id,
    };
  }

  const nextElement = createStarterElement(
    ensureUniqueElementId(draft.elements, trimmed),
    trimmed
  );
  return {
    draft: {
      ...draft,
      elements: [...draft.elements, nextElement],
    },
    elementId: nextElement.id,
  };
};

const EmojiDropdown = ({
  emoji,
  name,
  onChange,
}: {
  emoji: string;
  name: string;
  onChange: (emoji: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<EmojiPickerElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (pickerRef.current && pickerRef.current.contains(e.target as Node)) {
        return;
      }
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    const picker = pickerRef.current;
    if (isOpen && picker) {
      const handleEmoji = (event: Event) => {
        if (!isEmojiPickerEvent(event)) {
          return;
        }

        onChange(event.detail.unicode);
        setIsOpen(false);
      };
      picker.addEventListener('emoji-click', handleEmoji);
      return () => picker.removeEventListener('emoji-click', handleEmoji);
    }
  }, [isOpen, onChange]);

  return (
    <div
      className="absolute top-0 left-0 z-10 h-[calc(100%-12px)] w-full"
      ref={ref}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
          if (!isOpen && name) {
            setTimeout(() => {
              const picker = pickerRef.current;
              if (picker && picker.shadowRoot) {
                const input = picker.shadowRoot.querySelector('input');
                if (input instanceof HTMLInputElement) {
                  input.value = name;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }
            }, 50);
          }
        }}
        className="realm-text-ink flex h-full w-full cursor-pointer items-center justify-center bg-transparent pb-0.5 text-[26px] font-black outline-none hover:bg-white/10"
      >
        {emoji}
      </button>

      {isOpen &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[99999] flex items-center justify-center">
            <div
              className="pointer-events-auto overflow-hidden rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onDragStart={(e) => e.stopPropagation()}
            >
              <emoji-picker
                ref={pickerRef}
                class="dark"
                dataSource="/emoji-data.json"
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

const ElementPreview = ({
  element,
  onChangeEmoji,
  draggable,
}: {
  element: ModElement;
  onChangeEmoji?: (emoji: string) => void;
  draggable?: boolean;
}) => {
  const handleDragStart = (e: DragEvent) => {
    if (draggable) {
      e.dataTransfer.setData('text/plain', element.name);
      e.dataTransfer.effectAllowed = 'copy';
    }
  };

  const customBg = element.bgColorToken.startsWith('#')
    ? element.bgColorToken
    : undefined;
  const customFrame = element.frameColorToken.startsWith('#')
    ? element.frameColorToken
    : undefined;

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      className={`relative flex flex-col items-center justify-end overflow-hidden rounded-xl border-2 ${getModElementClasses(element.bgColorToken, element.frameColorToken)} h-12 w-12 shrink-0 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{
        ...(customBg ? { backgroundColor: customBg } : {}),
        ...(customFrame ? { borderColor: customFrame } : {}),
      }}
    >
      {onChangeEmoji ? (
        <EmojiDropdown
          emoji={element.emoji}
          name={element.name}
          onChange={onChangeEmoji}
        />
      ) : (
        <div className="realm-text-ink flex flex-1 items-center justify-center pb-0.5 text-[26px] font-black">
          {element.emoji}
        </div>
      )}
      <div className="z-0 flex h-3 w-full items-center justify-center bg-black/25 text-center text-[7px] leading-none font-bold tracking-[0.1em] text-white uppercase">
        {element.name.slice(0, 8)}
      </div>
    </div>
  );
};

const ColorPicker = ({
  value,
  onChange,
  type,
}: {
  value: string;
  onChange: (value: string) => void;
  type: 'bg' | 'frame';
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeOption =
    MOD_COLOR_OPTIONS.find((opt) => opt.value === value) ||
    MOD_COLOR_OPTIONS[0]!;
  const isCustom = value.startsWith('#');
  const activeDefinition =
    MOD_COLOR_TOKENS[value] ?? MOD_COLOR_TOKENS[DEFAULT_MOD_BG_COLOR_TOKEN]!;
  const framePreviewClass = !isCustom
    ? activeDefinition.frameClass.replace('border-', 'bg-')
    : undefined;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex h-8 w-8 shrink-0 items-end justify-end overflow-hidden rounded-lg border-2 transition-opacity outline-none hover:opacity-90 ${
          isCustom
            ? 'border-white/20'
            : type === 'bg'
              ? activeOption.swatchClass
              : `${framePreviewClass ?? 'bg-white/40'} border-white/20`
        }`}
        style={
          isCustom
            ? type === 'bg'
              ? { backgroundColor: value }
              : { backgroundColor: value, borderColor: 'rgba(255,255,255,0.2)' }
            : undefined
        }
      >
        <div className="absolute right-0 bottom-0 rounded-tl bg-black/50 p-0.5">
          <IoChevronDownSharp size={10} className="text-white" />
        </div>
      </button>

      {isOpen && (
        <div className="realm-panel absolute top-full right-0 z-50 mt-2 w-40 rounded-xl p-2 shadow-2xl">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="catalog-title-font realm-text-muted text-[10px] font-bold tracking-widest uppercase">
              {type} Color
            </div>
            <div className="relative h-4 w-4 overflow-hidden rounded border border-white/20 shadow-sm">
              <input
                type="color"
                value={isCustom ? value : '#2ba6ff'}
                onChange={(e) => onChange(e.target.value)}
                className="absolute -top-2 -left-2 h-8 w-8 cursor-pointer"
              />
            </div>
          </div>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
            {MOD_COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10 ${value === option.value ? 'bg-white/10' : ''}`}
              >
                <div
                  className={`h-4 w-4 rounded-sm border ${option.swatchClass}`}
                />
                <span className="realm-text-soft">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const DroppableInput = ({
  value,
  onChange,
  onBlur,
  onClear,
  placeholder,
  className,
  onEnter,
  onDropValue,
}: {
  value: string;
  onChange: (val: string) => void;
  onBlur?: (() => void) | undefined;
  onClear?: (() => void) | undefined;
  placeholder: string;
  className?: string | undefined;
  onEnter?: (() => void) | undefined;
  onDropValue?: ((val: string) => void) | undefined;
}) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const data = e.dataTransfer.getData('text/plain');
    if (data) {
      if (onDropValue) {
        onDropValue(data);
        return;
      }
      onChange(data);
      if (onBlur) setTimeout(onBlur, 50);
    }
  };

  return (
    <div
      className={`relative flex min-w-0 flex-1 items-center ${dragOver ? 'ring-2 ring-cyan-400' : ''} rounded-lg ${className}`}
    >
      <input
        list={ELEMENT_DATALIST_ID}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        placeholder={placeholder}
        className={`w-full bg-transparent px-2.5 py-1.5 text-sm outline-none ${onClear ? 'pr-7' : ''}`}
      />
      {onClear && value && (
        <button
          type="button"
          onClick={onClear}
          className="realm-button-muted absolute right-1.5 shrink-0 rounded-md p-0.5 text-[10px]"
        >
          <IoCloseSharp size={12} />
        </button>
      )}
    </div>
  );
};

const ReactionWidget = ({
  index,
  reaction,
  elements,
  onCommit,
  onDelete,
  onNewReaction,
}: ReactionWidgetProps) => {
  const outputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(
    null
  );

  const leftName =
    elements.find((element) => element.id === reaction.leftId)?.name ?? '';
  const rightName =
    elements.find((element) => element.id === reaction.rightId)?.name ?? '';
  const outputNames = reaction.outputIds.map(
    (outputId) =>
      elements.find((element) => element.id === outputId)?.name ?? ''
  );

  const [leftText, setLeftText] = useState(leftName);
  const [rightText, setRightText] = useState(rightName);
  const [outputTexts, setOutputTexts] = useState<string[]>(
    outputNames.length > 0 ? outputNames : ['']
  );

  useEffect(() => {
    setLeftText(leftName);
  }, [leftName]);

  useEffect(() => {
    setRightText(rightName);
  }, [rightName]);

  useEffect(() => {
    setOutputTexts(outputNames.length > 0 ? outputNames : ['']);
  }, [
    reaction.outputIds.join('|'),
    elements.map((element) => `${element.id}:${element.name}`).join('|'),
  ]);

  useEffect(() => {
    if (pendingFocusIndex === null) {
      return;
    }

    const target = outputRefs.current[pendingFocusIndex];
    if (target) {
      target.focus();
    }
    setPendingFocusIndex(null);
  }, [pendingFocusIndex, outputTexts.length]);

  const commit = (
    nextLeftText: string = leftText,
    nextRightText: string = rightText,
    nextOutputTexts: string[] = outputTexts
  ) => {
    onCommit(index, nextLeftText, nextRightText, nextOutputTexts);
  };

  const removeOutput = (outputIndex: number) => {
    const next = outputTexts.filter((_, i) => i !== outputIndex);
    if (next.length === 0) next.push('');
    setOutputTexts(next);
    commit(leftText, rightText, next);
  };

  return (
    <div className="realm-panel-soft flex flex-col gap-2 overflow-hidden rounded-xl p-2">
      <div className="flex w-full flex-nowrap items-center gap-1.5">
        <DroppableInput
          value={leftText}
          onChange={setLeftText}
          onBlur={() => commit()}
          onClear={() => {
            setLeftText('');
            commit('', rightText, outputTexts);
          }}
          onEnter={() => commit()}
          placeholder="A"
          className="realm-input border"
        />
        <div className="catalog-title-font realm-text-ink shrink-0 text-center font-black">+</div>
        <DroppableInput
          value={rightText}
          onChange={setRightText}
          onBlur={() => commit()}
          onClear={() => {
            setRightText('');
            commit(leftText, '', outputTexts);
          }}
          onEnter={() => commit()}
          placeholder="B"
          className="realm-input border"
        />
        <button
          onClick={() => onDelete(index)}
          className="realm-button-muted ml-1 shrink-0 rounded p-1 hover:bg-rose-500/20 hover:text-rose-300"
        >
          <IoCloseSharp size={16} />
        </button>
      </div>

      <div className="flex w-full flex-wrap items-center gap-1.5 pl-1">
        <div className="shrink-0 font-black text-emerald-300">=</div>
        {outputTexts.map((outputText, outputIndex) => (
          <DroppableInput
            key={`reaction-${index}-output-${outputIndex}`}
            value={outputText}
            onChange={(val) => {
              const next = [...outputTexts];
              next[outputIndex] = val;
              setOutputTexts(next);
            }}
            onBlur={() => commit(leftText, rightText, outputTexts)}
            onClear={() => removeOutput(outputIndex)}
            onEnter={() => {
              commit(leftText, rightText, outputTexts);
              if (outputIndex === outputTexts.length - 1 && onNewReaction) {
                onNewReaction();
              }
            }}
            placeholder={`Result ${outputIndex + 1}`}
            className="realm-input min-w-[6rem] border"
          />
        ))}
        <button
          onClick={() => {
            setOutputTexts((current) => [...current, '']);
            setPendingFocusIndex(outputTexts.length);
          }}
          className="realm-button-accent shrink-0 rounded-lg p-1"
        >
          <IoAddSharp size={16} />
        </button>
      </div>
    </div>
  );
};

const App = () => {
  const [tab, setTab] = useState<EditorTab>('editor');
  const [draft, setDraft] = useState<SaveDraftInput>(createEmptyDraft);
  const [myMods, setMyMods] = useState<ModListItem[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [elementSearch, setElementSearch] = useState('');
  const [reactionSearch, setReactionSearch] = useState('');
  const [newStartingText, setNewStartingText] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [pendingRemoveModId, setPendingRemoveModId] = useState<string | null>(
    null
  );

  const [reactionView, setReactionView] = useState<'visual' | 'text'>('visual');
  const [reactionText, setReactionText] = useState('');

  const syncDraftFromText = (text: string) => {
    updateDraft((currentDraft) => {
      let nextDraft = currentDraft;
      const newReactions: SaveDraftInput['reactions'] = [];

      const lines = text.split('\n');
      for (const line of lines) {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const inputsStr = parts[0]?.trim() || '';
          const outputsStr = parts[1]?.trim() || '';
          const inputParts = inputsStr
            .split('+')
            .map((s) => s.trim())
            .filter(Boolean);
          const outputParts = outputsStr
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

          if (inputParts.length > 0 && outputParts.length > 0) {
            const leftName = inputParts[0] as string;
            const rightName = (inputParts[1] || inputParts[0]) as string;

            const leftResolved = ensureElementInDraft(nextDraft, leftName);
            nextDraft = leftResolved.draft;

            const rightResolved = ensureElementInDraft(nextDraft, rightName);
            nextDraft = rightResolved.draft;

            const outputIds: string[] = [];
            for (const outName of outputParts) {
              const outResolved = ensureElementInDraft(nextDraft, outName);
              nextDraft = outResolved.draft;
              outputIds.push(outResolved.elementId);
            }

            newReactions.push({
              leftId: leftResolved.elementId,
              rightId: rightResolved.elementId,
              outputIds: outputIds,
            });
          }
        }
      }

      return { ...nextDraft, reactions: newReactions };
    });
  };

  const toggleReactionView = () => {
    if (reactionView === 'visual') {
      const lines = draft.reactions.map((r) => {
        const left = draft.elements.find((e) => e.id === r.leftId)?.name || '';
        const right =
          draft.elements.find((e) => e.id === r.rightId)?.name || '';
        const outs = r.outputIds
          .map((oid) => draft.elements.find((e) => e.id === oid)?.name || '')
          .join(', ');
        return `${left} + ${right} = ${outs}`;
      });
      setReactionText(lines.join('\n') + (lines.length > 0 ? '\n' : ''));
      setReactionView('text');
    } else {
      syncDraftFromText(reactionText);
      setReactionView('visual');
    }
  };

  const validation = useMemo(() => validateModDraft(draft), [draft]);
  const loadedMod = loadedDraftId
    ? myMods.find((mod) => mod.id === loadedDraftId) ?? null
    : null;
  const isLoadedModPublished = loadedMod?.status === 'published';
  const loadedSharePostUrl = loadedMod ? getSharePostUrl(loadedMod) : null;

  const refreshLists = async () => {
    setMyMods(await trpc.mods.listMine.query());
  };

  useEffect(() => {
    refreshLists().catch((error) => {
      console.error(error);
      showToast('Failed to load mods');
    });
  }, []);

  const updateDraft = (
    updater: (current: SaveDraftInput) => SaveDraftInput
  ) => {
    setDraft((current) => updater(current));
  };

  const addElement = () => {
    updateDraft((current) => {
      const baseName = getNextGeneratedElementName(current.elements);
      const nextElement = createStarterElement(
        ensureUniqueElementId(current.elements, baseName),
        baseName
      );

      return {
        ...current,
        elements: [...current.elements, nextElement],
      };
    });
  };

  const renameElement = (elementId: string, nextName: string) => {
    updateDraft((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === elementId
          ? {
              ...element,
              name: nextName,
            }
          : element
      ),
    }));
  };

  const updateElementEmoji = (elementId: string, emoji: string) => {
    updateDraft((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === elementId ? { ...element, emoji } : element
      ),
    }));
  };

  const updateElementColors = (
    elementId: string,
    patch: Pick<ModElement, 'bgColorToken' | 'frameColorToken'>
  ) => {
    updateDraft((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === elementId
          ? {
              ...element,
              ...patch,
            }
          : element
      ),
    }));
  };

  const removeElement = (elementId: string) => {
    updateDraft((current) => ({
      ...current,
      elements: current.elements.filter((element) => element.id !== elementId),
      startingElementIds: current.startingElementIds.filter(
        (id) => id !== elementId
      ),
      reactions: current.reactions
        .filter(
          (reaction) =>
            reaction.leftId !== elementId && reaction.rightId !== elementId
        )
        .map((reaction) => ({
          ...reaction,
          outputIds: reaction.outputIds.filter(
            (outputId) => outputId !== elementId
          ),
        }))
        .filter((reaction) => reaction.outputIds.length > 0),
    }));
  };

  const addStartingElement = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateDraft((current) => {
      const resolved = ensureElementInDraft(current, trimmed);
      return {
        ...resolved.draft,
        startingElementIds: [
          ...resolved.draft.startingElementIds,
          resolved.elementId,
        ],
      };
    });
  };

  const removeStartingElement = (indexToRemove: number) => {
    updateDraft((current) => ({
      ...current,
      startingElementIds: current.startingElementIds.filter(
        (_, index) => index !== indexToRemove
      ),
    }));
  };

  const addReaction = () => {
    const first = draft.elements[0]?.id;
    const second = draft.elements[1]?.id ?? draft.elements[0]?.id;
    if (!first || !second) {
      showToast('Add elements first');
      return;
    }

    const emptyReactionExists = draft.reactions.some(
      (r) =>
        r.leftId === first &&
        r.rightId === second &&
        r.outputIds.length === 1 &&
        r.outputIds[0] === first
    );
    if (emptyReactionExists) return;

    updateDraft((current) => ({
      ...current,
      reactions: [
        ...current.reactions,
        { leftId: first, rightId: second, outputIds: [first] },
      ],
    }));
  };

  const commitReaction = (
    index: number,
    leftName: string,
    rightName: string,
    outputNames: string[]
  ) => {
    const leftTrimmed = leftName.trim();
    const rightTrimmed = rightName.trim();
    if (!leftTrimmed || !rightTrimmed) {
      return;
    }

    let nextDraft = draft;
    const leftResolved = ensureElementInDraft(nextDraft, leftTrimmed);
    nextDraft = leftResolved.draft;
    const rightResolved = ensureElementInDraft(nextDraft, rightTrimmed);
    nextDraft = rightResolved.draft;

    const outputIds: string[] = [];
    for (const outputName of outputNames) {
      const trimmed = outputName.trim();
      if (!trimmed) {
        continue;
      }
      const resolved = ensureElementInDraft(nextDraft, trimmed);
      nextDraft = resolved.draft;
      outputIds.push(resolved.elementId);
    }

    if (outputIds.length === 0) {
      outputIds.push(leftResolved.elementId);
    }

    setDraft({
      ...nextDraft,
      reactions: nextDraft.reactions.map((reaction, reactionIndex) =>
        reactionIndex === index
          ? {
              leftId: leftResolved.elementId,
              rightId: rightResolved.elementId,
              outputIds,
            }
          : reaction
      ),
    });
  };

  const deleteReaction = (index: number) => {
    updateDraft((current) => ({
      ...current,
      reactions: current.reactions.filter(
        (_, reactionIndex) => reactionIndex !== index
      ),
    }));
  };

  const persistDraftSilently = async () => {
    const saved = await trpc.mods.saveDraft.mutate({
      ...draft,
      ...(loadedDraftId ? { id: loadedDraftId } : {}),
    });
    setLoadedDraftId(saved.id);
    return saved.id;
  };

  const saveDraft = async () => {
    setIsBusy(true);
    try {
      const savedId = await persistDraftSilently();
      setLoadedDraftId(savedId);
      showToast('Draft saved');
      await refreshLists();
    } catch (error) {
      console.error(error);
      showToast(
        error instanceof Error ? error.message : 'Failed to save draft'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const publishDraft = async () => {
    if (!validation.isValid) {
      showToast(validation.errors[0] ?? 'Fix validation errors first');
      return;
    }

    setIsBusy(true);
    try {
      const modId = await persistDraftSilently();

      if (!modId) {
        throw new Error('Missing draft id');
      }

      const published = await trpc.mods.publish.mutate(modId);
      showToast('Realm published');
      setShareUrl(null);
      await refreshLists();
      navigateTo(published.sharePost.url);
    } catch (error) {
      console.error(error);
      showToast(
        error instanceof Error ? error.message : 'Failed to publish mod'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const unpublishDraft = async () => {
    if (!loadedDraftId) {
      showToast('Save the mod first');
      return;
    }

    setIsBusy(true);
    try {
      await trpc.mods.unpublish.mutate(loadedDraftId);
      showToast('Realm moved back to drafts');
      setShareUrl(null);
      await refreshLists();
    } catch (error) {
      console.error(error);
      showToast(
        error instanceof Error ? error.message : 'Failed to unpublish mod'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const shareDraft = async () => {
    if (!loadedDraftId || !isLoadedModPublished) {
      showToast('Publish the mod first');
      return;
    }

    setIsBusy(true);
    try {
      const nextShareUrl =
        loadedSharePostUrl ??
        (await trpc.mods.createSharePost.mutate(loadedDraftId)).url;
      setShareUrl(nextShareUrl);
      showToast('Share link ready');
      await refreshLists();
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : 'Failed to share mod');
    } finally {
      setIsBusy(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied');
    } catch (error) {
      console.error(error);
      showToast('Failed to copy link');
    }
  };

  const openNativeShare = async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await showShareSheet({
        title: draft.title,
        text: shareUrl,
        data: shareUrl,
      });
    } catch (error) {
      console.error(error);
      showToast('Failed to open share sheet');
    }
  };

  const playtestDraft = async (event: MouseEvent<HTMLButtonElement>) => {
    if (!validation.isValid) {
      showToast(validation.errors[0] ?? 'Fix validation errors first');
      return;
    }

    setIsBusy(true);
    try {
      const modId = await persistDraftSilently();
      localStorage.setItem(
        PLAYTEST_RULESET_STORAGE_KEY,
        JSON.stringify(
          buildRulesetFromDraft({
            ...draft,
            ...(modId ? { id: modId } : {}),
          })
        )
      );
      openEntry(event.nativeEvent, 'game');
    } catch (error) {
      console.error(error);
      showToast(
        error instanceof Error ? error.message : 'Failed to prepare playtest'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const loadDraftFromServer = async (modId: string) => {
    setIsBusy(true);
    try {
      const loaded = await trpc.mods.getDraft.query(modId);
      if (!loaded) {
        showToast('Draft not found');
        return;
      }

      setDraft({
        id: loaded.id,
        title: loaded.title,
        summary: loaded.summary,
        startingElementIds: loaded.startingElementIds,
        elements: loaded.elements,
        reactions: loaded.reactions,
      });
      setLoadedDraftId(loaded.id);
      setShareUrl(null);
      setPendingRemoveModId(null);
      setEditorTargetModId(null);
      setTab('editor');
    } catch (error) {
      console.error(error);
      showToast(
        error instanceof Error ? error.message : 'Failed to load draft'
      );
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    const targetModId = getEditorTargetModId();
    if (!targetModId || targetModId === loadedDraftId) {
      return;
    }

    loadDraftFromServer(targetModId).catch((error) => {
      console.error(error);
      showToast('Failed to load selected realm');
    });
  }, [loadedDraftId]);

  const removeMyMod = async (modId: string) => {
    if (pendingRemoveModId !== modId) {
      setPendingRemoveModId(modId);
      return;
    }

    setIsBusy(true);
    try {
      await trpc.mods.remove.mutate(modId);
      if (loadedDraftId === modId) {
        setDraft(createEmptyDraft());
        setLoadedDraftId(null);
        setShareUrl(null);
        setEditorTargetModId(null);
      }
      setPendingRemoveModId(null);
      await refreshLists();
      showToast('Realm removed');
    } catch (error) {
      console.error(error);
      setPendingRemoveModId(null);
      showToast(
        error instanceof Error ? error.message : 'Failed to remove realm'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const filteredElements = draft.elements.filter((element) =>
    element.name.toLowerCase().includes(elementSearch.toLowerCase())
  );

  const filteredReactions = draft.reactions.filter((reaction) => {
    if (!reactionSearch) {
      return true;
    }

    const leftName =
      draft.elements.find((element) => element.id === reaction.leftId)?.name ??
      '';
    const rightName =
      draft.elements.find((element) => element.id === reaction.rightId)?.name ??
      '';
    const outputNames = reaction.outputIds
      .map(
        (outputId) =>
          draft.elements.find((element) => element.id === outputId)?.name ?? ''
      )
      .join(' ');

    return `${leftName} ${rightName} ${outputNames}`
      .toLowerCase()
      .includes(reactionSearch.toLowerCase());
  });

  return (
    <div className="realm-page min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6">
        <datalist id={ELEMENT_DATALIST_ID}>
          {draft.elements.map((element) => (
            <option key={`element-option-${element.id}`} value={element.name} />
          ))}
        </datalist>

        {shareUrl && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
            onClick={() => setShareUrl(null)}
          >
            <div
              className="realm-panel w-full max-w-sm rounded-3xl p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="catalog-title-font realm-text-muted text-[11px] font-bold tracking-[0.24em] uppercase">
                Share Realm
              </div>
              <h2 className="catalog-title-font realm-text-ink mt-2 text-xl font-black">{draft.title}</h2>
              <p className="realm-text-soft mt-2 text-sm">
                Share the published post for this realm.
              </p>
              <div className="realm-panel-soft mt-4 rounded-2xl px-4 py-3 text-sm break-all">
                {shareUrl}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={copyShareUrl}
                  className="realm-button-primary catalog-title-font cursor-pointer rounded-full px-4 py-2 text-sm font-bold"
                >
                  <IoCopyOutline className="mr-1 inline-block" />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={openNativeShare}
                  className="realm-button-accent catalog-title-font cursor-pointer rounded-full px-4 py-2 text-sm font-bold"
                >
                  <IoShareOutline className="mr-1 inline-block" />
                  Share
                </button>
                <button
                  type="button"
                  onClick={() => setShareUrl(null)}
                  className="realm-button-muted catalog-title-font cursor-pointer rounded-full px-4 py-2 text-sm font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="realm-panel mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl px-4 py-4 backdrop-blur-xl">
          <div>
            <div className="catalog-title-font realm-text-muted text-[11px] font-bold tracking-[0.24em] uppercase">
              Alchemy Workshop
            </div>
            <h1 className="catalog-title-font realm-text-ink text-2xl font-black tracking-tight">
              Create and Share Mods
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTab('mine')}
              className={`catalog-title-font rounded-full px-4 py-2 text-sm font-bold ${tab === 'mine' ? 'realm-button-accent' : 'realm-button-muted'}`}
            >
              My Mods
            </button>
            <button
              onClick={() => setTab('editor')}
              className={`catalog-title-font rounded-full px-4 py-2 text-sm font-bold ${tab === 'editor' ? 'realm-button-accent' : 'realm-button-muted'}`}
            >
              Editor
            </button>
          </div>
        </div>

        {tab === 'mine' && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myMods.map((mod) => (
              <div
                key={mod.id}
                className="realm-panel rounded-3xl p-5 backdrop-blur-xl"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="catalog-title-font realm-text-ink text-xl font-black">
                      {mod.title}
                    </h2>
                    <p className="realm-text-soft mt-1 text-sm">
                      {mod.summary || 'No summary provided.'}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.18em] uppercase ${mod.status === 'published' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-300/20 text-amber-100'}`}
                  >
                    {mod.status}
                  </span>
                </div>
                <div className="realm-text-soft mb-5 space-y-1 text-sm">
                  <div>By {mod.ownerUsername}</div>
                  <div>
                    {mod.elementCount} elements, {mod.reactionCount} reactions
                  </div>
                  <div>Updated {formatDate(mod.updatedAt)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => loadDraftFromServer(mod.id)}
                    className="realm-button-accent catalog-title-font cursor-pointer rounded-full px-4 py-2 text-sm font-bold"
                  >
                    Edit
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => removeMyMod(mod.id)}
                    className="cursor-pointer rounded-full bg-rose-500/85 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <IoTrashSharp className="mr-1 inline-block" />
                    {pendingRemoveModId === mod.id
                      ? 'Press Again To Confirm'
                      : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
            {myMods.length === 0 && (
              <div className="realm-panel-soft realm-text-soft rounded-3xl border border-dashed p-8 text-center">
                You have not saved any mods yet.
              </div>
            )}
          </div>
        )}

        {tab === 'editor' && (
          <div className="flex flex-1 flex-col gap-4">
            <div className="realm-panel rounded-3xl p-5 backdrop-blur-xl">
              <div className="mb-4 flex flex-col gap-4">
                <div className="w-full">
                  <div className="catalog-title-font realm-text-muted mb-2 text-[11px] font-bold tracking-[0.24em] uppercase">
                    Mod Info
                  </div>
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className="realm-input catalog-title-font mb-3 w-full rounded-2xl border px-4 py-3 text-2xl font-black outline-none"
                  />
                  <textarea
                    value={draft.summary}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                    placeholder="Describe the mod"
                    rows={2}
                    className="realm-input catalog-body-font w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={isBusy}
                    onClick={playtestDraft}
                    className="realm-button-accent catalog-title-font cursor-pointer rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <IoPlaySharp className="mr-1 inline-block" />
                    Playtest
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={saveDraft}
                    className="realm-button-primary catalog-title-font cursor-pointer rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <IoSaveSharp className="mr-1 inline-block" />
                    Save
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={isLoadedModPublished ? unpublishDraft : publishDraft}
                    className="realm-button-accent catalog-title-font cursor-pointer rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <IoRocketSharp className="mr-1 inline-block" />
                    {isLoadedModPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    disabled={isBusy || !isLoadedModPublished}
                    onClick={shareDraft}
                    className="realm-button-accent catalog-title-font cursor-pointer rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <IoShareOutline className="mr-1 inline-block" />
                    Share
                  </button>
                  <button
                    disabled={isBusy || !loadedSharePostUrl}
                    onClick={() => {
                      if (loadedSharePostUrl) {
                        navigateTo(loadedSharePostUrl);
                      }
                    }}
                    className="realm-button-muted catalog-title-font cursor-pointer rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Go To Mod&apos;s Page
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="catalog-title-font realm-text-muted text-[11px] font-bold tracking-[0.24em] uppercase">
                      Starting Elements
                    </div>
                    <div className="realm-text-muted text-xs">
                      {draft.startingElementIds.length}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {draft.startingElementIds.map((id, index) => {
                      const el = draft.elements.find((e) => e.id === id);
                      return el ? (
                        <div
                          key={`starting-${id}-${index}`}
                          className="flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-400/18 py-1 pr-1 pl-2 text-sm font-bold text-emerald-50"
                        >
                          <span>{el.name}</span>
                          <button
                            onClick={() => removeStartingElement(index)}
                            className="ml-0.5 text-emerald-200/70 hover:text-white"
                          >
                            <IoCloseSharp size={16} />
                          </button>
                        </div>
                      ) : null;
                    })}
                    <div className="ml-1 flex items-center">
                      <DroppableInput
                        value={newStartingText}
                        onChange={setNewStartingText}
                        onDropValue={(value) => {
                          addStartingElement(value);
                          setNewStartingText('');
                        }}
                        onClear={
                          newStartingText
                            ? () => setNewStartingText('')
                            : undefined
                        }
                        placeholder="Add starter"
                         className="realm-input w-28 rounded-l-lg border"
                        onEnter={() => {
                          addStartingElement(newStartingText);
                          setNewStartingText('');
                        }}
                      />
                      <button
                        onClick={() => {
                          addStartingElement(newStartingText);
                          setNewStartingText('');
                        }}
                        className="realm-button-accent cursor-pointer rounded-r-lg px-2 py-1.5"
                      >
                        <IoAddSharp size={20} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="realm-panel-soft rounded-2xl p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="catalog-title-font realm-text-ink text-sm font-black">
                      Validation
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.16em] uppercase ${validation.isValid ? 'bg-emerald-400/20 text-emerald-100' : 'bg-rose-400/20 text-rose-100'}`}
                    >
                      {validation.isValid ? 'Ready' : 'Blocked'}
                    </span>
                  </div>
                  <div className="realm-text-soft mb-3 text-sm">
                    {validation.reachableElementIds.length}/
                    {validation.totalElements} reachable
                  </div>
                  {validation.errors.length > 0 && (
                    <div className="space-y-2">
                      {validation.errors.slice(0, 3).map((error) => (
                        <div
                          key={error}
                          className="rounded-xl bg-rose-400/12 px-3 py-2 text-sm text-rose-100"
                        >
                          {error}
                        </div>
                      ))}
                    </div>
                  )}
                  {validation.errors.length === 0 &&
                    validation.warnings.length > 0 && (
                      <div className="space-y-2">
                        {validation.warnings.slice(0, 2).map((warning) => (
                          <div
                            key={warning}
                            className="rounded-xl bg-amber-300/12 px-3 py-2 text-sm text-amber-50"
                          >
                            {warning}
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            </div>

            <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="realm-panel rounded-3xl p-3 backdrop-blur-xl lg:p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="catalog-title-font realm-text-muted text-[11px] font-bold tracking-[0.24em] uppercase">
                      Elements
                    </div>
                    <div className="realm-text-soft text-sm">
                      {draft.elements.length} total
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DroppableInput
                      value={elementSearch}
                      onChange={setElementSearch}
                      onClear={
                        elementSearch ? () => setElementSearch('') : undefined
                      }
                      placeholder="Search elements"
                      className="realm-input w-24 border sm:w-32 lg:w-44"
                    />
                    <button
                      onClick={addElement}
                      className="realm-button-accent shrink-0 rounded-md px-3 py-1.5 font-bold"
                    >
                      <IoAddSharp size={18} />
                    </button>
                  </div>
                </div>

                <div className="custom-scrollbar h-[500px] space-y-3 overflow-y-auto pr-2 pb-6">
                  {filteredElements.map((element) => (
                    <div
                      key={element.id}
                      className="realm-panel-soft relative rounded-xl p-2 pt-4"
                    >
                      <button
                        onClick={() => removeElement(element.id)}
                        className="absolute top-1 right-1 rounded-full bg-white/5 p-1 text-white/40 hover:bg-rose-500/20 hover:text-rose-300"
                      >
                        <IoCloseSharp size={12} />
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
                        <ElementPreview
                          element={element}
                          onChangeEmoji={(val) =>
                            updateElementEmoji(element.id, val)
                          }
                          draggable={true}
                        />
                        <div className="flex min-w-[12rem] flex-1 items-center gap-1.5 pr-1 sm:min-w-0">
                          <input
                            value={element.name}
                            onChange={(event) =>
                              renameElement(element.id, event.target.value)
                            }
                            placeholder="Name"
                            className="realm-input min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm outline-none"
                          />
                          <ColorPicker
                            type="bg"
                            value={element.bgColorToken}
                            onChange={(val) =>
                              updateElementColors(element.id, {
                                bgColorToken: val,
                                frameColorToken: element.frameColorToken,
                              })
                            }
                          />
                          <ColorPicker
                            type="frame"
                            value={element.frameColorToken}
                            onChange={(val) =>
                              updateElementColors(element.id, {
                                bgColorToken: element.bgColorToken,
                                frameColorToken: val,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="realm-panel rounded-3xl p-3 backdrop-blur-xl lg:p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="catalog-title-font realm-text-muted text-[11px] font-bold tracking-[0.24em] uppercase">
                      Reactions
                    </div>
                    <button
                      onClick={toggleReactionView}
                      className="realm-button-muted catalog-title-font rounded px-2 py-1 text-[9px] font-bold tracking-widest uppercase transition-colors"
                    >
                      {reactionView === 'visual'
                        ? 'Text Editor'
                        : 'Visual Editor'}
                    </button>
                    <div className="realm-text-soft hidden text-sm lg:block">
                      {draft.reactions.length} total
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {reactionView === 'visual' && (
                      <>
                        <DroppableInput
                          value={reactionSearch}
                          onChange={setReactionSearch}
                          onClear={
                            reactionSearch
                              ? () => setReactionSearch('')
                              : undefined
                          }
                          placeholder="Search reactions"
                          className="realm-input w-24 border sm:w-32 lg:w-44"
                        />
                        <button
                          onClick={addReaction}
                          className="realm-button-accent shrink-0 rounded-md px-3 py-1.5 font-bold"
                        >
                          <IoAddSharp size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {reactionView === 'visual' ? (
                  <div className="custom-scrollbar h-[500px] space-y-3 overflow-y-auto pr-2 pb-6">
                    {filteredReactions.map((reaction, index) => (
                      <ReactionWidget
                        key={`${reaction.leftId}-${reaction.rightId}-${index}`}
                        index={index}
                        reaction={reaction}
                        elements={draft.elements}
                        onCommit={commitReaction}
                        onDelete={deleteReaction}
                        onNewReaction={addReaction}
                      />
                    ))}

                    {filteredReactions.length === 0 && (
                      <div className="realm-panel-soft realm-text-soft rounded-xl border border-dashed p-6 text-center text-sm">
                        <div>No reactions yet. Add one to make the mod playable.</div>
                        <button
                          type="button"
                          onClick={addReaction}
                          className="realm-button-accent catalog-title-font mt-4 cursor-pointer rounded-full px-4 py-2 font-bold"
                        >
                          Add First Reaction
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-[500px] pb-6">
                    <textarea
                      value={reactionText}
                      onChange={(e) => setReactionText(e.target.value)}
                      onBlur={() => syncDraftFromText(reactionText)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.currentTarget.value + '\n';
                          setTimeout(() => syncDraftFromText(val), 0);
                        }
                      }}
                      placeholder="Water + Fire = Steam, Fog&#10;Earth + Air = Dust"
                      className="realm-input custom-scrollbar h-full w-full resize-none rounded-xl border p-4 font-mono text-sm font-bold outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
