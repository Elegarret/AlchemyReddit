import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownBody } from './MarkdownBody';

const renderMarkdown = async (markdown: string) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(container);

  await act(async () => {
    root.render(<MarkdownBody markdown={markdown} />);
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
});

describe('MarkdownBody', () => {
  it('renders markdown emphasis and visible line breaks', async () => {
    const view = await renderMarkdown('Hello **realm**\nsecond line');

    expect(view.container.querySelector('strong')?.textContent).toBe('realm');
    expect(view.container.querySelector('br')).toBeTruthy();

    await view.unmount();
  });

  it('skips raw html tags', async () => {
    const view = await renderMarkdown('Safe<script>alert(1)</script> text');

    expect(view.container.querySelector('script')).toBeNull();
    expect(view.container.textContent).toContain('Safe');
    expect(view.container.textContent).toContain('text');

    await view.unmount();
  });
});
