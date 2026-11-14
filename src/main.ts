import './styles/fonts.css';
import './styles/app.css';
import type { ModeId } from './engine/types';

const root = document.querySelector<HTMLElement>('[data-game]');
const demo = document.querySelector<HTMLElement>('[data-demo]');

// The scripted test bridge exists only in dev builds, so the shipped bundle
// exposes no hooks at all.
const exposeTestApi = import.meta.env.DEV && new URLSearchParams(location.search).has('test');

function boot(element: HTMLElement, autoStart: boolean): void {
  const mode = (element.dataset['mode'] as ModeId | undefined) ?? 'gridshot';
  const start = (): void => {
    void (async () => {
      const { mountGame } = await import('./ui/mount');
      mountGame(element, mode, exposeTestApi, autoStart);
    })();
  };
  start();
}

if (demo) {
  // The landing page boots on its own: visitors should meet a live field with
  // targets on it, not a poster. The field is a demo until they press Start.
  boot(demo, false);
} else if (root) {
  let booting = false;
  let autoStart = false;

  const start = (): void => {
    if (booting) return;
    booting = true;
    void (async () => {
      const { mountGame } = await import('./ui/mount');
      mountGame(root, (root.dataset['mode'] as ModeId | undefined) ?? 'gridshot', exposeTestApi, autoStart);
    })();
  };

  for (const trigger of document.querySelectorAll<HTMLElement>('[data-play]')) {
    trigger.addEventListener(
      'click',
      () => {
        autoStart = true;
        start();
      },
      { once: true },
    );
  }

  if (exposeTestApi) start();
}
