import { createPortal } from 'react-dom';
import {
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  IoAddSharp,
  IoChevronDownSharp,
  IoCloseSharp,
  IoCodeSlash,
  IoColorPaletteSharp,
  IoEllipsisHorizontal,
  IoHelpCircleOutline,
} from 'react-icons/io5';
import {
  getModElementClasses,
  MOD_COLOR_OPTIONS,
  MOD_COLOR_TOKENS,
  resolveModElementColors,
} from '../modding/colors';
import {
  formatReactionScript,
  formatReactionScriptIssue,
  hasReactionScript,
  validateReactionScript,
} from '../modding/reaction-script';
import {
  MAX_ELEMENT_MESSAGE_LENGTH,
  normalizeModCounterDefinition,
  type ModCounterDefinition,
  type ModElement,
  type ModElementEffect,
} from '../modding/types';
import {
  ELEMENT_DATALIST_ID,
  ELEMENT_EFFECT_OPTIONS,
  type ReactionWidgetProps,
} from './constants';
import { ReactionScriptAutocompleteTextarea } from './ReactionScriptAutocompleteTextarea';

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

const REACTION_DRAG_TYPE = 'application/x-alchemy-reaction-index';

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
                dataSource="/emoji-data.json"
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export const ElementPreview = ({
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

export const DualColorPicker = ({
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

export const ElementAdvancedButton = ({
  scriptingHelpPageUrl,
  element,
  counterDefinition,
  isStarting,
  onOpenScriptingHelp,
  onApply,
  containerClassName,
  buttonClassName,
}: {
  scriptingHelpPageUrl: string | null;
  element: ModElement;
  counterDefinition: ModCounterDefinition | null;
  isStarting: boolean;
  onOpenScriptingHelp: () => void;
  onApply: (patch: Pick<ModElement, 'message' | 'effect'> & {
    nonConsumable: boolean;
    counterValues: Pick<ModCounterDefinition, 'initial' | 'max' | 'min'> | null;
    isCounter: boolean;
    isStarting: boolean;
  }) => void;
  containerClassName?: string;
  buttonClassName?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState(element.message);
  const [effectDraft, setEffectDraft] = useState<ModElementEffect>(
    element.effect
  );
  const [isCounterDraft, setIsCounterDraft] = useState(
    counterDefinition !== null
  );
  const [isStartingDraft, setIsStartingDraft] = useState(isStarting);
  const [isNonConsumableDraft, setIsNonConsumableDraft] = useState(
    element.nonConsumable
  );
  const [counterDraft, setCounterDraft] = useState<
    Pick<ModCounterDefinition, 'initial' | 'max' | 'min'>
  >(counterDefinition ?? { initial: 0, max: 100, min: 0 });

  const normalizeCounterDraft = (
    value: Pick<ModCounterDefinition, 'initial' | 'max' | 'min'>
  ) => normalizeModCounterDefinition(value);

  return (
    <div className={containerClassName || 'relative'}>
      <button
        type="button"
        title={`Advanced settings for ${element.name}`}
        onClick={() => {
          setMessageDraft(element.message);
          setEffectDraft(element.effect);
          setIsCounterDraft(counterDefinition !== null);
          setIsStartingDraft(isStarting);
          setIsNonConsumableDraft(element.nonConsumable);
          setCounterDraft(counterDefinition ?? { initial: 0, max: 100, min: 0 });
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

              <div className="mb-5 flex flex-wrap items-center gap-4 text-sm">
                <label
                  className="flex cursor-pointer items-center gap-2"
                  title="Starts discovered and available to the player."
                >
                  <input
                    type="checkbox"
                    checked={!isCounterDraft && isStartingDraft}
                    disabled={isCounterDraft}
                    onChange={(event) => setIsStartingDraft(event.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="font-semibold">Starter</span>
                </label>

                <div className="flex items-center gap-2">
                  <label
                    className="flex cursor-pointer items-center gap-2"
                    title="Special value chip, not a normal gameplay element."
                  >
                    <input
                      type="checkbox"
                      checked={isCounterDraft}
                      onChange={(event) => {
                        const nextChecked = event.target.checked;
                        setIsCounterDraft(nextChecked);
                        if (nextChecked) {
                          setIsStartingDraft(false);
                          setCounterDraft((current) =>
                            normalizeCounterDraft(current)
                          );
                        }
                      }}
                      className="h-4 w-4"
                    />
                    <span className="font-semibold">Counter</span>
                  </label>
                  <button
                    type="button"
                    onClick={onOpenScriptingHelp}
                    title={
                      scriptingHelpPageUrl
                        ? 'Open Scripting Help Page'
                        : 'Scripting Help Page URL is not configured.'
                    }
                    className="realm-button-muted flex h-7 w-7 items-center justify-center rounded-full"
                  >
                    <IoHelpCircleOutline size={16} />
                  </button>
                </div>
                <label
                  className="flex cursor-pointer items-center gap-2"
                  title="This element will not disappear when interacting with other elements. Use the delete command to remove it."
                >
                  <input
                    type="checkbox"
                    checked={isNonConsumableDraft}
                    onChange={(event) =>
                      setIsNonConsumableDraft(event.target.checked)
                    }
                    className="h-4 w-4"
                  />
                  <span className="font-semibold">non-consumable</span>
                </label>
              </div>

              {isCounterDraft && (
                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <div className="catalog-title-font realm-text-muted mb-2 text-[10px] font-bold tracking-[0.2em] uppercase">
                      Min
                    </div>
                    <input
                      type="number"
                      value={counterDraft.min ?? ''}
                      onChange={(event) => {
                        const trimmedValue = event.target.value.trim();
                        const nextMin = Number.parseInt(trimmedValue, 10);
                        setCounterDraft((current) => ({
                          ...current,
                          min:
                            trimmedValue.length === 0
                              ? undefined
                              : Number.isNaN(nextMin)
                                ? current.min
                                : nextMin,
                        }));
                      }}
                      placeholder="none"
                      className="realm-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    />
                  </label>
                  <label className="block">
                    <div className="catalog-title-font realm-text-muted mb-2 text-[10px] font-bold tracking-[0.2em] uppercase">
                      Max
                    </div>
                    <input
                      type="number"
                      value={counterDraft.max ?? ''}
                      onChange={(event) => {
                        const trimmedValue = event.target.value.trim();
                        const nextMax = Number.parseInt(trimmedValue, 10);
                        setCounterDraft((current) => ({
                          ...current,
                          max:
                            trimmedValue.length === 0
                              ? undefined
                              : Number.isNaN(nextMax)
                                ? current.max
                                : nextMax,
                        }));
                      }}
                      placeholder="none"
                      className="realm-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    />
                  </label>
                  <label className="block">
                    <div className="catalog-title-font realm-text-muted mb-2 text-[10px] font-bold tracking-[0.2em] uppercase">
                      Initial
                    </div>
                    <input
                      type="number"
                      value={counterDraft.initial}
                      onChange={(event) => {
                        const nextInitial = Number.parseInt(
                          event.target.value,
                          10
                        );
                        setCounterDraft((current) => ({
                          ...current,
                          initial: Number.isNaN(nextInitial)
                            ? current.initial
                            : nextInitial,
                        }));
                      }}
                      className="realm-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    />
                  </label>
                </div>
              )}

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
                {effectDraft !== 'none' && (
                  <p className="realm-text-soft mt-2 text-sm leading-relaxed">
                    {
                      ELEMENT_EFFECT_OPTIONS.find(
                        (option) => option.value === effectDraft
                      )?.description
                    }
                  </p>
                )}
              </label>

              <button
                type="button"
                onClick={() => {
                  onApply({
                    counterValues: isCounterDraft
                      ? normalizeCounterDraft(counterDraft)
                      : null,
                    message: messageDraft.trim(),
                    effect: effectDraft,
                    nonConsumable: isNonConsumableDraft,
                    isCounter: isCounterDraft,
                    isStarting: !isCounterDraft && isStartingDraft,
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

export const CompactElementTile = ({
  element,
  onRename,
  onBlurName,
  onChangeEmoji,
  onChangeBgColor,
  onChangeFrameColor,
  scriptingHelpPageUrl,
  counterDefinition,
  isStarting,
  onOpenScriptingHelp,
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
  scriptingHelpPageUrl: string | null;
  counterDefinition: ModCounterDefinition | null;
  isStarting: boolean;
  onOpenScriptingHelp: () => void;
  onApplyAdvanced: (patch: Pick<ModElement, 'message' | 'effect'> & {
    nonConsumable: boolean;
    counterValues: Pick<ModCounterDefinition, 'initial' | 'max' | 'min'> | null;
    isCounter: boolean;
    isStarting: boolean;
  }) => void;
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
          scriptingHelpPageUrl={scriptingHelpPageUrl}
          element={element}
          counterDefinition={counterDefinition}
          isStarting={isStarting}
          onOpenScriptingHelp={onOpenScriptingHelp}
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

export const DroppableInput = ({
  value,
  onChange,
  onBlur,
  onClear,
  placeholder,
  className,
  onEnter,
  onDropValue,
  grow = true,
  inputRef,
}: {
  value: string;
  onChange: (val: string) => void;
  onBlur?: (() => void) | undefined;
  onClear?: (() => void) | undefined;
  placeholder: string;
  className?: string | undefined;
  onEnter?: (() => void) | undefined;
  onDropValue?: ((val: string) => void) | undefined;
  grow?: boolean;
  inputRef?: ((node: HTMLInputElement | null) => void) | undefined;
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
      className={`relative flex min-w-0 items-center rounded-lg ${grow ? 'flex-1' : 'shrink-0'} ${dragOver ? 'ring-2 ring-cyan-400' : ''} ${className}`}
    >
      <input
        ref={inputRef}
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

export const ReactionWidget = ({
  counterElementIds,
  counterNames,
  index,
  reaction,
  elements,
  scriptingHelpPageUrl,
  onAddMissingElement,
  onAutoAddElement,
  onCommit,
  onMoveReaction,
  onOpenScriptingHelp,
  onUpdateScript,
  onDelete,
}: ReactionWidgetProps) => {
  const outputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const isDragHandleActiveRef = useRef(false);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(
    null
  );
  const [isScriptOpen, setIsScriptOpen] = useState(false);
  const [shouldShowScriptValidation, setShouldShowScriptValidation] =
    useState(true);

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

  const scriptText = reaction.script ?? '';
  const hasScript = hasReactionScript(scriptText);
  const scriptElementNames = useMemo(
    () =>
      elements
        .map((element) => element.name.trim())
        .filter((name) => name.length > 0),
    [elements]
  );
  const gameplayElementNames = useMemo(
    () =>
      elements
        .filter((element) => !counterElementIds.includes(element.id))
        .map((element) => element.name.trim())
        .filter((name) => name.length > 0),
    [counterElementIds, elements]
  );
  const scriptIssues = useMemo(
    () =>
      hasScript && shouldShowScriptValidation
        ? (() => {
            const validation = validateReactionScript(scriptText, {
              counterNames,
              elements: elements.map((element) => ({
                id: element.id,
                name: element.name,
              })),
              nonGameplayElementIds: counterElementIds,
            });

            return validation.ok ? [] : validation.errors;
          })()
        : [],
    [
      counterElementIds,
      counterNames,
      elements,
      hasScript,
      scriptText,
      shouldShowScriptValidation,
    ]
  );

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

  const reactionFieldClassName =
    'realm-input w-[5rem] border sm:w-[6.5rem]';
  const lastOutputIndex = outputTexts.length - 1;
  const hasSettledScriptError = scriptIssues.length > 0;

  const addOutputField = (focusIndex: number) => {
    setOutputTexts((current) => [...current, '']);
    setPendingFocusIndex(focusIndex);
  };

  const handleToggleScript = () => {
    if (!isScriptOpen && !hasScript) {
      const filledOutputNames = outputTexts
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      if (filledOutputNames.length > 0) {
        onUpdateScript(
          index,
          formatReactionScript(`add ${filledOutputNames.join(', ')}`) ??
            `add ${filledOutputNames.join(', ')}`
        );
      }
    }

    setShouldShowScriptValidation(true);
    setIsScriptOpen((current) => !current);
  };

  return (
    <div
      draggable={true}
      onDragStart={(event) => {
        if (!isDragHandleActiveRef.current) {
          event.preventDefault();
          return;
        }

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(REACTION_DRAG_TYPE, String(index));
      }}
      onDragEnd={() => {
        isDragHandleActiveRef.current = false;
      }}
      className="realm-panel-soft relative flex flex-col gap-2 overflow-visible rounded-xl py-2 pr-2 pl-6"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(REACTION_DRAG_TYPE)) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        const fromIndexText = event.dataTransfer.getData(REACTION_DRAG_TYPE);
        const fromIndex = Number(fromIndexText);
        if (Number.isNaN(fromIndex)) {
          return;
        }

        event.preventDefault();
        onMoveReaction(fromIndex, index);
      }}
    >
      <button
        type="button"
        onMouseDown={() => {
          isDragHandleActiveRef.current = true;
        }}
        onMouseUp={() => {
          isDragHandleActiveRef.current = false;
        }}
        onBlur={() => {
          isDragHandleActiveRef.current = false;
        }}
        className="absolute inset-y-2 left-1 z-10 flex w-4 cursor-grab flex-col items-center justify-center gap-1 rounded-lg border border-transparent bg-transparent transition-colors hover:border-[color:var(--catalog-soft-border)] hover:bg-white/6 active:cursor-grabbing"
        title="Drag to reorder reaction"
      >
        {Array.from({ length: 6 }).map((_, dotIndex) => (
          <span
            key={`reaction-handle-${index}-${dotIndex}`}
            className="h-1 w-1 rounded-full bg-[color:var(--catalog-soft-text)] opacity-80"
          />
        ))}
      </button>
      <div className="flex w-full min-w-0 flex-nowrap items-center gap-1.5">
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
          className={reactionFieldClassName}
          grow={false}
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
          className={reactionFieldClassName}
          grow={false}
        />
        <button
          type="button"
          onClick={handleToggleScript}
          className={`catalog-title-font ml-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[10px] font-bold tracking-[0.16em] uppercase transition-colors ${
            hasSettledScriptError
              ? 'bg-rose-500/18 text-rose-200 ring-1 ring-rose-400/40'
              : isScriptOpen || hasScript
              ? 'bg-cyan-500/18 text-cyan-100'
              : 'realm-button-muted'
          }`}
          title={hasScript ? 'Edit scripted override' : 'Open scripted override'}
        >
          <IoCodeSlash size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(index)}
          className="realm-button-muted flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-rose-500/20 hover:text-rose-300"
          title="Remove reaction"
        >
          <IoCloseSharp size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-2 pl-1">
        {isScriptOpen ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onOpenScriptingHelp}
                title={
                  scriptingHelpPageUrl
                    ? 'Open Scripting Help Page'
                    : 'Scripting Help Page URL is not configured.'
                }
                className="catalog-title-font realm-text-soft cursor-pointer bg-transparent px-0 py-0 text-[9px] font-bold tracking-[0.14em] uppercase underline-offset-2 transition-colors hover:underline"
              >
                Scripting Help
              </button>
            </div>
            <ReactionScriptAutocompleteTextarea
              beautifyOnBlur={true}
              className="realm-input custom-scrollbar min-h-[7.5rem] w-full resize-y rounded-xl border px-3 py-2 font-mono text-sm outline-none"
              counterNames={counterNames}
              elementNames={gameplayElementNames}
              iconElementNames={scriptElementNames}
              mode="script"
              textareaClassName="resize-y"
              value={scriptText}
              onChange={(nextValue) => {
                setShouldShowScriptValidation(false);
                onUpdateScript(index, nextValue);
              }}
              onEditingSettled={() => setShouldShowScriptValidation(true)}
              onElementCommitted={onAutoAddElement}
              placeholder={`add dust\npopup "The cupboard is locked.", key\nif (count(health) < 10) win "You survived."`}
            />

            {scriptIssues.length > 0 && (
              <div className="space-y-1">
                {scriptIssues.slice(0, 4).map((issue) => {
                  const unknownElementMatch = issue.message.match(
                    /^Unknown element "(.+)"\.$/
                  );
                  const missingElementName = unknownElementMatch?.[1] ?? null;

                  return (
                    <div
                      key={`${issue.line}-${issue.message}`}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-500/12 px-3 py-2 text-xs text-rose-100"
                    >
                      <span>{formatReactionScriptIssue(issue)}</span>
                      {missingElementName && (
                        <button
                          type="button"
                          onClick={() => onAddMissingElement(missingElementName)}
                          className="realm-button-accent cursor-pointer rounded-full px-2 py-1 text-[10px] font-bold"
                        >
                          Add {missingElementName}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : !hasScript ? (
          <div className="flex w-full flex-wrap items-center gap-1.5">
            <div className="shrink-0 font-black text-emerald-300">=</div>
            {outputTexts.map((outputText, outputIndex) => {
              const isLastOutput = outputIndex === lastOutputIndex;

              return (
                <div
                  key={`reaction-${index}-output-${outputIndex}`}
                  className={`flex items-stretch ${isLastOutput ? 'gap-0' : ''}`}
                >
                  <DroppableInput
                    inputRef={(node) => {
                      outputRefs.current[outputIndex] = node;
                    }}
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
                      if (outputIndex === outputTexts.length - 1) {
                        addOutputField(outputTexts.length);
                        return;
                      }

                      setPendingFocusIndex(outputIndex + 1);
                    }}
                    placeholder={`Result ${outputIndex + 1}`}
                    className={`${reactionFieldClassName} ${
                      isLastOutput ? 'rounded-r-none' : ''
                    }`}
                    grow={false}
                  />
                  {isLastOutput && (
                    <button
                      onClick={() => {
                        addOutputField(outputTexts.length);
                      }}
                      className="realm-button-accent shrink-0 rounded-r-lg rounded-l-none border border-l-0 border-white/10 px-2"
                    >
                      <IoAddSharp size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

