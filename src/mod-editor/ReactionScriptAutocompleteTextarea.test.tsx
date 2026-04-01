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
});
