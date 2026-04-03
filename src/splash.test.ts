import { afterEach, describe, expect, it, vi } from 'vitest';

const requestExpandedModeMock = vi.fn();
const initGetQueryMock = vi.fn().mockResolvedValue({ redditDiscovered: [] });

vi.mock('@devvit/web/client', () => {
  return {
    requestExpandedMode: requestExpandedModeMock,
  };
});

vi.mock('./trpc', () => {
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
  window.sessionStorage.clear();
  vi.resetModules();
});

describe('Splash', () => {
  it('restores cached progress before the remote request completes', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    window.history.replaceState({}, '', '/src/splash.html?token=splash');
    window.sessionStorage.setItem(
      'alchemy:inline-view:splash-progress:/src/splash.html?token=splash',
      JSON.stringify({ discovered: 12, total: 40 })
    );
    initGetQueryMock.mockImplementation(() => new Promise(() => {}));

    await import('./splash');
    await new Promise((r) => setTimeout(r, 0));

    expect(document.body.textContent).toContain('Progress: 12/40');
  });

  it('renders the tagline with the body font styling', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    window.history.replaceState({}, '', '/src/splash.html');

    await import('./splash');
    await new Promise((r) => setTimeout(r, 0));

    const tagline = Array.from(document.querySelectorAll('p')).find((element) =>
      /combine elements to discover the world/i.test(element.textContent ?? '')
    );
    expect(tagline).toBeTruthy();
    expect(tagline?.className).toContain('catalog-body-font');
  });

  it('opens the game entrypoint from the primary CTA', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    window.history.replaceState({}, '', '/src/splash.html');

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

  it('keeps the primary CTA label on one line with a stable height', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    window.history.replaceState({}, '', '/src/splash.html');
    window.sessionStorage.setItem(
      'alchemy:inline-view:splash-progress:/src/splash.html',
      JSON.stringify({ discovered: 12, total: 40 })
    );

    await import('./splash');
    await new Promise((r) => setTimeout(r, 0));

    const playButton = Array.from(document.querySelectorAll('button')).find((b) =>
      /continue discovery/i.test(b.textContent ?? '')
    );
    expect(playButton).toBeTruthy();
    expect(playButton?.className).toContain('whitespace-nowrap');
    expect(playButton?.className).toContain('min-h-16');
  });

  it('opens the mod catalog entrypoint from the secondary CTA', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.assign(globalThis, { __BUILD_NUMBER__: 'test-build' });
    window.history.replaceState({}, '', '/src/splash.html');

    await import('./splash');
    await new Promise((r) => setTimeout(r, 0));

    const hubButton = Array.from(document.querySelectorAll('button')).find(
      (b) => /alchemy hub/i.test(b.textContent ?? '')
    );
    expect(hubButton).toBeTruthy();

    hubButton!.click();

    expect(requestExpandedModeMock).toHaveBeenCalledTimes(1);
    expect(requestExpandedModeMock.mock.calls[0]?.[1]).toBe('mod-catalog');
  });
});
