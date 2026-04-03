import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModEditorApp } from './ModEditorApp';

const { getEditorSettingsQueryMock, listMineQueryMock } = vi.hoisted(() => ({
  getEditorSettingsQueryMock: vi.fn().mockResolvedValue({
    authorsHelpPageUrl: null,
    scriptingHelpPageUrl: null,
  }),
  listMineQueryMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('@devvit/web/client', () => ({
  navigateTo: vi.fn(),
  showShareSheet: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../trpc', () => ({
  trpc: {
    mods: {
      getEditorSettings: {
        query: getEditorSettingsQueryMock,
      },
      listMine: {
        query: listMineQueryMock,
      },
    },
  },
}));

vi.mock('../webview-navigation', () => ({
  getEditorTargetModId: vi.fn(() => null),
  openEntry: vi.fn(),
  setEditorTargetModId: vi.fn(),
}));

vi.mock('./components', () => ({
  CompactElementTile: () => <div data-testid="compact-element-tile" />,
  DroppableInput: ({
    className,
    onChange,
    placeholder,
    value,
  }: {
    className?: string;
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
  }) => (
    <input
      className={className}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  ),
  DualColorPicker: () => <div data-testid="dual-color-picker" />,
  ElementAdvancedButton: () => <button type="button">Advanced</button>,
  ElementPreview: () => <div data-testid="element-preview" />,
  ReactionWidget: () => <div data-testid="reaction-widget" />,
}));

vi.mock('./ReactionScriptAutocompleteTextarea', () => ({
  ReactionScriptAutocompleteTextarea: ({
    onChange,
    reactionTextIssues,
  }: {
    onChange: (value: string) => void;
    reactionTextIssues?: Array<{ line: number; message: string }>;
  }) => (
    <div data-testid="reaction-text-editor">
      <button
        type="button"
        onClick={() => onChange('starters: Air, Fire, Mystery\n\nAir+Fire=Water')}
      >
        Inject Invalid Reaction Text
      </button>
      <div data-testid="reaction-text-issues">
        Issue count: {reactionTextIssues?.length ?? 0}
      </div>
    </div>
  ),
}));

const renderApp = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(container);

  await act(async () => {
    root.render(<ModEditorApp />);
  });

  await act(async () => {
    await Promise.resolve();
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

afterEach(() => {
  document.body.innerHTML = '';
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  listMineQueryMock.mockReset();
  listMineQueryMock.mockResolvedValue([]);
  getEditorSettingsQueryMock.mockReset();
  getEditorSettingsQueryMock.mockResolvedValue({
    authorsHelpPageUrl: null,
    scriptingHelpPageUrl: null,
  });
});

describe('ModEditorApp', () => {
  it('shows reaction-text errors in the validation header without rendering duplicate inline error cards', async () => {
    const { container, unmount } = await renderApp();

    const textEditorButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Text Editor')
    );
    expect(textEditorButton).toBeTruthy();

    await act(async () => {
      textEditorButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const injectInvalidButton = Array.from(
      container.querySelectorAll('button')
    ).find((button) =>
      button.textContent?.includes('Inject Invalid Reaction Text')
    );
    expect(injectInvalidButton).toBeTruthy();

    await act(async () => {
      injectInvalidButton?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(container.textContent).toContain('Validation:');
    expect(container.textContent).toContain('Issue count: 1');
    expect(container.querySelectorAll('.editor-validation-error')).toHaveLength(0);

    await unmount();
  });
});
