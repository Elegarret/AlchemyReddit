import { type ReactNode, useId } from 'react';
import { type ValidationResult } from '../modding/types';
import { formatReactionTextIssue } from './draft';

type ReactionTextIssue = {
  line: number;
  message: string;
};

export type EditorMetaTab = 'starters' | 'advanced';

export type EditorValidationItem = {
  id: string;
  kind: 'blocking' | 'warning';
  message: string;
};

export const getBlockingValidationItems = ({
  reactionTextIssues,
  validation,
}: {
  reactionTextIssues: ReactionTextIssue[];
  validation: Pick<ValidationResult, 'errors' | 'scriptErrors'>;
}): EditorValidationItem[] =>
  [
    ...reactionTextIssues.map((issue) => formatReactionTextIssue(issue)),
    ...validation.errors,
    ...validation.scriptErrors,
  ]
    .map((message, index) => ({
      id: `blocking-${index}-${message}`,
      kind: 'blocking' as const,
      message,
    }))
    .reverse();

export const getWarningValidationItems = (
  warnings: string[]
): EditorValidationItem[] =>
  warnings.map((message, index) => ({
    id: `warning-${index}-${message}`,
    kind: 'warning',
    message,
  }));

export const EditorValidationPlank = ({
  blockingItems,
  warningItems,
  isBlinking,
  isExpanded,
  onToggle,
}: {
  blockingItems: EditorValidationItem[];
  warningItems: EditorValidationItem[];
  isBlinking: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  const hasBlockingItems = blockingItems.length > 0;
  const hasWarnings = warningItems.length > 0;
  const isInteractive = hasBlockingItems || hasWarnings;
  const countLabel = hasBlockingItems
    ? `(${blockingItems.length} ${
        blockingItems.length === 1 ? 'error' : 'errors'
      }${isExpanded ? '▲' : '▼'})`
    : hasWarnings
      ? `(${warningItems.length} ${
          warningItems.length === 1 ? 'warning' : 'warnings'
        }${isExpanded ? '▲' : '▼'})`
      : null;
  const summaryText = hasBlockingItems
    ? `Validation: ${blockingItems[0]?.message ?? ''}`
    : 'Validation: all good';

  return (
    <div
      className={`editor-validation-plank sticky top-[5.25rem] z-30 overflow-hidden rounded-2xl border backdrop-blur-xl ${
        hasBlockingItems
          ? 'editor-validation-plank-blocked'
          : 'editor-validation-plank-ready'
      } ${isBlinking ? 'animate-shake ring-2 ring-rose-300/70' : ''}`}
    >
      <button
        type="button"
        disabled={!isInteractive}
        aria-expanded={isInteractive ? isExpanded : undefined}
        onClick={() => {
          if (isInteractive) {
            onToggle();
          }
        }}
        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${
          isInteractive ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className="catalog-title-font min-w-0 truncate text-xs font-bold tracking-[0.14em]">
          {summaryText}
        </span>
        {countLabel && (
          <span className="catalog-title-font shrink-0 text-[10px] font-bold tracking-[0.16em]">
            {countLabel}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-2 border-t border-current/15 px-3 pt-2 pb-3">
          {blockingItems.map((item) => (
            <div
              key={item.id}
              className="editor-validation-error rounded-xl px-3 py-2 text-sm"
            >
              {item.message}
            </div>
          ))}

          {warningItems.length > 0 && (
            <div className="space-y-2">
              {warningItems.map((item) => (
                <div
                  key={item.id}
                  className="editor-validation-warning rounded-xl px-3 py-2 text-sm"
                >
                  {item.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const EditorMetaTabsPanel = ({
  activeTab,
  onTabChange,
  starterCount,
  startersContent,
  advancedContent,
}: {
  activeTab: EditorMetaTab;
  onTabChange: (tab: EditorMetaTab) => void;
  starterCount: number;
  startersContent: ReactNode;
  advancedContent: ReactNode;
}) => {
  const id = useId();
  const startersTabId = `${id}-starters-tab`;
  const advancedTabId = `${id}-advanced-tab`;
  const startersPanelId = `${id}-starters-panel`;
  const advancedPanelId = `${id}-advanced-panel`;

  return (
    <div className="realm-panel-soft rounded-2xl p-4">
      <div
        className="mb-4 flex flex-wrap items-center gap-2"
        role="tablist"
        aria-label="Realm meta sections"
      >
        <button
          type="button"
          id={startersTabId}
          role="tab"
          aria-selected={activeTab === 'starters'}
          aria-controls={startersPanelId}
          onClick={() => onTabChange('starters')}
          className={`editor-meta-tab catalog-title-font rounded-full px-3 py-1.5 text-[11px] font-bold tracking-[0.18em] uppercase ${
            activeTab === 'starters' ? 'editor-meta-tab-active' : ''
          }`}
        >
          Starting Elements ({starterCount})
        </button>
        <button
          type="button"
          id={advancedTabId}
          role="tab"
          aria-selected={activeTab === 'advanced'}
          aria-controls={advancedPanelId}
          onClick={() => onTabChange('advanced')}
          className={`editor-meta-tab catalog-title-font rounded-full px-3 py-1.5 text-[11px] font-bold tracking-[0.18em] uppercase ${
            activeTab === 'advanced' ? 'editor-meta-tab-active' : ''
          }`}
        >
          Advanced Options
        </button>
      </div>

      <div
        id={activeTab === 'starters' ? startersPanelId : advancedPanelId}
        role="tabpanel"
        aria-labelledby={activeTab === 'starters' ? startersTabId : advancedTabId}
      >
        {activeTab === 'starters' ? startersContent : advancedContent}
      </div>
    </div>
  );
};
