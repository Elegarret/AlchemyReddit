import './index.css';

import { navigateTo, requestExpandedMode, showToast } from '@devvit/web/client';
import { StrictMode, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { IoAddSharp, IoCheckmarkCircleSharp, IoCloseSharp, IoCopyOutline, IoPlaySharp, IoRocketSharp, IoSaveSharp, IoShareOutline } from 'react-icons/io5';
import {
	DEFAULT_MOD_BG_COLOR_TOKEN,
	DEFAULT_MOD_FRAME_COLOR_TOKEN,
	getModElementClasses,
	MOD_COLOR_OPTIONS,
} from './modding/colors';
import {
	buildRulesetFromDraft,
	createElementIdFromName,
	PLAYTEST_RULESET_STORAGE_KEY,
	validateModDraft,
} from './modding/runtime';
import type { ModDoc, ModElement, ModListItem, SaveDraftInput } from './modding/types';
import { trpc } from './trpc';

type EditorTab = 'community' | 'mine' | 'editor';

type ReactionWidgetProps = {
	index: number;
	reaction: SaveDraftInput['reactions'][number];
	elements: ModElement[];
	onCommit: (index: number, leftName: string, rightName: string, outputNames: string[]) => void;
	onDelete: (index: number) => void;
};

const ELEMENT_DATALIST_ID = 'alchemy-mod-elements';

const deriveElementGlyph = (name: string) => {
	const trimmed = name.trim();
	return trimmed ? trimmed.charAt(0).toUpperCase() : '•';
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
	title: 'Untitled Mod',
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

const createDraftFromPublished = (mod: ModDoc): SaveDraftInput => ({
	title: `${mod.title} Remix`,
	summary: mod.summary,
	startingElementIds: mod.startingElementIds,
	elements: mod.elements,
	reactions: mod.reactions,
});

const formatDate = (value: string) =>
	new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	}).format(new Date(value));

const findElementByName = (elements: ModElement[], name: string) => {
	const normalized = name.trim().toLowerCase();
	return elements.find((element) => element.name.trim().toLowerCase() === normalized) ?? null;
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

	const nextElement = createStarterElement(ensureUniqueElementId(draft.elements, trimmed), trimmed);
	return {
		draft: {
			...draft,
			elements: [...draft.elements, nextElement],
		},
		elementId: nextElement.id,
	};
};

const ElementPreview = ({ element }: { element: ModElement }) => (
	<div className={`flex h-14 w-14 flex-col items-center justify-end overflow-hidden rounded-xl border-2 ${getModElementClasses(element.bgColorToken, element.frameColorToken)}`}>
		<div className="flex flex-1 items-center justify-center text-2xl font-black text-white/90">{element.emoji}</div>
		<div className="w-full bg-black/25 py-1 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-white">
			{element.name.slice(0, 8)}
		</div>
	</div>
);

