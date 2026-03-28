import { navigateTo, showShareSheet, showToast } from '@devvit/web/client';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
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
  validateModDraft,
} from '../modding/runtime';
import {
  MAX_REALM_INTRO_LENGTH,
  MAX_REALM_SUMMARY_LENGTH,
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
import {
  ELEMENT_DATALIST_ID,
  type EditorTab,
  type ElementPanelView,
} from './constants';
import {
  applyReactionTextToDraft,
  clampRealmSummary,
  createEmptyDraft,
  createStarterElement,
  deriveElementGlyph,
  ensureElementInDraft,
  ensureUniqueElementId,
  formatDate,
  formatReactionText,
  getNextGeneratedElementName,
  getSharePostUrl,
} from './draft';

export const ModEditorApp = () => {
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
    updateDraft((currentDraft) => applyReactionTextToDraft(currentDraft, text));
  };

  const toggleReactionView = () => {
    if (reactionView === 'visual') {
      setReactionText(formatReactionText(draft));
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
