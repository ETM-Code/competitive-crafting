import { useEffect, useState } from 'react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallApp({
  open,
  onOpenChange,
}: { open?: boolean; onOpenChange?: (open: boolean) => void } = {}) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const displayMode = matchMedia('(display-mode: standalone)');
    const checkInstalled = () =>
      setInstalled(
        displayMode.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
    checkInstalled();
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const complete = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', complete);
    displayMode.addEventListener('change', checkInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', complete);
      displayMode.removeEventListener('change', checkInstalled);
    };
  }, []);

  async function install() {
    if (!prompt || installing) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setFeedback(
        choice.outcome === 'accepted'
          ? 'Installation requested. Your browser will confirm when it is ready.'
          : 'You can install later from your browser menu.',
      );
    } catch {
      setFeedback('Your browser could not open installation. Use the steps below instead.');
    } finally {
      setPrompt(null);
      setInstalling(false);
    }
  }

  if (installed) return null;
  return (
    <details
      className="install-app"
      data-testid="install-guide"
      name="home-menu"
      open={open}
      onToggle={(event) => onOpenChange?.(event.currentTarget.open)}
    >
      <summary>Add to your home screen</summary>
      {prompt && (
        <button className="button" disabled={installing} onClick={() => void install()}>
          {installing ? 'Opening installation…' : 'Install Competitive Crafting'}
        </button>
      )}
      <p>
        <strong>iPhone / iPad:</strong> open in Safari, tap Share, then Add to Home Screen. Keep
        “Open as Web App” enabled.
      </p>
      <p>
        <strong>Android:</strong> open your browser menu and choose Install app or Add to Home
        screen.
      </p>
      <p>Opens in its own window. An internet connection is needed to play.</p>
      {feedback && <p role="status">{feedback}</p>}
    </details>
  );
}
