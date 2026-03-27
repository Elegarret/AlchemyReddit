import './index.css';
import 'emoji-picker-element';
import { navigateTo, showShareSheet, showToast } from '@devvit/web/client';
import {
  StrictMode,
  type CSSProperties,
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import {
  IoAddSharp,
  IoChevronDownSharp,
  IoCloseSharp,
  IoColorPaletteSharp,
  IoEllipsisHorizontal,
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
  resolveModElementColors,
} from './modding/colors';
import {
  DEFAULT_MOD_TITLE,
  buildRulesetFromDraft,
  createElementIdFromName,
  PLAYTEST_RULESET_STORAGE_KEY,
  validateModDraft,
} from './modding/runtime';
import {
  MAX_ELEMENT_MESSAGE_LENGTH,
  MAX_REALM_INTRO_LENGTH,
  MAX_REALM_SUMMARY_LENGTH,
  type ModElementEffect,
  type ModElement,
  type ModListItem,
  type SaveDraftInput,
} from './modding/types';
import { trpc } from './trpc';
import {
  getEditorTargetModId,
  openEntry,
  setEditorTargetModId,
} from './webview-navigation';

type EditorTab = 'mine' | 'editor';
type ElementPanelView = 'extended' | 'compact';

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
const ELEMENT_EFFECT_OPTIONS: Array<{
  value: ModElementEffect;
  label: string;
  description: string;
}> = [
  {
    value: 'none',
    label: 'None',
    description: 'No special runtime behavior.',
  },
  {
    value: 'explode',
    label: 'Explode',
    description: 'Triggers the existing explosion table effect.',
  },
  {
    value: 'hint',
    label: 'Hint',
    description: 'Shows the existing discovery hint bubble.',
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Applies the existing glow effect on the table.',
  },
  {
    value: 'computer',
    label: 'Computer',
    description: 'Opens the reaction database popup on contact.',
  },
  {
    value: 'earthquake',
    label: 'Earthquake',
    description: 'Triggers the existing quake effect when created.',
  },
  {
    value: 'storm',
    label: 'Storm',
    description: 'Enables the existing ambient storm flashes.',
  },
];

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
  message: '',
  effect: 'none',
});

const getElementPreviewStyle = (element: ModElement) => {
  const { bgColor, frameColor } = resolveModElementColors(
    element.bgColorToken,
    element.frameColorToken
  );

  return {
    backgroundColor: bgColor,
    borderColor: frameColor,
  };
};

const getColorOptionSwatchStyle = (
  value: string,
  type: 'bg' | 'frame'
): CSSProperties | undefined => {
  const definition = MOD_COLOR_TOKENS[value];
  if (!definition) {
    return undefined;
  }

  return {
    backgroundColor:
      type === 'bg' ? definition.bgColor : definition.frameColor,
    borderColor: 'rgba(255,255,255,0.2)',
  };
};

const createEmptyDraft = (): SaveDraftInput => ({
  title: DEFAULT_MOD_TITLE,
  summary: '',
  intro: '',
  startingElementIds: ['air', 'fire', 'earth', 'water'],
  elements: [
    createStarterElement('air', 'Air', 'ice', 'ocean'),
    createStarterElement('fire', 'Fire', 'sun', 'ember'),
    createStarterElement('earth', 'Earth', 'sand', 'stone'),
    createStarterElement('water', 'Water', 'ocean', 'royal'),
  ],
  reactions: [],
});

