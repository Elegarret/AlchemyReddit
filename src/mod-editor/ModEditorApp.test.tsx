import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModEditorApp } from './ModEditorApp';

const {
  getEditorSettingsQueryMock,
  listMineQueryMock,
  uploadElementIconMutateMock,
  uploadRealmCoverMutateMock,
  normalizeElementIconFileMock,
  normalizeRealmCoverFileMock,
} = vi.hoisted(() => ({
  getEditorSettingsQueryMock: vi.fn().mockResolvedValue({
    authorsHelpPageUrl: null,
    scriptingHelpPageUrl: null,
  }),
  listMineQueryMock: vi.fn().mockResolvedValue([]),
  uploadElementIconMutateMock: vi.fn().mockResolvedValue({
    url: 'https://i.redd.it/test-icon.png',
  }),
  uploadRealmCoverMutateMock: vi.fn().mockResolvedValue({
    url: 'https://i.redd.it/test-cover.png',
  }),
  normalizeElementIconFileMock: vi
    .fn()
    .mockResolvedValue('data:image/png;base64,icon'),
  normalizeRealmCoverFileMock: vi
    .fn()
    .mockResolvedValue('data:image/png;base64,cover'),
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
      uploadElementIcon: {
        mutate: uploadElementIconMutateMock,
      },
      uploadRealmCover: {
        mutate: uploadRealmCoverMutateMock,
      },
    },
  },
}));

vi.mock('./images', () => ({
  normalizeElementIconFile: normalizeElementIconFileMock,
  normalizeRealmCoverFile: normalizeRealmCoverFileMock,
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

const waitFor = async (predicate: () => boolean, timeoutMs: number = 500) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for test condition');
};

const updateInputValue = async (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
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
  uploadElementIconMutateMock.mockReset();
  uploadElementIconMutateMock.mockResolvedValue({
    url: 'https://i.redd.it/test-icon.png',
  });
  uploadRealmCoverMutateMock.mockReset();
  uploadRealmCoverMutateMock.mockResolvedValue({
    url: 'https://i.redd.it/test-cover.png',
  });
  normalizeElementIconFileMock.mockReset();
  normalizeElementIconFileMock.mockResolvedValue('data:image/png;base64,icon');
  normalizeRealmCoverFileMock.mockReset();
  normalizeRealmCoverFileMock.mockResolvedValue('data:image/png;base64,cover');
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

  it('shows inline validation when pasted import JSON is invalid', async () => {
    const { container, unmount } = await renderApp();

    const moreButton = container.querySelector(
      'button[aria-label="More realm actions"]'
    );
    expect(moreButton).toBeTruthy();

    await act(async () => {
      moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const importButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Import JSON')
    );
    expect(importButton).toBeTruthy();

    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const importTextarea = container.querySelector(
      'textarea[aria-label="Import realm JSON"]'
    );
    expect(importTextarea).toBeTruthy();

    await act(async () => {
      if (importTextarea instanceof HTMLTextAreaElement) {
        importTextarea.value = '{invalid';
        importTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Import'
    );
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Import failed: invalid JSON.');

    await unmount();
  });

  it('uploads and clears a realm cover image from the realm info panel', async () => {
    const { container, unmount } = await renderApp();
    const file = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' });
    const uploadInput = container.querySelector(
      'input[aria-label="Upload realm cover image"]'
    );
    expect(uploadInput).toBeTruthy();

    await act(async () => {
      if (uploadInput instanceof HTMLInputElement) {
        Object.defineProperty(uploadInput, 'files', {
          configurable: true,
          value: [file],
        });
        uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await waitFor(() => uploadRealmCoverMutateMock.mock.calls.length === 1);

    expect(normalizeRealmCoverFileMock).toHaveBeenCalledWith(file);
    expect(uploadRealmCoverMutateMock).toHaveBeenCalledWith(
      'data:image/png;base64,cover'
    );
    expect(container.innerHTML).toContain('https://i.redd.it/test-cover.png');

    const clearButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Clear')
    );
    expect(clearButton).toBeTruthy();

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.innerHTML).not.toContain('https://i.redd.it/test-cover.png');
    expect(container.textContent).toContain('Realm Cover');

    await unmount();
  });

  it('shows compact elements in advanced realm options', async () => {
    const { container, unmount } = await renderApp();

    const advancedTab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Advanced Options')
    );
    expect(advancedTab).toBeTruthy();

    await act(async () => {
      advancedTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('compact elements');

    await unmount();
  });

  it('adds and removes non-consumables in advanced realm options', async () => {
    const { container, unmount } = await renderApp();

    const advancedTab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Advanced Options')
    );
    expect(advancedTab).toBeTruthy();

    await act(async () => {
      advancedTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="Add non-consumable"]'
    );
    expect(input).toBeTruthy();

    if (!input) {
      throw new Error('Missing non-consumable input');
    }

    await updateInputValue(input, 'Furnace');

    const addButton = input.nextElementSibling;
    expect(addButton).toBeTruthy();

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Non-consumables (1)');
    expect(container.textContent).toContain('Furnace');

    const removeButton = container.querySelector(
      '.editor-non-consumable-remove'
    );
    expect(removeButton).toBeTruthy();

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Non-consumables (0)');
    expect(container.textContent).not.toContain('Furnace');

    await unmount();
  });
});
