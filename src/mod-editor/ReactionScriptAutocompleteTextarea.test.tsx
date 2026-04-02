import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReactionScriptAutocompleteTextarea } from './ReactionScriptAutocompleteTextarea';

const elementNames = [
  'Amber',
  'Amethyst',
  'Ammonia',
  'Anchor',
  'Anemone',
  'Angel',
  'Antler',
  'Anvil',
  'Apex',
  'Apple',
];

describe('ReactionScriptAutocompleteTextarea', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
    vi.restoreAllMocks();
  });

  it('renders the full suggestion list instead of truncating to eight items', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });

    const root = createRoot(container);
    const Harness = () => {
      const [value, setValue] = useState('add ');

      return (
        <ReactionScriptAutocompleteTextarea
          className="test-textarea"
          counterNames={[]}
          elementNames={elementNames}
          mode="script"
          onChange={setValue}
          placeholder="Type a script"
          rows={4}
          value={value}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    await act(async () => {
      textarea!.focus();
      textarea!.setSelectionRange(4, 4);
      textarea!.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'A',
        })
      );

      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      valueSetter?.call(textarea, 'add A');
      textarea!.setSelectionRange(5, 5);
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const suggestionButtons = Array.from(document.body.querySelectorAll('button'));
    const renderedLabels = suggestionButtons
      .map((button) => button.querySelector('span')?.textContent ?? '')
      .filter((label) => elementNames.includes(label));

    expect(renderedLabels).toEqual(elementNames);

    await act(async () => {
      root.unmount();
    });
  });

  it('beautifies script mode content on blur when enabled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    const root = createRoot(container);
    const Harness = () => {
      const [value, setValue] = useState(' add  Amber,Apple ');

      return (
        <ReactionScriptAutocompleteTextarea
          beautifyOnBlur={true}
          className="test-textarea"
          counterNames={[]}
          elementNames={elementNames}
          mode="script"
          onChange={setValue}
          placeholder="Type a script"
          rows={4}
          value={value}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    await act(async () => {
      textarea!.focus();
      textarea!.blur();
    });

    expect((textarea as HTMLTextAreaElement).value).toBe('add Amber, Apple');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders highlighted tokens for keywords, elements, symbols, and comments', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ReactionScriptAutocompleteTextarea
          className="test-textarea"
          counterNames={[]}
          elementNames={elementNames}
          mode="script"
          onChange={() => undefined}
          placeholder="Type a script"
          rows={4}
          value={'add Amber = Apple // note'}
        />
      );
    });

    expect(
      Array.from(container.querySelectorAll('.editor-code-token-keyword')).map(
        (node) => node.textContent
      )
    ).toContain('add');
    expect(
      Array.from(container.querySelectorAll('.editor-code-token-element')).map(
        (node) => node.textContent
      )
    ).toEqual(expect.arrayContaining(['Amber', 'Apple']));
    expect(
      Array.from(container.querySelectorAll('.editor-code-token-symbol')).map(
        (node) => node.textContent
      )
    ).toContain('=');
    expect(
      Array.from(container.querySelectorAll('.editor-code-token-comment')).map(
        (node) => node.textContent
      )
    ).toContain('// note');

    await act(async () => {
      root.unmount();
    });
  });

  it('highlights declaration keys as keywords in reaction-text mode', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ReactionScriptAutocompleteTextarea
          className="test-textarea"
          counterNames={[]}
          elementNames={elementNames}
          mode="reaction-text"
          onChange={() => undefined}
          placeholder="Type reactions"
          rows={6}
          value={
            'starters: Air, Fire\ncounters: Health initial=1\nnonconsumables: Furnace'
          }
        />
      );
    });

    expect(
      Array.from(container.querySelectorAll('.editor-code-token-keyword')).map(
        (node) => node.textContent
      )
    ).toEqual(expect.arrayContaining(['starters', 'counters', 'nonconsumables']));

    await act(async () => {
      root.unmount();
    });
  });

  it('preserves a trailing blank line in the highlight layer', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    const root = createRoot(container);
    const value = 'starters: Air, Fire\n';

    await act(async () => {
      root.render(
        <ReactionScriptAutocompleteTextarea
          className="test-textarea"
          counterNames={[]}
          elementNames={elementNames}
          mode="reaction-text"
          onChange={() => undefined}
          placeholder="Type reactions"
          rows={6}
          value={value}
        />
      );
    });

    const pre = container.querySelector('pre');
    expect(pre?.textContent).toBe(`${value}\u200b`);

    await act(async () => {
      root.unmount();
    });
  });

  it('does not open autocomplete when the caret is inside a comment', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    const root = createRoot(container);
    const Harness = () => {
      const [value, setValue] = useState('add Amber // note');

      return (
        <ReactionScriptAutocompleteTextarea
          className="test-textarea"
          counterNames={[]}
          elementNames={elementNames}
          mode="script"
          onChange={setValue}
          placeholder="Type a script"
          rows={4}
          value={value}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    await act(async () => {
      textarea!.focus();
      textarea!.setSelectionRange(13, 13);
      textarea!.dispatchEvent(new Event('select', { bubbles: true }));
    });

    const suggestionLabels = Array.from(document.body.querySelectorAll('button'))
      .map((button) => button.querySelector('span')?.textContent ?? '')
      .filter((label) => elementNames.includes(label));

    expect(suggestionLabels).toEqual([]);

    await act(async () => {
      root.unmount();
    });
  });
});
