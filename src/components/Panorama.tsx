import { useEffect, useRef, useState } from 'react';
import 'pannellum/build/pannellum.css';
import '../styles/panorama.css';

type Viewer = {
  on(event: 'load' | 'error', callback: () => void): Viewer;
  startAutoRotate(speed: number, pitch?: number): Viewer;
  stopAutoRotate(): Viewer;
  stopMovement(): void;
  setHfov(degrees: number, animation: false): Viewer;
  resize(): Viewer;
  destroy(): void;
};

declare global {
  interface Window {
    pannellum?: {
      viewer(container: HTMLElement, options: Record<string, unknown>): Viewer;
    };
  }
}

const faces = [0, 1, 2, 3, 4, 5].map((face) => `/assets/panorama-${face}.png`);
const rotationSpeed = -0.8;

/** The actual Minecraft title cubemap, rendered locally; never a gameplay input surface. */
export function Panorama({ active }: { active: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element || !active || reducedMotion) return;
    let cancelled = false;
    let viewer: Viewer | undefined;
    let observer: ResizeObserver | undefined;
    let loaded = false;
    const fieldOfView = () => (element.clientWidth < 600 ? 60 : 90);
    const resize = () => {
      if (!loaded) return;
      viewer?.resize();
      viewer?.setHfov(fieldOfView(), false);
    };
    const visibility = () => {
      if (!loaded) return;
      if (document.hidden) {
        viewer?.stopAutoRotate();
        viewer?.stopMovement();
        element.dataset.motion = 'paused';
      } else {
        viewer?.startAutoRotate(rotationSpeed, 2);
        viewer?.setHfov(fieldOfView(), false);
        element.dataset.motion = 'rotating';
      }
    };
    document.addEventListener('visibilitychange', visibility);
    window.visualViewport?.addEventListener('resize', resize);
    element.dataset.motion = 'loading';

    void import('pannellum')
      .then(() => {
        if (cancelled || !window.pannellum) return;
        viewer = window.pannellum.viewer(element, {
          type: 'cubemap',
          cubeMap: faces,
          autoLoad: true,
          autoRotate: false,
          yaw: -92,
          pitch: 2,
          hfov: fieldOfView(),
          minHfov: 60,
          maxHfov: 90,
          showControls: false,
          showFullscreenCtrl: false,
          showZoomCtrl: false,
          showLoading: false,
          compass: false,
          draggable: false,
          mouseZoom: false,
          keyboardZoom: false,
          doubleClickZoom: false,
          disableKeyboardCtrl: true,
          capturedKeyNumbers: [],
          orientationOnByDefault: false,
        });
        viewer.on('load', () => {
          if (cancelled) return;
          loaded = true;
          setReady(true);
          visibility();
          observer = new ResizeObserver(resize);
          observer.observe(element);
        });
        viewer.on('error', () => {
          if (cancelled) return;
          loaded = false;
          setReady(false);
          element.dataset.motion = 'fallback';
        });
      })
      .catch(() => {
        if (!cancelled) element.dataset.motion = 'fallback';
        // A blocked renderer must never block the menu; the native still remains underneath.
      });

    return () => {
      cancelled = true;
      setReady(false);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.visualViewport?.removeEventListener('resize', resize);
      viewer?.stopAutoRotate();
      viewer?.stopMovement();
      viewer?.destroy();
      delete element.dataset.motion;
    };
  }, [active, reducedMotion]);

  return (
    <div className="world-backdrop panorama-world" aria-hidden="true" inert>
      <div
        ref={container}
        className={`panorama-viewer ${ready && active && !reducedMotion ? 'is-ready' : ''}`}
        data-testid="panorama"
      />
    </div>
  );
}
