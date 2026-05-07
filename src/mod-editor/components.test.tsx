import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ReactionWidget } from './components';
import { createStarterElement } from './draft';

describe('ReactionWidget', () => {
  it('validates local reaction scripts with full-text functions', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(container);
    const elements = [
      createStarterElement('air', 'Air'),
      createStarterElement('water', 'Water'),
      createStarterElement('storm', 'Storm'),
    ];

    await act(async () => {
      root.render(
        <ReactionWidget
          counterElementIds={[]}
          counterNames={[]}
          elements={elements}
          functions={[
            {
              name: 'Reward',
              script: 'add Storm',
            },
          ]}
          index={0}
          onAddMissingElement={() => undefined}
          onCommit={() => undefined}
          onDelete={() => undefined}
          onMoveReaction={() => undefined}
          onOpenScriptingHelp={() => undefined}
          onPasteMissingElements={() => undefined}
          onUpdateScript={() => undefined}
          reaction={{
            leftId: 'air',
            rightId: 'water',
            outputIds: [],
            script: 'call Reward',
          }}
          scriptingHelpPageUrl={null}
        />
      );
    });

    const scriptButton = container.querySelector('button[title="Edit scripted override"]');
    expect(scriptButton).toBeTruthy();

    await act(async () => {
      scriptButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('Unknown function "Reward".');

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
