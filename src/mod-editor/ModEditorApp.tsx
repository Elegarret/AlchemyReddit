import { navigateTo, showShareSheet, showToast } from '@devvit/web/client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from 'react';
import {
  IoAddSharp,
  IoCloseSharp,
  IoCopyOutline,
  IoPlaySharp,
  IoRocketSharp,
  IoSaveSharp,
  IoShareOutline,
  IoTrashSharp,
} from 'react-icons/io5';
import {
  PLAYTEST_RULESET_STORAGE_KEY,
  buildRulesetFromDraft,
  createModFingerprint,
  getElementNameValidationError,
  normalizeAuthoredElementName,
  sanitizeElementName,
  validateModDraft,
} from '../modding/runtime';
import {
  MAX_REALM_INTRO_LENGTH,
  MAX_REALM_SUMMARY_LENGTH,
  normalizeModCounterDefinition,
  type ModCounterDefinition,
  type ModElement,
  type ModListItem,
  type SaveDraftInput,
} from '../modding/types';
import { trpc } from '../trpc';
import {
  getEditorTargetModId,
  openEntry,
  setEditorTargetModId,
} from '../webview-navigation';
import {
  CompactElementTile,
  DroppableInput,
  DualColorPicker,
  ElementAdvancedButton,
  ElementPreview,
  ReactionWidget,
} from './components';
import { ReactionScriptAutocompleteTextarea } from './ReactionScriptAutocompleteTextarea';
import {
  ELEMENT_DATALIST_ID,
  type EditorTab,
  type ElementPanelView,
} from './constants';
import {
  clampRealmSummary,
  createEmptyDraft,
  createStarterElement,
  deriveElementGlyph,
  ensureElementInDraft,
  ensureUniqueElementId,
  formatDate,
  formatReactionText,
  formatReactionTextIssue,
  getNextGeneratedElementName,
  getSharePostUrl,
  normalizeReactionComments,
  parseReactionTextToDraft,
} from './draft';
import {
  EditorMetaTabsPanel,
  EditorValidationPlank,
  getBlockingValidationItems,
  getWarningValidationItems,
  type EditorMetaTab,
} from './meta';

