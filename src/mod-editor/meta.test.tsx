import { act, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorMetaTabsPanel,
  EditorValidationPlank,
  getBlockingValidationItems,
  type EditorMetaTab,
} from './meta';

const renderIntoDocument = async (node: ReactNode) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(container);

  await act(async () => {
    root.render(node);
  });

  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
};

describe('editor meta ui', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  });

  it('renders a ready validation plank when there are no blocking issues', async () => {
    const { container, unmount } = await renderIntoDocument(
      <EditorValidationPlank
        blockingItems={[]}
        warningItems={[]}
        isBlinking={false}
        isExpanded={false}
        onToggle={() => undefined}
      />
    );

    expect(container.textContent).toContain('Validation: all good');
    expect(
      container.querySelector('.editor-validation-plank-ready')
    ).toBeTruthy();

    await unmount();
  });

  it('shows the newest blocking error in the collapsed summary and expands the full list', async () => {
    const blockingItems = getBlockingValidationItems({
      reactionTextIssues: [{ line: 4, message: 'Unexpected reaction text.' }],
      validation: {
        errors: ['A realm title is required.'],
        scriptErrors: ['"Air + Fire" script line 2: Unknown counter hp.'],
      },
    });

    const Harness = () => {
      const [isExpanded, setIsExpanded] = useState(false);

      return (
        <EditorValidationPlank
          blockingItems={blockingItems}
          warningItems={[]}
          isBlinking={false}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((current) => !current)}
        />
      );
    };

    const { container, unmount } = await renderIntoDocument(<Harness />);
    const button = container.querySelector('button');

    expect(
      container.querySelector('.editor-validation-plank-blocked')
    ).toBeTruthy();
    expect(button?.textContent).toContain(
      'Validation: "Air + Fire" script line 2: Unknown counter hp.'
    );
    expect(button?.textContent).toContain('(3 errors▼)');
    expect(container.textContent).not.toContain('A realm title is required.');

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(button?.textContent).toContain('(3 errors▲)');
    expect(container.textContent).toContain('A realm title is required.');
    expect(container.textContent).toContain('Line 4: Unexpected reaction text.');

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(button?.textContent).toContain('(3 errors▼)');
    expect(container.textContent).not.toContain('A realm title is required.');

    await unmount();
  });

  it('adds action buttons for missing and unreachable element validation items', async () => {
    const onAddMissingElement = vi.fn();
    const onRemoveUnreachableElements = vi.fn();
    const blockingItems = getBlockingValidationItems({
      onAddMissingElement,
      onRemoveUnreachableElements,
      reactionTextIssues: [
        {
          line: 3,
          message: 'Unknown element "Steam".',
          missingElementName: 'Steam',
        },
      ],
      validation: {
        errors: ['Unreachable elements: Crystal, Mist'],
        scriptErrors: ['"Air + Fire" script line 1: Unknown element "Fog".'],
      },
    });

    const { container, unmount } = await renderIntoDocument(
      <EditorValidationPlank
        blockingItems={blockingItems}
        warningItems={[]}
        isBlinking={false}
        isExpanded={true}
        onToggle={() => undefined}
      />
    );

    const buttons = Array.from(container.querySelectorAll('button'));
    const addSteamButton = buttons.find((button) =>
      button.textContent?.includes('Add Steam')
    );
    const addFogButton = buttons.find((button) =>
      button.textContent?.includes('Add Fog')
    );
    const removeAllButton = buttons.find((button) =>
      button.textContent?.includes('Remove all')
    );

    expect(addSteamButton).toBeTruthy();
    expect(addFogButton).toBeTruthy();
    expect(removeAllButton).toBeTruthy();

    await act(async () => {
      addSteamButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      addFogButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      removeAllButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddMissingElement).toHaveBeenNthCalledWith(1, 'Steam');
    expect(onAddMissingElement).toHaveBeenNthCalledWith(2, 'Fog');
    expect(onRemoveUnreachableElements).toHaveBeenCalledWith([
      'Crystal',
      'Mist',
    ]);

    await unmount();
  });

  it('switches the shared meta panel between starters and advanced content', async () => {
    const Harness = () => {
      const [activeTab, setActiveTab] = useState<EditorMetaTab>('starters');

      return (
        <EditorMetaTabsPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          starterCount={3}
          startersContent={<div>starter body</div>}
          advancedContent={<div>advanced body</div>}
        />
      );
    };

    const { container, unmount } = await renderIntoDocument(<Harness />);
    const advancedTab = Array.from(
      container.querySelectorAll('[role="tab"]')
    ).find((node) => node.textContent?.includes('Advanced Options'));

    expect(container.textContent).toContain('starter body');
    expect(container.textContent).not.toContain('advanced body');

    await act(async () => {
      advancedTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('starter body');
    expect(container.textContent).toContain('advanced body');

    await unmount();
  });
});
