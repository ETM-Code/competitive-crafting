import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/game.css';
import './styles/mobile.css';
import './styles/shell.css';
import './styles/screens.css';

// Safari's keyboard can resize the visual viewport without resizing the layout viewport.
// Keep browser zoom available; only follow the keyboard / toolbar at normal scale.
function updateViewport() {
  const viewport = window.visualViewport;
  if (!viewport || Math.abs(viewport.scale - 1) < 0.01) {
    document.documentElement.style.setProperty(
      '--viewport-height',
      `${viewport?.height ?? window.innerHeight}px`,
    );
  }
}
updateViewport();
window.visualViewport?.addEventListener('resize', updateViewport);
window.addEventListener('resize', updateViewport);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    window.visualViewport?.removeEventListener('resize', updateViewport);
    window.removeEventListener('resize', updateViewport);
  });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installation support is optional; live play must still work without it.
    });
  });
}
// Vite removes this import branch and the fixture module from production builds.
const Lab =
  import.meta.env.DEV && location.pathname === '/__lab'
    ? lazy(() => import('./components/AnimationLab'))
    : null;
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {Lab ? (
      <Suspense fallback={<p>Loading animation lab…</p>}>
        <Lab />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
