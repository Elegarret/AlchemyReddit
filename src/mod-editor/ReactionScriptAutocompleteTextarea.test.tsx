import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReactionScriptAutocompleteTextarea } from './ReactionScriptAutocompleteTextarea';
import { createEmptyDraft } from './draft';

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

const dispatchPasteEvent = (target: HTMLTextAreaElement, text: string) => {
  const pasteEvent = new Event('paste', {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: {
      getData: () => text,
    },
  });
  target.dispatchEvent(pasteEvent);
};

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

  it('renders line numbers for logical reaction-text lines including blanks and a trailing blank line', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    const root = createRoot(container);
    const value = 'starters: Air, Fire\n\nAir+Fire=Steam\n';

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

    expect(
      Array.from(container.querySelectorAll('.editor-code-line-number')).map(
        (node) => node.textContent
      )
    ).toEqual(['1', '2', '3', '4']);

    await act(async () => {
      root.unmount();
    });
  });

  it('marks unknown reaction-text elements with the underline class on the matching line', async () => {
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
          reactionTextIssues={[
            {
              line: 3,
              message: 'Unknown element "Mystery".',
              missingElementName: 'Mystery',
            },
          ]}
          rows={6}
          value={'starters: Air, Fire\n\nAir+Fire=Mystery'}
        />
      );
    });

    const unknownTokens = Array.from(
      container.querySelectorAll('.editor-code-token-unknown')
    );
    expect(unknownTokens.map((node) => node.textContent)).toContain('Mystery');

    const mysteryToken = unknownTokens.find(
      (node) => node.textContent === 'Mystery'
    );
    expect(
      mysteryToken?.closest('.editor-code-line')?.querySelector(
        '.editor-code-line-number'
      )?.textContent
    ).toBe('3');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders one line-number entry per logical line even when a line is long', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    const root = createRoot(container);
    const longLine =
      'starters: Air, Fire, Earth, Water, Amber, Amethyst, Ammonia, Anchor, Anemone, Angel';

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
          value={`${longLine}\nAir+Fire=Steam`}
        />
      );
    });

    expect(container.querySelectorAll('.editor-code-line-number')).toHaveLength(2);
    expect(
      container.querySelectorAll('.editor-code-line-number[data-line-number="1"]')
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('.editor-code-line-number[data-line-number="2"]')
    ).toHaveLength(1);

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

  it('does not auto-commit elements on +, comma, or plain Enter', async () => {
    const onElementCommitted = vi.fn();
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
          onElementCommitted={onElementCommitted}
          placeholder="Type a script"
          rows={4}
          value="add Mystery"
        />
      );
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    await act(async () => {
      textarea!.focus();
      textarea!.setSelectionRange(11, 11);
      textarea!.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: '+' })
      );
      textarea!.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: ',' })
      );
      textarea!.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
      );
    });

    expect(onElementCommitted).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('reports deduped missing element names on script paste', async () => {
    const onPasteMissingElements = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ReactionScriptAutocompleteTextarea
          className="test-textarea"
          counterNames={[]}
          elementNames={['Amber']}
          mode="script"
          onChange={() => undefined}
          onPasteMissingElements={onPasteMissingElements}
          placeholder="Type a script"
          rows={4}
          value="add "
        />
      );
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    await act(async () => {
      textarea!.setSelectionRange(4, 4);
      dispatchPasteEvent(textarea as HTMLTextAreaElement, 'Mystery, Mystery');
    });

    expect(onPasteMissingElements).toHaveBeenCalledWith(['Mystery']);

    await act(async () => {
      root.unmount();
    });
  });

  it('reports deduped missing element names on reaction-text paste', async () => {
    const onPasteMissingElements = vi.fn();
    const value = 'starters: Air, Fire\n\n';
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ReactionScriptAutocompleteTextarea
          className="test-textarea"
          counterNames={[]}
          elementNames={['Air', 'Fire', 'Earth', 'Water']}
          mode="reaction-text"
          onChange={() => undefined}
          onPasteMissingElements={onPasteMissingElements}
          placeholder="Type reactions"
          reactionTextDraft={createEmptyDraft()}
          rows={6}
          value={value}
        />
      );
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    await act(async () => {
      textarea!.setSelectionRange(value.length, value.length);
      dispatchPasteEvent(textarea as HTMLTextAreaElement, '111+222=333');
    });

    expect(onPasteMissingElements).toHaveBeenCalledWith(['111', '222', '333']);

    await act(async () => {
      root.unmount();
    });
  });
});