export const ModEditorApp = () => {
  const [tab, setTab] = useState<EditorTab>('editor');
  const [draft, setDraft] = useState<SaveDraftInput>(createEmptyDraft);
  const [myMods, setMyMods] = useState<ModListItem[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [elementSearch, setElementSearch] = useState('');
  const [reactionSearch, setReactionSearch] = useState('');
  const [authorsHelpPageUrl, setAuthorsHelpPageUrl] = useState<string | null>(
    null
  );
  const [scriptingHelpPageUrl, setScriptingHelpPageUrl] = useState<
    string | null
  >(null);
  const [activeMetaTab, setActiveMetaTab] = useState<EditorMetaTab>('starters');
  const [newCounterText, setNewCounterText] = useState('');
  const [newStartingText, setNewStartingText] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [pendingRemoveModId, setPendingRemoveModId] = useState<string | null>(
    null
  );
  const [elementPanelView, setElementPanelView] =
    useState<ElementPanelView>('compact');
  const [isValidationBlinking, setIsValidationBlinking] = useState(false);
  const [isValidationExpanded, setIsValidationExpanded] = useState(false);
  const validationBlinkTimeoutRef = useRef<number | null>(null);
  const [reactionView, setReactionView] = useState<'visual' | 'text'>('visual');
  const [isReactionTextExpanded, setIsReactionTextExpanded] = useState(true);
  const [reactionText, setReactionText] = useState('');
  const [pendingElementFocusId, setPendingElementFocusId] = useState<
    string | null
  >(null);
  const elementNameInputRefs = useRef<Record<string, HTMLInputElement | null>>(
    {}
  );

  const reactionTextParse = useMemo(
    () =>
      reactionView === 'text'
        ? parseReactionTextToDraft(draft, reactionText)
        : null,
    [draft, reactionText, reactionView]
  );
  const reactionTextIssues =
    reactionView === 'text' ? (reactionTextParse?.errors ?? []) : [];
  const draftWithTextChanges =
    reactionView === 'text' && reactionTextParse?.ok
      ? reactionTextParse.draft
      : draft;

  const syncDraftFromText = (text: string) => {
    const parsed = parseReactionTextToDraft(draft, text);
    if (!parsed.ok) {
      return parsed;
    }

    setDraft(parsed.draft);
    return parsed;
  };

  const toggleReactionView = () => {
    if (reactionView === 'visual') {
      setReactionText(formatReactionText(draft));
      setIsReactionTextExpanded(true);
      setReactionView('text');
    } else {
      const parsed = parseReactionTextToDraft(draft, reactionText);
      if (!parsed.ok) {
        const firstIssue = parsed.errors[0];
        showValidationFeedback(
          firstIssue
            ? formatReactionTextIssue(firstIssue)
            : 'Fix text editor errors first'
        );
        return;
      }

      setDraft(parsed.draft);
      setReactionText(formatReactionText(parsed.draft));
      setReactionView('visual');
    }
  };

  const validation = useMemo(
    () => validateModDraft(draftWithTextChanges),
    [draftWithTextChanges]
  );
  const blockingValidationItems = useMemo(
    () =>
      getBlockingValidationItems({
        reactionTextIssues,
        validation,
      }),
    [reactionTextIssues, validation]
  );
  const warningValidationItems = useMemo(
    () => getWarningValidationItems(validation.warnings),
    [validation.warnings]
  );
  const counterElementIds = useMemo(
    () => draft.counters.map((counter) => counter.elementId),
    [draft.counters]
  );
  const counterElements = useMemo(
    () =>
      draft.counters.flatMap((counter) => {
        const element = draft.elements.find(
          (candidate) => candidate.id === counter.elementId
        );
        return element ? [{ counter, element }] : [];
      }),
    [draft.counters, draft.elements]
  );
  const counterNames = useMemo(
    () =>
      counterElements
        .map(({ element }) => element.name.trim())
        .filter((name) => name.length > 0),
    [counterElements]
  );
  const gameplayElementNames = useMemo(
    () =>
      draft.elements
        .filter((element) => !counterElementIds.includes(element.id))
        .map((element) => element.name.trim())
        .filter((name) => name.length > 0),
    [counterElementIds, draft.elements]
  );
  const loadedMod = loadedDraftId
    ? (myMods.find((mod) => mod.id === loadedDraftId) ?? null)
    : null;
  const hasLoadedPublishedVersion = Boolean(
    loadedMod?.hasPublishedVersion ?? loadedMod?.status === 'published'
  );
  const currentDraftFingerprint = useMemo(
    () =>
      createModFingerprint({
        title: draftWithTextChanges.title,
        summary: draftWithTextChanges.summary,
        intro: draftWithTextChanges.intro,
        startingElementIds: draftWithTextChanges.startingElementIds,
        counters: draftWithTextChanges.counters,
        showPalette: draftWithTextChanges.showPalette,
        elements: draftWithTextChanges.elements,
        reactions: draftWithTextChanges.reactions,
      }),
    [draftWithTextChanges]
  );
  const hasPublishedDraftChanges = Boolean(
    hasLoadedPublishedVersion &&
    loadedMod?.publishedHash !== currentDraftFingerprint
  );
  const primaryPublishAction =
    !hasLoadedPublishedVersion || hasPublishedDraftChanges
      ? 'publish'
      : 'unpublish';
  const loadedSharePostUrl = loadedMod ? getSharePostUrl(loadedMod) : null;
  const publishBlockedReason =
    primaryPublishAction === 'publish' &&
    (reactionTextIssues.length > 0 || !validation.isValid)
      ? reactionTextIssues[0]
        ? formatReactionTextIssue(reactionTextIssues[0])
        : (validation.errors[0] ??
          validation.scriptErrors[0] ??
          'Fix validation errors first')
      : null;
  const shareBlockedReason = !hasLoadedPublishedVersion
    ? 'Publish this realm first.'
    : null;
  const realmPageBlockedReason = !hasLoadedPublishedVersion
    ? 'Publish this realm first.'
    : !loadedSharePostUrl
      ? 'Share this realm first to create its page.'
      : null;
  const editorActionButtonClass =
    'editor-action-button catalog-title-font inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-opacity';

  useEffect(() => {
    return () => {
      if (validationBlinkTimeoutRef.current !== null) {
        window.clearTimeout(validationBlinkTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      blockingValidationItems.length === 0 &&
      warningValidationItems.length === 0
    ) {
      setIsValidationExpanded(false);
    }
  }, [blockingValidationItems.length, warningValidationItems.length]);

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
    setIsValidationExpanded(true);
    showToast(
      message ??
        (reactionTextIssues[0]
          ? formatReactionTextIssue(reactionTextIssues[0])
          : undefined) ??
        validation.errors[0] ??
        validation.scriptErrors[0] ??
        'Fix validation errors first'
    );
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

  useEffect(() => {
    trpc.mods.getEditorSettings
      .query()
      .then((settings) => {
        setAuthorsHelpPageUrl(settings.authorsHelpPageUrl);
        setScriptingHelpPageUrl(settings.scriptingHelpPageUrl);
      })
      .catch((error) => {
        console.error(error);
        setAuthorsHelpPageUrl(null);
        setScriptingHelpPageUrl(null);
      });
  }, []);

  const updateDraft = (
    updater: (current: SaveDraftInput) => SaveDraftInput
  ) => {
    setDraft((current) => updater(current));
  };

  const openAuthorsHelpPage = () => {
    if (!authorsHelpPageUrl) {
      showToast('Authors Help Page URL is not configured.');
      return;
    }

    navigateTo(authorsHelpPageUrl);
  };

  const openScriptingHelpPage = () => {
    if (!scriptingHelpPageUrl) {
      showToast('Scripting Help Page URL is not configured.');
      return;
    }

    navigateTo(scriptingHelpPageUrl);
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
    const sanitizedName = sanitizeElementName(nextName);
    updateDraft((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === elementId
          ? {
              ...element,
              name: sanitizedName,
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
      const fallbackName = getNextGeneratedElementName(
        current.elements.filter((element) => element.id !== elementId)
      );

      return {
        ...current,
        elements: current.elements.map((element) => {
          if (element.id !== elementId) {
            return element;
          }

          const nextName =
            normalizeAuthoredElementName(element.name) || fallbackName;
          const validationError = getElementNameValidationError(nextName);
          if (validationError) {
            showToast(validationError);
            return {
              ...element,
              name: fallbackName,
              emoji:
                element.emoji === deriveElementGlyph(element.name)
                  ? deriveElementGlyph(fallbackName)
                  : element.emoji,
            };
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

  const handleElementNameDrop = (
    elementId: string,
    event: DragEvent<HTMLInputElement>
  ) => {
    event.preventDefault();
    const droppedName = event.dataTransfer.getData('text/plain').trim();
    if (!droppedName) {
      return;
    }

    renameElement(elementId, droppedName);
    setTimeout(() => finalizeElementName(elementId), 50);
  };

  const normalizeCounterDefinition = (
    counter: Pick<ModCounterDefinition, 'initial' | 'max' | 'min'>
  ) => normalizeModCounterDefinition(counter);

  const addCounterElement = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    updateDraft((current) => {
      const resolved = ensureElementInDraft(current, trimmed);
      if (!resolved.elementId) {
        return current;
      }
      if (
        resolved.draft.counters.some(
          (counter) => counter.elementId === resolved.elementId
        )
      ) {
        return {
          ...resolved.draft,
          startingElementIds: resolved.draft.startingElementIds.filter(
            (id) => id !== resolved.elementId
          ),
        };
      }

      return {
        ...resolved.draft,
        counters: [
          ...resolved.draft.counters,
          {
            elementId: resolved.elementId,
            initial: 0,
            max: 100,
            min: 0,
          },
        ],
        startingElementIds: resolved.draft.startingElementIds.filter(
          (id) => id !== resolved.elementId
        ),
      };
    });
  };

  const removeCounterElement = (elementId: string) => {
    updateDraft((current) => ({
      ...current,
      counters: current.counters.filter(
        (counter) => counter.elementId !== elementId
      ),
    }));
  };

  const updateElementAdvanced = (
    elementId: string,
    patch: Pick<ModElement, 'message' | 'effect'> & {
      nonConsumable: boolean;
      counterValues: Pick<
        ModCounterDefinition,
        'initial' | 'max' | 'min'
      > | null;
      isCounter: boolean;
      isStarting: boolean;
    }
  ) => {
    updateDraft((current) => {
      const normalizedCounter =
        patch.counterValues === null
          ? null
          : normalizeCounterDefinition(patch.counterValues);
      const nextCounters = patch.isCounter
        ? current.counters.some((counter) => counter.elementId === elementId)
          ? current.counters.map((counter) =>
              counter.elementId === elementId && normalizedCounter
                ? {
                    elementId,
                    ...normalizedCounter,
                  }
                : counter
            )
          : normalizedCounter
            ? [
                ...current.counters,
                {
                  elementId,
                  ...normalizedCounter,
                },
              ]
            : current.counters
        : current.counters.filter((counter) => counter.elementId !== elementId);

      return {
        ...current,
        counters: nextCounters,
        elements: current.elements.map((element) =>
          element.id === elementId
            ? {
                ...element,
                effect: patch.effect,
                message: patch.message,
                nonConsumable: patch.nonConsumable,
              }
            : element
        ),
        startingElementIds: patch.isCounter
          ? current.startingElementIds.filter((id) => id !== elementId)
          : patch.isStarting
            ? current.startingElementIds.includes(elementId)
              ? current.startingElementIds
              : [...current.startingElementIds, elementId]
            : current.startingElementIds.filter((id) => id !== elementId),
      };
    });
  };

  const removeElement = (elementId: string) => {
    updateDraft((current) => {
      const normalizedComments = normalizeReactionComments(current);
      const pairedReactions = current.reactions
        .map((reaction, index) => ({
          commentBlock: normalizedComments.byReaction[index],
          reaction,
        }))
        .filter(
          ({ reaction }) =>
            reaction.leftId !== elementId && reaction.rightId !== elementId
        )
        .map(({ commentBlock, reaction }) => ({
          commentBlock,
          reaction: {
            ...reaction,
            outputIds: reaction.outputIds.filter(
              (outputId) => outputId !== elementId
            ),
          },
        }))
        .filter(
          ({ reaction }) =>
            reaction.outputIds.length > 0 ||
            (reaction.script?.trim().length ?? 0) > 0
        );

      return {
        ...current,
        counters: current.counters.filter(
          (counter) => counter.elementId !== elementId
        ),
        elements: current.elements.filter(
          (element) => element.id !== elementId
        ),
        startingElementIds: current.startingElementIds.filter(
          (id) => id !== elementId
        ),
        reactions: pairedReactions.map(({ reaction }) => reaction),
        reactionComments: {
          byReaction: pairedReactions.map(({ commentBlock }) => ({
            headerComment: commentBlock?.headerComment,
            leadingComments: [...(commentBlock?.leadingComments ?? [])],
          })),
          trailingComments: [...normalizedComments.trailingComments],
        },
      };
    });
    setPendingElementFocusId((current) =>
      current === elementId ? null : current
    );
  };

  const addStartingElement = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateDraft((current) => {
      const resolved = ensureElementInDraft(current, trimmed);
      if (!resolved.elementId) {
        return current;
      }
      if (
        resolved.draft.counters.some(
          (counter) => counter.elementId === resolved.elementId
        )
      ) {
        return resolved.draft;
      }
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

    updateDraft((current) => {
      const reactionComments = normalizeReactionComments(current);
      return {
        ...current,
        reactions: [
          ...current.reactions,
          { leftId: '', rightId: '', outputIds: [''], script: '' },
        ],
        reactionComments: {
          ...reactionComments,
          byReaction: [...reactionComments.byReaction, { leadingComments: [] }],
        },
      };
    });
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
    if (!leftResolved.elementId) {
      return;
    }
    nextDraft = leftResolved.draft;
    const rightResolved = ensureElementInDraft(nextDraft, rightTrimmed);
    if (!rightResolved.elementId) {
      return;
    }
    nextDraft = rightResolved.draft;

    const outputIds: string[] = [];
    for (const outputName of outputNames) {
      const trimmed = outputName.trim();
      if (!trimmed) {
        continue;
      }
      const resolved = ensureElementInDraft(nextDraft, trimmed);
      if (!resolved.elementId) {
        continue;
      }
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
              script: reaction.script,
            }
          : reaction
      ),
    });
  };

  const updateReactionScript = (index: number, script: string) => {
    updateDraft((current) => ({
      ...current,
      reactions: current.reactions.map((reaction, reactionIndex) =>
        reactionIndex === index
          ? {
              ...reaction,
              script,
            }
          : reaction
      ),
    }));
  };

  const deleteReaction = (index: number) => {
    updateDraft((current) => {
      const normalizedComments = normalizeReactionComments(current);
      const nextCommentBlocks = [...normalizedComments.byReaction];
      const removedCommentBlock = nextCommentBlocks.splice(index, 1)[0];
      const trailingComments = [...normalizedComments.trailingComments];

      if ((removedCommentBlock?.leadingComments.length ?? 0) > 0) {
        if (index < nextCommentBlocks.length) {
          const targetCommentBlock = nextCommentBlocks[index] ?? {
            leadingComments: [],
          };
          nextCommentBlocks[index] = {
            ...targetCommentBlock,
            leadingComments: [
              ...removedCommentBlock!.leadingComments,
              ...(targetCommentBlock.leadingComments ?? []),
            ],
          };
        } else {
          trailingComments.unshift(...removedCommentBlock!.leadingComments);
        }
      }

      return {
        ...current,
        reactions: current.reactions.filter(
          (_, reactionIndex) => reactionIndex !== index
        ),
        reactionComments: {
          byReaction: nextCommentBlocks,
          trailingComments,
        },
      };
    });
  };

  const moveReaction = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }

    updateDraft((current) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.reactions.length ||
        toIndex >= current.reactions.length
      ) {
        return current;
      }

      const reactions = [...current.reactions];
      const reactionComments = normalizeReactionComments(current);
      const commentBlocks = [...reactionComments.byReaction];
      const [movedReaction] = reactions.splice(fromIndex, 1);
      const [movedCommentBlock] = commentBlocks.splice(fromIndex, 1);
      if (!movedReaction) {
        return current;
      }

      reactions.splice(toIndex, 0, movedReaction);
      commentBlocks.splice(
        toIndex,
        0,
        movedCommentBlock ?? { leadingComments: [] }
      );
      return {
        ...current,
        reactions,
        reactionComments: {
          byReaction: commentBlocks,
          trailingComments: reactionComments.trailingComments,
        },
      };
    });
  };

  const addMissingReactionElement = (name: string) => {
    updateDraft((current) => ensureElementInDraft(current, name).draft);
  };

  const persistDraftSilently = async () => {
    if (reactionView === 'text' && reactionTextIssues.length > 0) {
      const firstIssue = reactionTextIssues[0];
      throw new Error(
        firstIssue
          ? formatReactionTextIssue(firstIssue)
          : 'Fix text editor errors first'
      );
    }

    const nextDraft = draftWithTextChanges;
    if (reactionView === 'text') {
      setDraft(nextDraft);
    }

    const saved = await trpc.mods.saveDraft.mutate({
      ...nextDraft,
      summary: clampRealmSummary(nextDraft.summary),
      intro: nextDraft.intro.trim(),
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
    if (reactionTextIssues.length > 0 || !validation.isValid) {
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
    if (!loadedDraftId || !hasLoadedPublishedVersion) {
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
            ...draftWithTextChanges,
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
        counters: loaded.counters,
        showPalette: loaded.showPalette,
        elements: loaded.elements,
        reactions: loaded.reactions,
        reactionComments: loaded.reactionComments,
      });
      setReactionText(
        formatReactionText({
          id: loaded.id,
          title: loaded.title,
          summary: clampRealmSummary(loaded.summary),
          intro: loaded.intro,
          startingElementIds: loaded.startingElementIds,
          counters: loaded.counters,
          showPalette: loaded.showPalette,
          elements: loaded.elements,
          reactions: loaded.reactions,
          reactionComments: loaded.reactionComments,
        })
      );
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
  const filteredCounterElements = counterElements.filter(({ element }) =>
    element.name.toLowerCase().includes(elementSearch.toLowerCase())
  );
  const isReactionPanelExpanded =
    reactionView === 'text' && isReactionTextExpanded;

  const filteredReactions = draft.reactions
    .map((reaction, index) => ({
      index,
      reaction,
    }))
    .filter(({ reaction }) => {
      if (!reactionSearch) {
        return true;
      }

      const leftName =
        draft.elements.find((element) => element.id === reaction.leftId)
          ?.name ?? '';
      const rightName =
        draft.elements.find((element) => element.id === reaction.rightId)
          ?.name ?? '';
      const outputNames = reaction.outputIds
        .map(
          (outputId) =>
            draft.elements.find((element) => element.id === outputId)?.name ??
            ''
        )
        .join(' ');

      return `${leftName} ${rightName} ${outputNames} ${reaction.script ?? ''}`
        .toLowerCase()
        .includes(reactionSearch.toLowerCase());
    });

  return (
    <div className="realm-page min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pt-0 pb-4 sm:px-6">
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
              <h2 className="catalog-title-font realm-text-ink mt-2 text-xl font-black">
                {draft.title}
              </h2>
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

        <div className="editor-sticky-header sticky top-0 z-40 mb-4 rounded-b-3xl px-4 py-3 backdrop-blur-xl">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="justify-self-start">
              <button
                onClick={() => setTab('mine')}
                className={`catalog-title-font rounded-full px-4 py-2 text-sm font-bold ${tab === 'mine' ? 'realm-button-accent' : 'realm-button-muted'}`}
              >
                My Realms
              </button>
            </div>

            <div className="min-w-0 text-center">
              <div className="catalog-title-font realm-text-muted text-[11px] font-bold tracking-[0.24em] uppercase">
              Alchemy Workshop
              </div>
              <h1 className="catalog-title-font realm-text-ink truncate text-2xl font-black tracking-tight">
                Create and Share Realms
              </h1>
            </div>

            <div className="justify-self-end">
              <button
                onClick={() => setTab('editor')}
                className={`catalog-title-font rounded-full px-4 py-2 text-sm font-bold ${tab === 'editor' ? 'realm-button-accent' : 'realm-button-muted'}`}
              >
                Editor
              </button>
            </div>
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
                  <div className="flex flex-wrap justify-end gap-2">
                    {mod.hasDraftVersion && (
                      <span className="rounded-full bg-amber-300/20 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-amber-100 uppercase">
                        Draft
                      </span>
                    )}
                    {mod.hasPublishedVersion && (
                      <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-emerald-200 uppercase">
                        Published
                      </span>
                    )}
                    {!mod.hasDraftVersion && !mod.hasPublishedVersion && (
                      <span className="rounded-full bg-slate-400/20 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-slate-100 uppercase">
                        {mod.status}
                      </span>
                    )}
                  </div>
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
              <div className="grid gap-6 min-[600px]:grid-cols-[minmax(0,1fr)_minmax(18rem,0.88fr)]">
                <div className="min-w-0">
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
                  <div className="relative">
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
                      className="realm-input catalog-body-font w-full rounded-2xl border px-4 pt-3 pr-[4.5rem] pb-8 text-sm outline-none"
                    />
                    <div className="realm-text-muted pointer-events-none absolute right-4 bottom-3 text-xs">
                      {draft.summary.length}/{MAX_REALM_SUMMARY_LENGTH}
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="relative">
                    <textarea
                      value={draft.intro}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          intro: event.target.value.slice(
                            0,
                            MAX_REALM_INTRO_LENGTH
                          ),
                        }))
                      }
                      maxLength={MAX_REALM_INTRO_LENGTH}
                      placeholder="Intro shown when players open this realm. It disappears after the first reaction."
                      rows={6}
                      className="realm-input catalog-body-font w-full rounded-2xl border px-4 pt-3 pr-[4.5rem] pb-8 text-sm outline-none"
                    />
                    <div className="realm-text-muted pointer-events-none absolute right-4 bottom-3 text-xs">
                      {draft.intro.length}/{MAX_REALM_INTRO_LENGTH}
                    </div>
                  </div>
                </div>

                <div className="min-[700px]:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      disabled={isBusy}
                      onClick={saveDraft}
                      className={`${editorActionButtonClass} editor-action-button-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <IoSaveSharp />
                      Save
                    </button>
                    <button
                      disabled={isBusy}
                      onClick={playtestDraft}
                      className={`${editorActionButtonClass} editor-action-button-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <IoPlaySharp />
                      Playtest
                    </button>
                    <button
                      type="button"
                      aria-disabled={isBusy || !!publishBlockedReason}
                      title={
                        publishBlockedReason ??
                        (primaryPublishAction === 'unpublish'
                          ? 'Move this realm back to drafts.'
                          : hasLoadedPublishedVersion
                            ? 'Publish this updated draft to the live realm.'
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

                        void (primaryPublishAction === 'unpublish'
                          ? unpublishDraft()
                          : publishDraft());
                      }}
                      className={`${editorActionButtonClass} editor-action-button-primary ${
                        isBusy || publishBlockedReason
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer'
                      }`}
                    >
                      <IoRocketSharp />
                      {primaryPublishAction === 'unpublish'
                        ? 'Unpublish'
                        : hasLoadedPublishedVersion
                          ? 'Publish Update'
                          : 'Publish'}
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
                      className={`${editorActionButtonClass} editor-action-button-secondary ${
                        isBusy || shareBlockedReason
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer'
                      }`}
                    >
                      <IoShareOutline />
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
                      className={`${editorActionButtonClass} editor-action-button-secondary ${
                        isBusy || realmPageBlockedReason
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer'
                      }`}
                    >
                      Realm Page
                    </button>
                    <button
                      type="button"
                      onClick={openAuthorsHelpPage}
                      title={
                        authorsHelpPageUrl
                          ? 'Open Authors Help Page'
                          : 'Authors Help Page URL is not configured.'
                      }
                      className={`${editorActionButtonClass} editor-action-button-secondary cursor-pointer`}
                    >
                      Authors Help
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <EditorMetaTabsPanel
                  activeTab={activeMetaTab}
                  onTabChange={setActiveMetaTab}
                  starterCount={draft.startingElementIds.length}
                  startersContent={
                    <div className="flex flex-wrap items-center gap-2">
                        {draft.startingElementIds.map((id, index) => {
                          const el = draft.elements.find((e) => e.id === id);
                          return el ? (
                            <div
                              key={`starting-${id}-${index}`}
                              className="editor-starter-chip flex items-center gap-1 rounded-full py-1 pr-1 pl-2 text-sm font-bold"
                            >
                              <span className="text-base leading-none">
                                {el.emoji}
                              </span>
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
                          className="realm-input w-24 rounded-l-lg border sm:w-28"
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
                  }
                  advancedContent={
                    <div className="space-y-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.showPalette}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              showPalette: event.target.checked,
                            }))
                          }
                          className="h-4 w-4"
                        />
                        <span>
                          show palette
                          <span className="realm-text-soft">
                            {' '}
                            (turn this off for quest realms)
                          </span>
                        </span>
                      </label>

                      <div>
                        <div className="catalog-title-font realm-text-muted mb-2 text-[10px] font-bold tracking-[0.2em] uppercase">
                          Counters ({draft.counters.length})
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {counterElements.map(({ counter, element }) => (
                            <div
                              key={`counter-${counter.elementId}`}
                              className="editor-counter-chip flex items-center gap-1 rounded-full py-1 pr-1 pl-2 text-sm font-bold"
                            >
                              <span className="text-base leading-none">
                                {element.emoji}
                              </span>
                              <span>
                                {element.name}({counter.initial})
                              </span>
                              <button
                                onClick={() =>
                                  removeCounterElement(counter.elementId)
                                }
                                className="editor-counter-remove ml-0.5"
                              >
                                <IoCloseSharp size={16} />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex items-center">
                          <DroppableInput
                            value={newCounterText}
                            onChange={setNewCounterText}
                            onDropValue={(value) => {
                              addCounterElement(value);
                              setNewCounterText('');
                            }}
                            onClear={
                              newCounterText
                                ? () => setNewCounterText('')
                                : undefined
                            }
                            placeholder="Add counter"
                            className="realm-input w-32 rounded-l-lg border sm:w-40"
                            onEnter={() => {
                              addCounterElement(newCounterText);
                              setNewCounterText('');
                            }}
                          />
                          <button
                            onClick={() => {
                              addCounterElement(newCounterText);
                              setNewCounterText('');
                            }}
                            className="realm-button-accent cursor-pointer rounded-r-lg px-2 py-1.5"
                          >
                            <IoAddSharp size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  }
                />
              </div>
            </div>

            <EditorValidationPlank
              blockingItems={blockingValidationItems}
              warningItems={warningValidationItems}
              isBlinking={isValidationBlinking}
              isExpanded={isValidationExpanded}
              onToggle={() =>
                setIsValidationExpanded((current) => !current)
              }
            />

            <div
              className={`grid items-start gap-4 ${
                isReactionPanelExpanded
                  ? ''
                  : 'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]'
              }`}
            >
              <div className="realm-panel min-w-0 rounded-3xl p-3 backdrop-blur-xl lg:p-4">
                <div className="mb-4 flex flex-wrap items-start gap-3">
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
                      {draftWithTextChanges.reactions.length} total
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
                    {reactionView === 'text' && (
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setIsReactionTextExpanded((current) => !current)
                          }
                          className="realm-button-muted catalog-title-font rounded px-2 py-1 text-[9px] font-bold tracking-widest uppercase transition-colors"
                        >
                          {isReactionTextExpanded ? '<Compact' : 'Expand>'}
                        </button>
                        <button
                          type="button"
                          onClick={openScriptingHelpPage}
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
                    )}
                  </div>
                </div>

                {reactionView === 'visual' ? (
                  <div className="custom-scrollbar h-[500px] overflow-x-hidden overflow-y-auto pt-2 pb-6">
                    {filteredReactions.map(({ reaction, index }) => (
                      <ReactionWidget
                        counterElementIds={counterElementIds}
                        counterNames={counterNames}
                        key={`${reaction.leftId}-${reaction.rightId}-${index}`}
                        index={index}
                        reaction={reaction}
                        elements={draft.elements}
                        scriptingHelpPageUrl={scriptingHelpPageUrl}
                        onAddMissingElement={addMissingReactionElement}
                        onAutoAddElement={addMissingReactionElement}
                        onCommit={commitReaction}
                        onMoveReaction={moveReaction}
                        onOpenScriptingHelp={openScriptingHelpPage}
                        onUpdateScript={updateReactionScript}
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
                  <div className="flex h-[500px] flex-col gap-3 pb-6">
                    <ReactionScriptAutocompleteTextarea
                      className="realm-input custom-scrollbar min-h-0 w-full flex-1 resize-none rounded-xl border p-4 font-mono text-sm font-bold outline-none"
                      counterNames={counterNames}
                      elementNames={gameplayElementNames}
                      iconElementNames={draft.elements
                        .map((element) => element.name.trim())
                        .filter((name) => name.length > 0)}
                      mode="reaction-text"
                      textareaClassName="resize-none"
                      onBlur={() => syncDraftFromText(reactionText)}
                      onChange={setReactionText}
                      onElementCommitted={addMissingReactionElement}
                      placeholder={
                        'starters: Air, Fire, Earth, Water\ncounters: Health min=0 max=100 initial=10\nnonconsumables: Furnace\n\nWater+Fire=Steam, Fog\nCupboard+Key=\n    message "It opens."\n    add Treasure'
                      }
                      rows={18}
                      value={reactionText}
                    />
                    {reactionTextIssues.length > 0 && (
                      <div className="space-y-2">
                        {reactionTextIssues.slice(0, 4).map((issue) => (
                          <div
                            key={`reaction-text-${issue.line}-${issue.message}`}
                            className="editor-validation-error rounded-xl px-3 py-2 text-sm"
                          >
                            {formatReactionTextIssue(issue)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!isReactionPanelExpanded && (
                <div className="realm-panel min-w-0 rounded-3xl p-3 backdrop-blur-xl lg:p-4">
                  <div className="mb-4 flex flex-wrap items-start gap-3">
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
                            elementSearch
                              ? () => setElementSearch('')
                              : undefined
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
                      {filteredCounterElements.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {filteredCounterElements.map(
                            ({ counter, element }) => (
                              <div
                                key={`elements-counter-${counter.elementId}`}
                                className="editor-counter-chip flex items-center gap-1 rounded-full py-1 pr-2 pl-2 text-sm font-bold"
                              >
                                <span className="text-base leading-none">
                                  {element.emoji}
                                </span>
                                <span>
                                  {element.name}({counter.initial})
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      )}
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
                                  elementNameInputRefs.current[element.id] =
                                    node;
                                }}
                                value={element.name}
                                maxLength={32}
                                onChange={(event) =>
                                  renameElement(element.id, event.target.value)
                                }
                                onBlur={() => finalizeElementName(element.id)}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) =>
                                  handleElementNameDrop(element.id, event)
                                }
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
                                scriptingHelpPageUrl={scriptingHelpPageUrl}
                                element={element}
                                counterDefinition={
                                  draft.counters.find(
                                    (counter) =>
                                      counter.elementId === element.id
                                  ) ?? null
                                }
                                isStarting={draft.startingElementIds.includes(
                                  element.id
                                )}
                                onOpenScriptingHelp={openScriptingHelpPage}
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
                    <div className="custom-scrollbar h-[500px] overflow-x-hidden overflow-y-auto pr-1 pb-6">
                      {filteredCounterElements.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {filteredCounterElements.map(
                            ({ counter, element }) => (
                              <div
                                key={`compact-counter-${counter.elementId}`}
                                className="editor-counter-chip flex items-center gap-1 rounded-full py-1 pr-2 pl-2 text-sm font-bold"
                              >
                                <span className="text-base leading-none">
                                  {element.emoji}
                                </span>
                                <span>
                                  {element.name}({counter.initial})
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-4 justify-items-center gap-2">
                        {filteredElements.map((element) => (
                          <CompactElementTile
                            scriptingHelpPageUrl={scriptingHelpPageUrl}
                            counterDefinition={
                              draft.counters.find(
                                (counter) => counter.elementId === element.id
                              ) ?? null
                            }
                            key={element.id}
                            element={element}
                            isStarting={draft.startingElementIds.includes(
                              element.id
                            )}
                            onOpenScriptingHelp={openScriptingHelpPage}
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
