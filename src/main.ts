import './styles/fonts.css';
import './styles/app.css';
import type { ModeId } from './engine/types';

const root = document.querySelector<HTMLElement>('[data-game]');

if (root) {
  const mode = (root.dataset['mode'] as ModeId | undefined) ?? 'gridshot';
  // The scripted test bridge exists only in dev builds, so the shipped bundle
  // exposes no hooks at all.
  const exposeTestApi =
    import.meta.env.DEV && new URLSearchParams(location.search).has('test');
  let booting = false;
  let autoStart = false;

  const boot = async (): Promise<void> => {
    if (booting) return;
    booting = true;
    const { mountGame } = await import('./ui/mount');
    mountGame(root, mode, exposeTestApi, autoStart);
  };

  for (const trigger of document.querySelectorAll<HTMLElement>('[data-play]')) {
    trigger.addEventListener(
      'click',
      () => {
        autoStart = true;
        void boot();
      },
      { once: true },
    );
  }

  if (exposeTestApi) {
    void boot();
  }
}