const ReactionWidget = ({ index, reaction, elements, onCommit, onDelete }: ReactionWidgetProps) => {
	const outputRefs = useRef<Array<HTMLInputElement | null>>([]);
	const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);

	const leftName = elements.find((element) => element.id === reaction.leftId)?.name ?? '';
	const rightName = elements.find((element) => element.id === reaction.rightId)?.name ?? '';
	const outputNames = reaction.outputIds.map((outputId) => elements.find((element) => element.id === outputId)?.name ?? '');

	const [leftText, setLeftText] = useState(leftName);
	const [rightText, setRightText] = useState(rightName);
	const [outputTexts, setOutputTexts] = useState<string[]>(outputNames.length > 0 ? outputNames : ['']);

	useEffect(() => {
		setLeftText(leftName);
	}, [leftName]);

	useEffect(() => {
		setRightText(rightName);
	}, [rightName]);

	useEffect(() => {
		setOutputTexts(outputNames.length > 0 ? outputNames : ['']);
	}, [reaction.outputIds.join('|'), elements.map((element) => `${element.id}:${element.name}`).join('|')]);

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

	const commit = (nextLeftText: string = leftText, nextRightText: string = rightText, nextOutputTexts: string[] = outputTexts) => {
		onCommit(index, nextLeftText, nextRightText, nextOutputTexts);
	};

	const handleEnter = (
		event: KeyboardEvent<HTMLInputElement>,
		nextLeftText: string = leftText,
		nextRightText: string = rightText,
		nextOutputTexts: string[] = outputTexts
	) => {
		if (event.key !== 'Enter') {
			return;
		}

		event.preventDefault();
		commit(nextLeftText, nextRightText, nextOutputTexts);
	};

	return (
		<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
			<div className="mb-3 flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
						<input
							list={ELEMENT_DATALIST_ID}
							value={leftText}
							onChange={(event) => setLeftText(event.target.value)}
							onBlur={() => commit()}
							onKeyDown={(event) => handleEnter(event)}
							placeholder="Element A"
							className="rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm outline-none"
						/>
						<div className="text-center text-lg font-black text-cyan-200">+</div>
						<input
							list={ELEMENT_DATALIST_ID}
							value={rightText}
							onChange={(event) => setRightText(event.target.value)}
							onBlur={() => commit()}
							onKeyDown={(event) => handleEnter(event)}
							placeholder="Element B"
							className="rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm outline-none"
						/>
					</div>
				</div>
				<button onClick={() => onDelete(index)} className="rounded-full bg-white/10 p-2 text-white/70">
					<IoCloseSharp />
				</button>
			</div>

			<div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
				<div className="pt-2 text-xs font-bold uppercase tracking-[0.18em] text-white/40">Outputs</div>
				<div className="space-y-2">
					<div className="flex flex-wrap gap-2">
						{outputTexts.map((outputText, outputIndex) => (
							<input
								key={`reaction-${index}-output-${outputIndex}`}
								ref={(input) => {
									outputRefs.current[outputIndex] = input;
								}}
								list={ELEMENT_DATALIST_ID}
								value={outputText}
								onChange={(event) => {
									const next = [...outputTexts];
									next[outputIndex] = event.target.value;
									setOutputTexts(next);
								}}
								onBlur={() => commit(leftText, rightText, outputTexts)}
								onKeyDown={(event) => handleEnter(event, leftText, rightText, outputTexts)}
								placeholder={`Output ${outputIndex + 1}`}
								className="min-w-[150px] flex-1 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm outline-none"
							/>
						))}
						<button
							onClick={() => {
								setOutputTexts((current) => [...current, '']);
								setPendingFocusIndex(outputTexts.length);
							}}
							className="rounded-full bg-cyan-400 px-3 py-2 text-sm font-black text-slate-950"
						>
							<IoAddSharp />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

const App = () => {
	const [tab, setTab] = useState<EditorTab>('editor');
	const [draft, setDraft] = useState<SaveDraftInput>(createEmptyDraft);
	const [communityMods, setCommunityMods] = useState<ModListItem[]>([]);
	const [myMods, setMyMods] = useState<ModListItem[]>([]);
	const [isBusy, setIsBusy] = useState(false);
	const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
	const [elementSearch, setElementSearch] = useState('');
	const [reactionSearch, setReactionSearch] = useState('');

	const validation = useMemo(() => validateModDraft(draft), [draft]);

	const refreshLists = async () => {
		const [catalog, mine] = await Promise.all([
			trpc.mods.listCatalog.query(),
			trpc.mods.listMine.query(),
		]);
		setCommunityMods(catalog);
		setMyMods(mine);
	};

	useEffect(() => {
		refreshLists().catch((error) => {
			console.error(error);
			showToast('Failed to load mods');
		});
	}, []);

	const updateDraft = (updater: (current: SaveDraftInput) => SaveDraftInput) => {
		setDraft((current) => updater(current));
	};

	const addElement = () => {
		const baseName = `Element ${draft.elements.length + 1}`;
		const nextElement = createStarterElement(ensureUniqueElementId(draft.elements, baseName), baseName);
		updateDraft((current) => ({
			...current,
			elements: [...current.elements, nextElement],
		}));
	};

	const renameElement = (elementId: string, nextName: string) => {
		updateDraft((current) => ({
			...current,
			elements: current.elements.map((element) =>
				element.id === elementId
					? {
							...element,
							name: nextName,
							emoji: deriveElementGlyph(nextName),
						}
					: element
			),
		}));
	};

	const updateElementColors = (elementId: string, patch: Pick<ModElement, 'bgColorToken' | 'frameColorToken'>) => {
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
			startingElementIds: current.startingElementIds.filter((id) => id !== elementId),
			reactions: current.reactions
				.filter((reaction) => reaction.leftId !== elementId && reaction.rightId !== elementId)
				.map((reaction) => ({
					...reaction,
					outputIds: reaction.outputIds.filter((outputId) => outputId !== elementId),
				}))
				.filter((reaction) => reaction.outputIds.length > 0),
		}));
	};

	const toggleStarting = (elementId: string) => {
		updateDraft((current) => {
			const isStarting = current.startingElementIds.includes(elementId);
			if (isStarting) {
				return {
					...current,
					startingElementIds: current.startingElementIds.filter((id) => id !== elementId),
				};
			}

			return {
				...current,
				startingElementIds: [...current.startingElementIds, elementId],
			};
		});
	};

	const addReaction = () => {
		const first = draft.elements[0]?.id;
		const second = draft.elements[1]?.id ?? draft.elements[0]?.id;
		if (!first || !second) {
			showToast('Add elements first');
			return;
		}

		updateDraft((current) => ({
			...current,
			reactions: [...current.reactions, { leftId: first, rightId: second, outputIds: [first] }],
		}));
	};

	const commitReaction = (index: number, leftName: string, rightName: string, outputNames: string[]) => {
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
			reactions: current.reactions.filter((_, reactionIndex) => reactionIndex !== index),
		}));
	};

	const saveDraft = async () => {
		setIsBusy(true);
		try {
			const saved = await trpc.mods.saveDraft.mutate({
				...draft,
				...(loadedDraftId ? { id: loadedDraftId } : {}),
			});
			setLoadedDraftId(saved.id);
			showToast('Draft saved');
			await refreshLists();
		} catch (error) {
			console.error(error);
			showToast(error instanceof Error ? error.message : 'Failed to save draft');
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
			let modId = loadedDraftId;
			if (!modId) {
				const saved = await trpc.mods.saveDraft.mutate(draft);
				modId = saved.id;
				setLoadedDraftId(saved.id);
			}

			if (!modId) {
				throw new Error('Missing draft id');
			}

			await trpc.mods.publish.mutate(modId);
			showToast('Mod published');
			await refreshLists();
		} catch (error) {
			console.error(error);
			showToast(error instanceof Error ? error.message : 'Failed to publish mod');
		} finally {
			setIsBusy(false);
		}
	};

	const shareDraft = async () => {
		if (!loadedDraftId) {
			showToast('Save and publish the mod first');
			return;
		}

		setIsBusy(true);
		try {
			const sharePost = await trpc.mods.createSharePost.mutate(loadedDraftId);
			showToast('Share post created');
			navigateTo(sharePost.url);
		} catch (error) {
			console.error(error);
			showToast(error instanceof Error ? error.message : 'Failed to share mod');
		} finally {
			setIsBusy(false);
		}
	};

	const playtestDraft = (event: MouseEvent<HTMLButtonElement>) => {
		if (!validation.isValid) {
			showToast(validation.errors[0] ?? 'Fix validation errors first');
			return;
		}

		localStorage.setItem(
			PLAYTEST_RULESET_STORAGE_KEY,
			JSON.stringify(
				buildRulesetFromDraft({
					...draft,
					...(loadedDraftId ? { id: loadedDraftId } : {}),
				})
			)
		);
		requestExpandedMode(event.nativeEvent, 'game');
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
			setTab('editor');
		} catch (error) {
			console.error(error);
			showToast(error instanceof Error ? error.message : 'Failed to load draft');
		} finally {
			setIsBusy(false);
		}
	};

	const forkPublishedMod = async (modId: string) => {
		setIsBusy(true);
		try {
			const mod = await trpc.mods.getPublished.query(modId);
			if (!mod) {
				showToast('Mod not found');
				return;
			}

			setDraft(createDraftFromPublished(mod));
			setLoadedDraftId(null);
			setTab('editor');
		} catch (error) {
			console.error(error);
			showToast('Failed to fork mod');
		} finally {
			setIsBusy(false);
		}
	};

	const playPublishedMod = async (event: MouseEvent<HTMLButtonElement>, modId: string) => {
		setIsBusy(true);
		try {
			const mod = await trpc.mods.getPublished.query(modId);
			if (!mod) {
				showToast('Mod not found');
				return;
			}

			localStorage.setItem(
				PLAYTEST_RULESET_STORAGE_KEY,
				JSON.stringify(
					buildRulesetFromDraft({
						id: mod.id,
						title: mod.title,
						summary: mod.summary,
						startingElementIds: mod.startingElementIds,
						elements: mod.elements,
						reactions: mod.reactions,
					})
				)
			);
			requestExpandedMode(event.nativeEvent, 'game');
		} catch (error) {
			console.error(error);
			showToast('Failed to open mod');
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

		const leftName = draft.elements.find((element) => element.id === reaction.leftId)?.name ?? '';
		const rightName = draft.elements.find((element) => element.id === reaction.rightId)?.name ?? '';
		const outputNames = reaction.outputIds
			.map((outputId) => draft.elements.find((element) => element.id === outputId)?.name ?? '')
			.join(' ');

		return `${leftName} ${rightName} ${outputNames}`.toLowerCase().includes(reactionSearch.toLowerCase());
	});

	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top,#17304f_0%,#0b1424_46%,#060a12_100%)] text-white">
			<div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6">
				<datalist id={ELEMENT_DATALIST_ID}>
					{draft.elements.map((element) => (
						<option key={`element-option-${element.id}`} value={element.name} />
					))}
				</datalist>

				<div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/6 px-4 py-4 backdrop-blur-xl">
					<div>
						<div className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/60">Alchemy Workshop</div>
						<h1 className="text-2xl font-black tracking-tight text-white">Create and Share Mods</h1>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<button onClick={() => setTab('community')} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'community' ? 'bg-cyan-400 text-slate-950' : 'bg-white/8 text-white/80'}`}>Community</button>
						<button onClick={() => setTab('mine')} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'mine' ? 'bg-cyan-400 text-slate-950' : 'bg-white/8 text-white/80'}`}>My Mods</button>
						<button onClick={() => setTab('editor')} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'editor' ? 'bg-cyan-400 text-slate-950' : 'bg-white/8 text-white/80'}`}>Editor</button>
					</div>
				</div>

				{tab !== 'editor' && (
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{(tab === 'community' ? communityMods : myMods).map((mod) => (
							<div key={`${tab}-${mod.id}`} className="rounded-3xl border border-white/10 bg-white/6 p-5 backdrop-blur-xl">
								<div className="mb-3 flex items-start justify-between gap-3">
									<div>
										<h2 className="text-xl font-black text-white">{mod.title}</h2>
										<p className="mt-1 text-sm text-white/65">{mod.summary || 'No summary provided.'}</p>
									</div>
									<span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${mod.status === 'published' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-300/20 text-amber-100'}`}>
										{mod.status}
									</span>
								</div>
								<div className="mb-5 space-y-1 text-sm text-white/70">
									<div>By {mod.ownerUsername}</div>
									<div>{mod.elementCount} elements, {mod.reactionCount} reactions</div>
									<div>Updated {formatDate(mod.updatedAt)}</div>
								</div>
								<div className="flex flex-wrap gap-2">
									{tab === 'community' ? (
										<>
											<button onClick={(event) => playPublishedMod(event, mod.id)} className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950"><IoPlaySharp className="mr-1 inline-block" />Play</button>
											<button onClick={() => forkPublishedMod(mod.id)} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white"><IoCopyOutline className="mr-1 inline-block" />Fork</button>
										</>
									) : (
										<button onClick={() => loadDraftFromServer(mod.id)} className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950">Edit</button>
									)}
								</div>
							</div>
						))}
						{(tab === 'community' ? communityMods : myMods).length === 0 && (
							<div className="rounded-3xl border border-dashed border-white/15 bg-white/4 p-8 text-center text-white/65">
								{tab === 'community' ? 'No published mods yet.' : 'You have not saved any mods yet.'}
							</div>
						)}
					</div>
				)}

				{tab === 'editor' && (
					<div className="flex flex-1 flex-col gap-4">
						<div className="rounded-3xl border border-white/10 bg-white/6 p-5 backdrop-blur-xl">
							<div className="mb-4 flex flex-wrap items-start justify-between gap-4">
								<div className="min-w-[260px] flex-1">
									<div className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/60">Mod Info</div>
									<input value={draft.title} onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))} className="mb-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-2xl font-black outline-none" />
									<textarea value={draft.summary} onChange={(event) => updateDraft((current) => ({ ...current, summary: event.target.value }))} placeholder="Describe the mod" rows={2} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none" />
								</div>
								<div className="flex flex-wrap gap-2">
									<button disabled={isBusy} onClick={playtestDraft} className="rounded-full bg-indigo-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"><IoPlaySharp className="mr-1 inline-block" />Playtest</button>
									<button disabled={isBusy} onClick={saveDraft} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><IoSaveSharp className="mr-1 inline-block" />Save</button>
									<button disabled={isBusy} onClick={publishDraft} className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"><IoRocketSharp className="mr-1 inline-block" />Publish</button>
									<button disabled={isBusy || !loadedDraftId} onClick={shareDraft} className="rounded-full bg-orange-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"><IoShareOutline className="mr-1 inline-block" />Share</button>
								</div>
							</div>

							<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
								<div>
									<div className="mb-2 flex items-center justify-between">
										<div className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/60">Starting Elements</div>
										<div className="text-xs text-white/55">{draft.startingElementIds.length} selected</div>
									</div>
									<div className="flex flex-wrap gap-2">
										{draft.elements.map((element) => {
											const isStarting = draft.startingElementIds.includes(element.id);
											return (
												<button
													key={`starting-${element.id}`}
													onClick={() => toggleStarting(element.id)}
													className={`rounded-full border px-3 py-2 text-sm font-bold ${isStarting ? 'border-emerald-300 bg-emerald-400/18 text-emerald-50' : 'border-white/10 bg-black/15 text-white/75'}`}
												>
													{isStarting && <IoCheckmarkCircleSharp className="mr-1 inline-block" />}
													{element.name}
												</button>
											);
										})}
									</div>
								</div>

								<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
									<div className="mb-3 flex items-center justify-between">
										<div className="text-sm font-black text-white">Validation</div>
										<span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${validation.isValid ? 'bg-emerald-400/20 text-emerald-100' : 'bg-rose-400/20 text-rose-100'}`}>
											{validation.isValid ? 'Ready' : 'Blocked'}
										</span>
									</div>
									<div className="mb-3 text-sm text-white/65">
										{validation.reachableElementIds.length}/{validation.totalElements} reachable
									</div>
									{validation.errors.length > 0 && (
										<div className="space-y-2">
											{validation.errors.slice(0, 3).map((error) => (
												<div key={error} className="rounded-xl bg-rose-400/12 px-3 py-2 text-sm text-rose-100">{error}</div>
											))}
										</div>
									)}
									{validation.errors.length === 0 && validation.warnings.length > 0 && (
										<div className="space-y-2">
											{validation.warnings.slice(0, 2).map((warning) => (
												<div key={warning} className="rounded-xl bg-amber-300/12 px-3 py-2 text-sm text-amber-50">{warning}</div>
											))}
										</div>
									)}
								</div>
							</div>
						</div>

						<div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
							<div className="rounded-3xl border border-white/10 bg-white/6 p-4 backdrop-blur-xl">
								<div className="mb-4 flex items-center justify-between">
									<div>
										<div className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/60">Reactions</div>
										<div className="text-sm text-white/70">{draft.reactions.length} total</div>
									</div>
									<div className="flex items-center gap-2">
										<input value={reactionSearch} onChange={(event) => setReactionSearch(event.target.value)} placeholder="Search reactions" className="w-44 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" />
										<button onClick={addReaction} className="rounded-full bg-cyan-400 p-2 text-slate-950"><IoAddSharp size={18} /></button>
									</div>
								</div>

								<div className="space-y-3">
									{filteredReactions.map((reaction, index) => (
										<ReactionWidget
											key={`${reaction.leftId}-${reaction.rightId}-${index}`}
											index={index}
											reaction={reaction}
											elements={draft.elements}
											onCommit={commitReaction}
											onDelete={deleteReaction}
										/>
									))}

									{filteredReactions.length === 0 && (
										<div className="rounded-2xl border border-dashed border-white/15 bg-white/4 p-8 text-center text-white/60">
											No reactions yet. Add one to make the mod playable.
										</div>
									)}
								</div>
							</div>

							<div className="rounded-3xl border border-white/10 bg-white/6 p-4 backdrop-blur-xl">
								<div className="mb-4 flex items-center justify-between">
									<div>
										<div className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/60">Elements</div>
										<div className="text-sm text-white/70">{draft.elements.length} total</div>
									</div>
									<div className="flex items-center gap-2">
										<input value={elementSearch} onChange={(event) => setElementSearch(event.target.value)} placeholder="Search elements" className="w-44 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" />
										<button onClick={addElement} className="rounded-full bg-cyan-400 p-2 text-slate-950"><IoAddSharp size={18} /></button>
									</div>
								</div>

								<div className="space-y-3">
									{filteredElements.map((element) => (
										<div key={element.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
											<div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_9rem_9rem_auto] md:items-center">
												<ElementPreview element={element} />
												<input
													value={element.name}
													onChange={(event) => renameElement(element.id, event.target.value)}
													placeholder="Element name"
													className="rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm outline-none"
												/>
												<select
													value={element.bgColorToken}
													onChange={(event) => updateElementColors(element.id, { bgColorToken: event.target.value, frameColorToken: element.frameColorToken })}
													className="rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm"
												>
													{MOD_COLOR_OPTIONS.map((option) => (
														<option key={`bg-${option.value}`} value={option.value}>{option.label} bg</option>
													))}
												</select>
												<select
													value={element.frameColorToken}
													onChange={(event) => updateElementColors(element.id, { bgColorToken: element.bgColorToken, frameColorToken: event.target.value })}
													className="rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm"
												>
													{MOD_COLOR_OPTIONS.map((option) => (
														<option key={`frame-${option.value}`} value={option.value}>{option.label} frame</option>
													))}
												</select>
												<button onClick={() => removeElement(element.id)} className="rounded-full bg-white/10 p-2 text-white/70">
													<IoCloseSharp />
												</button>
											</div>
										</div>
									))}
								</div>
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
