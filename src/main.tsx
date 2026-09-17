import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/game.css';
import './styles/mobile.css';
import './styles/shell.css';
import './styles/screens.css';

// Safari's keyboard can resize the visual viewport without resizing the layout viewport.
// Keep browser zoom available; only follow the keyboard / toolbar at normal scale.
let restingHeight = window.innerHeight;
let restingWidth = window.innerWidth;
function updateViewport() {
  const viewport = window.visualViewport;
  if (viewport && Math.abs(viewport.scale - 1) >= 0.01) return;
  const root = document.documentElement;
  const height = viewport?.height ?? window.innerHeight;
  const editable = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
  if (Math.abs(window.innerWidth - restingWidth) > 80) {
    restingWidth = window.innerWidth;
    restingHeight = window.innerHeight;
  }
  if (!editable) restingHeight = Math.max(height, window.innerHeight);
  const keyboard = !!editable && Math.max(restingHeight, window.innerHeight) - height > 120;
  root.style.setProperty('--viewport-height', `${height}px`);
  root.style.setProperty('--viewport-offset-top', `${viewport?.offsetTop ?? 0}px`);
  const keyboardState = String(keyboard);
  if (root.dataset.keyboardOpen !== keyboardState) root.dataset.keyboardOpen = keyboardState;
}
function afterFocusChange() {
  requestAnimationFrame(updateViewport);
}
updateViewport();
window.visualViewport?.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('scroll', updateViewport);
window.addEventListener('resize', updateViewport);
document.addEventListener('focusin', afterFocusChange);
document.addEventListener('focusout', afterFocusChange);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    window.visualViewport?.removeEventListener('resize', updateViewport);
    window.visualViewport?.removeEventListener('scroll', updateViewport);
    window.removeEventListener('resize', updateViewport);
    document.removeEventListener('focusin', afterFocusChange);
    document.removeEventListener('focusout', afterFocusChange);
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
