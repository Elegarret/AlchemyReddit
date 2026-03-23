import { afterEach, describe, expect, it, vi } from 'vitest';

let requestExpandedModeMock: ReturnType<typeof vi.fn>;
let initGetQueryMock: ReturnType<typeof vi.fn>;

vi.mock('@devvit/web/client', () => {
  requestExpandedModeMock = vi.fn();

  return {
    requestExpandedMode: requestExpandedModeMock,
  };
});

vi.mock('./trpc', () => {
  initGetQueryMock = vi.fn().mockResolvedValue({ redditDiscovered: [] });

  return {
    trpc: {
      init: {
        get: {
          query: initGetQueryMock,
        },
      },
    },
  };
});

afterEach(() => {
  requestExpandedModeMock?.mockReset();
  initGetQueryMock?.mockReset();
  initGetQueryMock?.mockResolvedValue({ redditDiscovered: [] });
  vi.resetModules();
});

describe('Splash', () => {
  it('opens the game entrypoint from the primary CTA', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });

    await import('./splash');
    await new Promise((r) => setTimeout(r, 0));

    const playButton = Array.from(document.querySelectorAll('button')).find(
      (b) => /play|continue discovery/i.test(b.textContent ?? '')
    );
    expect(playButton).toBeTruthy();

    playButton!.click();

    expect(requestExpandedModeMock).toHaveBeenCalledTimes(1);
    expect(requestExpandedModeMock.mock.calls[0]?.[1]).toBe('game');
  });

  it('opens the mod editor entrypoint from the secondary CTA', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });

    await import('./splash');
    await new Promise((r) => setTimeout(r, 0));

    const createModButton = Array.from(document.querySelectorAll('button')).find(
      (b) => /create a mod/i.test(b.textContent ?? '')
    );
    expect(createModButton).toBeTruthy();

    createModButton!.click();

    expect(requestExpandedModeMock).toHaveBeenCalledTimes(1);
    expect(requestExpandedModeMock.mock.calls[0]?.[1]).toBe('mod-editor');
  });
});