const clampRealmSummary = (summary: string) =>
  summary.slice(0, MAX_REALM_SUMMARY_LENGTH);

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
  buttonClassName,
  children,
  containerClassName,
  title,
}: {
  emoji: string;
  name: string;
  onChange: (emoji: string) => void;
  buttonClassName?: string;
  children?: ReactNode;
  containerClassName?: string;
  title?: string;
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
      className={
        containerClassName ||
        'pointer-events-none absolute top-0 left-0 z-10 h-[calc(100%-12px)] w-full'
      }
      ref={ref}
    >
      <button
        type="button"
        title={title}
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
        className={
          buttonClassName ||
          'pointer-events-auto realm-text-ink flex h-full w-full cursor-pointer items-center justify-center bg-transparent pb-0.5 text-[26px] font-black outline-none hover:bg-white/10'
        }
      >
        {children || emoji}
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

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      className={`relative flex flex-col items-center justify-end overflow-hidden rounded-xl border-2 ${getModElementClasses(element.bgColorToken, element.frameColorToken)} h-12 w-12 shrink-0 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={getElementPreviewStyle(element)}
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

const getDualColorButtonStyle = (
  bgColorToken: string,
  frameColorToken: string
): CSSProperties => {
  const { bgColor, frameColor } = resolveModElementColors(
    bgColorToken,
    frameColorToken
  );

  return {
    backgroundImage: `linear-gradient(135deg, ${bgColor} 0%, ${bgColor} 47%, rgba(255,255,255,0.96) 49%, rgba(255,255,255,0.96) 51%, ${frameColor} 53%, ${frameColor} 100%)`,
    borderColor: frameColor,
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
  };
};

const DualColorPicker = ({
  element,
  onChangeBgColor,
  onChangeFrameColor,
  containerClassName,
  buttonClassName,
  buttonStyle,
  children,
  title,
  popoverWidth = 336,
}: {
  element: ModElement;
  onChangeBgColor: (value: string) => void;
  onChangeFrameColor: (value: string) => void;
  containerClassName?: string;
  buttonClassName?: string;
  buttonStyle?: CSSProperties;
  children?: ReactNode;
  title?: string;
  popoverWidth?: number;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (popoverRef.current?.contains(event.target as Node)) {
        return;
      }

      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePopoverStyle = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const width = popoverWidth;
      const margin = 12;
      const left = Math.min(
        window.innerWidth - width - margin,
        Math.max(margin, rect.left - width / 2 + rect.width / 2)
      );

      setPopoverStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        left,
        width,
      });
    };

    updatePopoverStyle();
    window.addEventListener('resize', updatePopoverStyle);
    window.addEventListener('scroll', updatePopoverStyle, true);

    return () => {
      window.removeEventListener('resize', updatePopoverStyle);
      window.removeEventListener('scroll', updatePopoverStyle, true);
    };
  }, [isOpen, popoverWidth]);

  const renderColumn = (
    columnType: 'bg' | 'frame',
    label: string,
    value: string,
    onChange: (nextValue: string) => void
  ) => {
    const isCustom = value.startsWith('#');

    return (
      <div className="realm-panel-soft rounded-xl p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="catalog-title-font realm-text-muted text-[10px] font-bold tracking-widest uppercase">
            {label}
          </div>
          <div className="relative h-4 w-4 overflow-hidden rounded border border-white/20 shadow-sm">
            <input
              type="color"
              value={isCustom ? value : '#2ba6ff'}
              onChange={(event) => onChange(event.target.value)}
              className="absolute -top-2 -left-2 h-8 w-8 cursor-pointer"
            />
          </div>
        </div>
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
          {MOD_COLOR_OPTIONS.map((option) => (
            <button
              key={`${label}-${option.value}`}
              type="button"
              onClick={() => onChange(option.value)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10 ${
                value === option.value ? 'bg-white/10' : ''
              }`}
            >
              <div
                className="h-4 w-4 rounded-sm border border-white/20"
                style={getColorOptionSwatchStyle(option.value, columnType)}
              />
              <span className="realm-text-soft">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={containerClassName || 'relative'} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        title={title || `Edit ${element.name} background and border colors`}
        onClick={() => setIsOpen((current) => !current)}
        className={
          buttonClassName ||
          'relative flex h-8 w-8 shrink-0 cursor-pointer items-end justify-end overflow-hidden rounded-lg border-2 outline-none transition-transform hover:scale-[1.04] focus-visible:scale-[1.04]'
        }
        style={
          buttonStyle ||
          getDualColorButtonStyle(element.bgColorToken, element.frameColorToken)
        }
      >
        {children || (
          <>
            <span className="absolute inset-0 bg-white/5" />
            <span className="absolute right-0 bottom-0 rounded-tl bg-black/55 p-0.5 text-white">
              <IoChevronDownSharp size={10} />
            </span>
          </>
        )}
      </button>

      {isOpen &&
        popoverStyle &&
        createPortal(
          <div
            ref={popoverRef}
            className="realm-panel z-[100000] rounded-xl p-3 shadow-2xl"
            style={{
              ...popoverStyle,
              background: 'var(--catalog-card-fill)',
              border: '1px solid var(--catalog-soft-border)',
            }}
          >
            <div className="catalog-title-font realm-text-muted mb-3 px-1 text-[10px] font-bold tracking-widest uppercase">
              Element Colors
            </div>
            <div className="grid grid-cols-2 gap-2">
              {renderColumn(
                'bg',
                'Background',
                element.bgColorToken,
                onChangeBgColor
              )}
              {renderColumn(
                'frame',
                'Border',
                element.frameColorToken,
                onChangeFrameColor
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

const ElementAdvancedButton = ({
  element,
  onApply,
  containerClassName,
  buttonClassName,
}: {
  element: ModElement;
  onApply: (patch: Pick<ModElement, 'message' | 'effect'>) => void;
  containerClassName?: string;
  buttonClassName?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState(element.message);
  const [effectDraft, setEffectDraft] = useState<ModElementEffect>(
    element.effect
  );

  return (
    <div className={containerClassName || 'relative'}>
      <button
        type="button"
        title={`Advanced settings for ${element.name}`}
        onClick={() => {
          setMessageDraft(element.message);
          setEffectDraft(element.effect);
          setIsOpen(true);
        }}
        className={
          buttonClassName ||
          'realm-button-muted flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg'
        }
      >
        <IoEllipsisHorizontal size={16} />
      </button>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="realm-panel w-full max-w-md rounded-[1.75rem] p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="catalog-title-font realm-text-muted text-[11px] font-bold tracking-[0.24em] uppercase">
                    More
                  </div>
                  <h3 className="catalog-title-font realm-text-ink mt-2 text-2xl font-black">
                    {element.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="realm-button-muted flex h-9 w-9 cursor-pointer items-center justify-center rounded-full"
                >
                  <IoCloseSharp size={18} />
                </button>
              </div>

              <label className="mb-2 block">
                <div className="catalog-title-font realm-text-muted mb-2 text-[10px] font-bold tracking-[0.2em] uppercase">
                  Element Message
                </div>
                <textarea
                  value={messageDraft}
                  onChange={(event) =>
                    setMessageDraft(
                      event.target.value.slice(0, MAX_ELEMENT_MESSAGE_LENGTH)
                    )
                  }
                  rows={5}
                  maxLength={MAX_ELEMENT_MESSAGE_LENGTH}
                  placeholder="Shown in the in-game discovery popup for this element."
                  className="realm-input custom-scrollbar w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                />
                <div className="realm-text-muted mt-1 text-right text-xs">
                  {messageDraft.length}/{MAX_ELEMENT_MESSAGE_LENGTH}
                </div>
              </label>

              <label className="mb-5 block">
                <div className="catalog-title-font realm-text-muted mb-2 text-[10px] font-bold tracking-[0.2em] uppercase">
                  Effect
                </div>
                <select
                  value={effectDraft}
                  onChange={(event) => {
                    const nextEffect = ELEMENT_EFFECT_OPTIONS.find(
                      (option) => option.value === event.target.value
                    );
                    if (nextEffect) {
                      setEffectDraft(nextEffect.value);
                    }
                  }}
                  className="realm-input w-full rounded-2xl border border-white/10 bg-slate-950/78 px-4 py-3 text-sm text-slate-100 outline-none"
                >
                  {ELEMENT_EFFECT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-slate-950 text-slate-100"
                    >
                        {option.label}
                    </option>
                  ))}
                </select>
                <p className="realm-text-soft mt-2 text-sm leading-relaxed">
                  {
                    ELEMENT_EFFECT_OPTIONS.find(
                      (option) => option.value === effectDraft
                    )?.description
                  }
                </p>
              </label>

              <button
                type="button"
                onClick={() => {
                  onApply({
                    message: messageDraft.trim(),
                    effect: effectDraft,
                  });
                  setIsOpen(false);
                }}
                className="realm-button-accent catalog-title-font w-full cursor-pointer rounded-full px-4 py-3 text-sm font-bold"
              >
                Apply
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

const CompactElementTile = ({
  element,
  onRename,
  onBlurName,
  onChangeEmoji,
  onChangeBgColor,
  onChangeFrameColor,
  onApplyAdvanced,
  onRemove,
  inputRef,
}: {
  element: ModElement;
  onRename: (name: string) => void;
  onBlurName: () => void;
  onChangeEmoji: (emoji: string) => void;
  onChangeBgColor: (value: string) => void;
  onChangeFrameColor: (value: string) => void;
  onApplyAdvanced: (patch: Pick<ModElement, 'message' | 'effect'>) => void;
  onRemove: () => void;
  inputRef?: (node: HTMLInputElement | null) => void;
}) => {
  const [isEditingName, setIsEditingName] = useState(false);

  return (
    <div
      className={`group/element relative h-[60px] w-[60px] overflow-visible ${isEditingName ? 'z-40' : ''}`}
    >
      <div
        className={`relative h-full w-full overflow-visible rounded-[10px] border-[4px] ${getModElementClasses(element.bgColorToken, element.frameColorToken)}`}
        style={getElementPreviewStyle(element)}
      >
        <DualColorPicker
          element={element}
          onChangeBgColor={onChangeBgColor}
          onChangeFrameColor={onChangeFrameColor}
          containerClassName="absolute -top-1.5 -left-1.5 z-30"
          buttonClassName="flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full border border-[color:rgba(44,36,26,0.28)] bg-[color:rgba(234,223,190,0.94)] text-[#2c241a] opacity-0 shadow-[0_2px_8px_rgba(44,36,26,0.18)] transition-all group-hover/element:opacity-100 group-focus-within/element:opacity-100 hover:bg-[#e3d5af] hover:text-[#2c241a] hover:opacity-100 focus-visible:bg-[#e3d5af] focus-visible:text-[#2c241a] focus-visible:opacity-100"
          buttonStyle={{
            backgroundColor: 'rgba(234,223,190,0.94)',
            borderColor: 'rgba(44,36,26,0.28)',
          }}
          title={`Edit ${element.name || 'element'} background and border colors`}
        >
          <IoColorPaletteSharp size={11} />
        </DualColorPicker>

        <ElementAdvancedButton
          element={element}
          onApply={onApplyAdvanced}
          containerClassName="absolute -top-2 left-1/2 z-30 -translate-x-1/2"
          buttonClassName="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-[color:rgba(44,36,26,0.28)] bg-[color:rgba(234,223,190,0.94)] text-[#2c241a] opacity-0 shadow-[0_2px_8px_rgba(44,36,26,0.18)] transition-all group-hover/element:opacity-100 group-focus-within/element:opacity-100 hover:bg-[#e3d5af] hover:text-[#2c241a] hover:opacity-100 focus-visible:bg-[#e3d5af] focus-visible:text-[#2c241a] focus-visible:opacity-100"
        />

        <button
          type="button"
          onClick={onRemove}
          title={`Remove ${element.name}`}
          className="absolute -top-1 -right-1 z-30 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-[color:rgba(44,36,26,0.28)] bg-[color:rgba(234,223,190,0.94)] text-[#2c241a] opacity-0 shadow-[0_2px_8px_rgba(44,36,26,0.18)] transition-all group-hover/element:opacity-100 group-focus-within/element:opacity-100 hover:bg-[#e3d5af] hover:text-[#2c241a] hover:opacity-100 focus-visible:bg-[#e3d5af] focus-visible:text-[#2c241a] focus-visible:opacity-100"
        >
          <IoCloseSharp size={10} />
        </button>

        <EmojiDropdown
          emoji={element.emoji}
          name={element.name}
          onChange={onChangeEmoji}
          title={`Edit ${element.name} icon`}
          containerClassName="pointer-events-none absolute inset-0 z-20 h-[calc(100%-18px)] w-full"
          buttonClassName="group/emoji pointer-events-auto absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-[58%] cursor-pointer appearance-none items-center justify-center rounded-xl border border-transparent bg-transparent text-[32px] font-black text-[color:var(--catalog-ink)] outline-none transition-all hover:scale-105 hover:bg-transparent focus-visible:scale-105 focus-visible:bg-transparent active:bg-transparent"
        >
          <div className="relative flex h-full w-full items-center justify-center">
            <span className="pointer-events-none absolute inset-0 rounded-xl border border-transparent transition-all group-hover/emoji:border-white group-hover/emoji:shadow-[0_0_0_1px_rgba(255,255,255,0.95)] group-focus-within/emoji:border-white group-focus-within/emoji:shadow-[0_0_0_1px_rgba(255,255,255,0.95)]" />
            <span className="leading-none">{element.emoji}</span>
            <span className="absolute right-0.5 bottom-0.5 rounded-sm bg-black/70 p-[1px] text-white opacity-0 transition-opacity group-hover/emoji:opacity-100">
              <IoChevronDownSharp size={8} />
            </span>
          </div>
        </EmojiDropdown>

      </div>
      <input
        ref={inputRef}
        value={element.name}
        maxLength={32}
        onChange={(event) => onRename(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onFocus={() => setIsEditingName(true)}
        onBlur={() => {
          setIsEditingName(false);
          onBlurName();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        title={`Rename ${element.name}`}
        className={`pointer-events-auto absolute z-20 px-1 text-center text-[9px] font-bold tracking-[0.08em] text-white uppercase outline-none transition-all hover:bg-black/40 focus:bg-black/55 ${
          isEditingName
            ? 'bottom-[4px] left-1/2 h-[18px] min-w-full max-w-none -translate-x-1/2 rounded-md bg-black/55 shadow-lg'
            : 'right-[4px] bottom-[4px] left-[4px] h-[14px] rounded-b-[6px] bg-black/28'
        }`}
        style={
          isEditingName
            ? { width: `${Math.max(element.name.length + 4, 8)}ch` }
            : undefined
        }
      />
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
  const [elementPanelView, setElementPanelView] =
    useState<ElementPanelView>('compact');
  const [isValidationBlinking, setIsValidationBlinking] = useState(false);
  const validationBlinkTimeoutRef = useRef<number | null>(null);
  const [reactionView, setReactionView] = useState<'visual' | 'text'>('visual');
  const [reactionText, setReactionText] = useState('');
  const [pendingElementFocusId, setPendingElementFocusId] = useState<
    string | null
  >(null);
  const elementNameInputRefs = useRef<Record<string, HTMLInputElement | null>>(
    {}
  );

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
  const publishBlockedReason =
    !isLoadedModPublished && !validation.isValid
      ? validation.errors[0] ?? 'Fix validation errors first'
      : null;
  const shareBlockedReason = !isLoadedModPublished
    ? 'Publish this realm first.'
    : null;
  const realmPageBlockedReason = !isLoadedModPublished
    ? 'Publish this realm first.'
    : !loadedSharePostUrl
      ? 'Share this realm first to create its page.'
      : null;
  const editorActionButtonClass =
    'realm-button-accent catalog-title-font rounded-full px-4 py-2 text-sm font-bold transition-opacity';

  useEffect(() => {
    return () => {
      if (validationBlinkTimeoutRef.current !== null) {
        window.clearTimeout(validationBlinkTimeoutRef.current);
      }
    };
  }, []);

  const blinkValidation = () => {
    setIsValidationBlinking(false);

    requestAnimationFrame(() => {
      setIsValidationBlinking(true);
      if (validationBlinkTimeoutRef.current !== null) {
        window.clearTimeout(validationBlinkTimeoutRef.current);
      }

      validationBlinkTimeoutRef.current = window.setTimeout(() => {
        setIsValidationBlinking(false);
      }, 700);
    });
  };

  const showValidationFeedback = (message?: string) => {
    showToast(message ?? validation.errors[0] ?? 'Fix validation errors first');
    blinkValidation();
  };

  const refreshLists = async () => {
    setMyMods(await trpc.mods.listMine.query());
  };

  useEffect(() => {
    refreshLists().catch((error) => {
      console.error(error);
      showToast('Failed to load realms');
    });
  }, []);

  const updateDraft = (
    updater: (current: SaveDraftInput) => SaveDraftInput
  ) => {
    setDraft((current) => updater(current));
  };

  useEffect(() => {
    if (!pendingElementFocusId) {
      return;
    }

    const target = elementNameInputRefs.current[pendingElementFocusId];
    if (!target) {
      return;
    }

    target.focus();
    const cursor = target.value.length;
    target.setSelectionRange(cursor, cursor);
    setPendingElementFocusId(null);
  }, [draft.elements, pendingElementFocusId]);

  const addElement = () => {
    updateDraft((current) => {
      const baseName = getNextGeneratedElementName(current.elements);
      const nextElement = createStarterElement(
        ensureUniqueElementId(current.elements, baseName),
        ''
      );

      setPendingElementFocusId(nextElement.id);

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

  const finalizeElementName = (elementId: string) => {
    updateDraft((current) => {
      const nextName = getNextGeneratedElementName(
        current.elements.filter((element) => element.id !== elementId)
      );

      return {
        ...current,
        elements: current.elements.map((element) => {
          if (element.id !== elementId || element.name.trim()) {
            return element;
          }

          const shouldRefreshEmoji =
            element.emoji === deriveElementGlyph(element.name);

          return {
            ...element,
            name: nextName,
            emoji: shouldRefreshEmoji
              ? deriveElementGlyph(nextName)
              : element.emoji,
          };
        }),
      };
    });
  };

  const updateElementAdvanced = (
    elementId: string,
    patch: Pick<ModElement, 'message' | 'effect'>
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
    setPendingElementFocusId((current) =>
      current === elementId ? null : current
    );
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
    if (draft.elements.length === 0) {
      showToast('Add elements first');
      return;
    }

    updateDraft((current) => ({
      ...current,
      reactions: [
        ...current.reactions,
        { leftId: '', rightId: '', outputIds: [''] },
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
      summary: clampRealmSummary(draft.summary),
      intro: draft.intro.trim(),
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
      showValidationFeedback();
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
        error instanceof Error ? error.message : 'Failed to publish realm'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const unpublishDraft = async () => {
    if (!loadedDraftId) {
      showToast('Save the realm first');
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
        error instanceof Error ? error.message : 'Failed to unpublish realm'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const shareDraft = async () => {
    if (!loadedDraftId || !isLoadedModPublished) {
      showToast('Publish the realm first');
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
      showToast(
        error instanceof Error ? error.message : 'Failed to share realm'
      );
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
        summary: clampRealmSummary(loaded.summary),
        intro: loaded.intro,
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
              Create and Share Realms
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTab('mine')}
              className={`catalog-title-font rounded-full px-4 py-2 text-sm font-bold ${tab === 'mine' ? 'realm-button-accent' : 'realm-button-muted'}`}
            >
              My Realms
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
                      {mod.summary || 'No description provided.'}
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
                You have not saved any realms yet.
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
                    Realm Info
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
                        summary: clampRealmSummary(event.target.value),
                      }))
                    }
                    maxLength={MAX_REALM_SUMMARY_LENGTH}
                    placeholder="Describe the realm"
                    rows={2}
                    className="realm-input catalog-body-font w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  />
                  <div className="realm-text-muted mt-1 text-right text-xs">
                    {draft.summary.length}/{MAX_REALM_SUMMARY_LENGTH}
                  </div>
                  <textarea
                    value={draft.intro}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        intro: event.target.value.slice(0, MAX_REALM_INTRO_LENGTH),
                      }))
                    }
                    maxLength={MAX_REALM_INTRO_LENGTH}
                    placeholder="Intro shown when players open this realm. It disappears after the first reaction."
                    rows={4}
                    className="realm-input catalog-body-font mt-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  />
                  <div className="realm-text-muted mt-1 text-right text-xs">
                    {draft.intro.length}/{MAX_REALM_INTRO_LENGTH}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={isBusy}
                    onClick={playtestDraft}
                    className={`${editorActionButtonClass} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <IoPlaySharp className="mr-1 inline-block" />
                    Playtest
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={saveDraft}
                    className={`${editorActionButtonClass} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <IoSaveSharp className="mr-1 inline-block" />
                    Save
                  </button>
                  <button
                    type="button"
                    aria-disabled={isBusy || !!publishBlockedReason}
                    title={
                      publishBlockedReason ??
                      (isLoadedModPublished
                        ? 'Move this realm back to drafts.'
                        : 'Publish this realm.')
                    }
                    onClick={() => {
                      if (isBusy) {
                        return;
                      }

                      if (publishBlockedReason) {
                        showValidationFeedback(publishBlockedReason);
                        return;
                      }

                      void (
                        isLoadedModPublished ? unpublishDraft() : publishDraft()
                      );
                    }}
                    className={`${editorActionButtonClass} ${
                      isBusy || publishBlockedReason
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer'
                    }`}
                  >
                    <IoRocketSharp className="mr-1 inline-block" />
                    {isLoadedModPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    aria-disabled={isBusy || !!shareBlockedReason}
                    title={
                      shareBlockedReason || 'Share the published realm post.'
                    }
                    onClick={() => {
                      if (isBusy) {
                        return;
                      }

                      if (shareBlockedReason) {
                        showToast(shareBlockedReason);
                        return;
                      }

                      void shareDraft();
                    }}
                    className={`${editorActionButtonClass} ${
                      isBusy || shareBlockedReason
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer'
                    }`}
                  >
                    <IoShareOutline className="mr-1 inline-block" />
                    Share
                  </button>
                  <button
                    type="button"
                    aria-disabled={isBusy || !!realmPageBlockedReason}
                    title={
                      realmPageBlockedReason || 'Open the published realm page.'
                    }
                    onClick={() => {
                      if (isBusy) {
                        return;
                      }

                      if (realmPageBlockedReason) {
                        showToast(realmPageBlockedReason);
                        return;
                      }

                      if (loadedSharePostUrl) {
                        navigateTo(loadedSharePostUrl);
                      }
                    }}
                    className={`${editorActionButtonClass} ${
                      isBusy || realmPageBlockedReason
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer'
                    }`}
                  >
                    Go To Realm Page
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div>
                  <div className="mb-2">
                    <div className="catalog-title-font realm-text-muted text-[11px] font-bold tracking-[0.24em] uppercase">
                      Starting Elements ({draft.startingElementIds.length})
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {draft.startingElementIds.map((id, index) => {
                      const el = draft.elements.find((e) => e.id === id);
                      return el ? (
                        <div
                          key={`starting-${id}-${index}`}
                          className="editor-starter-chip flex items-center gap-1 rounded-full py-1 pr-1 pl-2 text-sm font-bold"
                        >
                          <span>{el.name}</span>
                          <button
                            onClick={() => removeStartingElement(index)}
                            className="editor-starter-remove ml-0.5"
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

                <div
                  className={`realm-panel-soft rounded-2xl p-4 ${
                    isValidationBlinking ? 'animate-shake ring-2 ring-rose-300/70' : ''
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="catalog-title-font realm-text-ink text-sm font-black">
                        Validation
                      </div>
                      <div className="realm-text-soft text-sm">
                        ({validation.reachableElementIds.length}/
                        {validation.totalElements} reachable)
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.16em] uppercase ${
                        validation.isValid
                          ? 'editor-validation-badge-ready'
                          : 'editor-validation-badge-blocked'
                      }`}
                    >
                      {validation.isValid ? 'Ready' : 'Blocked'}
                    </span>
                  </div>
                  {validation.errors.length > 0 && (
                    <div className="space-y-2">
                      {validation.errors.slice(0, 3).map((error) => (
                        <div
                          key={error}
                          className="editor-validation-error rounded-xl px-3 py-2 text-sm"
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
                          className="editor-validation-warning rounded-xl px-3 py-2 text-sm"
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
                <div className="mb-4 flex flex-nowrap items-start gap-3">
                  <div className="min-w-[112px] shrink-0">
                    <div className="catalog-title-font realm-text-muted text-[11px] font-bold tracking-[0.24em] uppercase">
                      Elements ({draft.elements.length})
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setElementPanelView((current) =>
                          current === 'extended' ? 'compact' : 'extended'
                        )
                      }
                      className="realm-button-muted catalog-title-font rounded px-2 py-1 text-[9px] font-bold tracking-widest uppercase transition-colors"
                    >
                      {elementPanelView === 'extended'
                        ? 'Compact View'
                        : 'Extended View'}
                    </button>
                  </div>
                  <div className="ml-auto flex min-w-0 flex-1 items-center gap-2">
                    <div className="realm-input flex min-w-0 flex-1 items-center rounded-lg border">
                      <DroppableInput
                        value={elementSearch}
                        onChange={setElementSearch}
                        onClear={
                          elementSearch ? () => setElementSearch('') : undefined
                        }
                        placeholder="Search element"
                        className="w-full border-0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addElement}
                      title="Add element"
                      className="realm-button-accent catalog-title-font flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-lg font-bold"
                    >
                      <IoAddSharp />
                    </button>
                  </div>
                </div>

                {elementPanelView === 'extended' ? (
                  <div className="custom-scrollbar h-[500px] space-y-3 overflow-y-auto pr-2 pb-6">
                    {filteredElements.map((element) => (
                      <div
                        key={element.id}
                        className="realm-panel-soft relative overflow-visible rounded-xl p-2 pt-4"
                      >
                        <button
                          onClick={() => removeElement(element.id)}
                          className="absolute -top-2.5 -right-2.5 z-20 rounded-full bg-[color:rgba(255,255,255,0.96)] p-1 text-slate-700 shadow-lg transition-colors hover:bg-rose-500 hover:text-white"
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
                              ref={(node) => {
                                elementNameInputRefs.current[element.id] = node;
                              }}
                              value={element.name}
                              maxLength={32}
                              onChange={(event) =>
                                renameElement(element.id, event.target.value)
                              }
                              onBlur={() => finalizeElementName(element.id)}
                              placeholder="Name"
                              className="realm-input min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm outline-none"
                            />
                            <DualColorPicker
                              element={element}
                              onChangeBgColor={(value) =>
                                updateElementColors(element.id, {
                                  bgColorToken: value,
                                  frameColorToken: element.frameColorToken,
                                })
                              }
                              onChangeFrameColor={(value) =>
                                updateElementColors(element.id, {
                                  bgColorToken: element.bgColorToken,
                                  frameColorToken: value,
                                })
                              }
                            />
                            <ElementAdvancedButton
                              element={element}
                              onApply={(patch) =>
                                updateElementAdvanced(element.id, patch)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="custom-scrollbar h-[500px] overflow-x-visible overflow-y-auto pr-1 pb-6">
                    <div className="grid grid-cols-4 gap-3">
                      {filteredElements.map((element) => (
                        <CompactElementTile
                          key={element.id}
                          element={element}
                          onRename={(name) => renameElement(element.id, name)}
                          onBlurName={() => finalizeElementName(element.id)}
                          onChangeEmoji={(emoji) =>
                            updateElementEmoji(element.id, emoji)
                          }
                          onChangeBgColor={(value) =>
                            updateElementColors(element.id, {
                              bgColorToken: value,
                              frameColorToken: element.frameColorToken,
                            })
                          }
                          onChangeFrameColor={(value) =>
                            updateElementColors(element.id, {
                              bgColorToken: element.bgColorToken,
                              frameColorToken: value,
                            })
                          }
                          onApplyAdvanced={(patch) =>
                            updateElementAdvanced(element.id, patch)
                          }
                          onRemove={() => removeElement(element.id)}
                          inputRef={(node) => {
                            elementNameInputRefs.current[element.id] = node;
                          }}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={addElement}
                        title="Add element"
                        className="realm-button-accent catalog-title-font flex h-[60px] w-[60px] cursor-pointer items-center justify-center rounded-[10px] border-2 text-2xl font-black"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="realm-panel rounded-3xl p-3 backdrop-blur-xl lg:p-4">
                <div className="mb-4 flex flex-nowrap items-start gap-3">
                  <div className="min-w-[112px] shrink-0">
                    <div className="catalog-title-font realm-text-muted text-[11px] font-bold tracking-[0.24em] uppercase">
                      Reactions
                    </div>
                    <button
                      type="button"
                      onClick={toggleReactionView}
                      className="realm-button-muted catalog-title-font rounded px-2 py-1 text-[9px] font-bold tracking-widest uppercase transition-colors"
                    >
                      {reactionView === 'visual'
                        ? 'Text Editor'
                        : 'Visual Editor'}
                    </button>
                    <div className="realm-text-soft mt-1 hidden text-sm lg:block">
                      {draft.reactions.length} total
                    </div>
                  </div>
                  <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
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
                        <div>
                          No reactions yet. Add one to make the realm playable.
                        </div>
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
