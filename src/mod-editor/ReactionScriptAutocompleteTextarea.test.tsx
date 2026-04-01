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

  it('renders highlighted tokens for keywords, elements, and symbols', async () => {
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
          value={'add Amber = Apple'}
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

    await act(async () => {
      root.unmount();
    });
  });
});
