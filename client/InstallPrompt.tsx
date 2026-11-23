import { useEffect, useState } from 'react';
import './install-prompt.css';

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const DISMISS_KEY = 'aurora-install-dismissed-until';

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('Aurora service worker registration failed:', error);
      });
    }

    if (isInstalled()) return;

    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedUntil > Date.now()) return;

    const timer = window.setTimeout(() => setVisible(true), 1800);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      setHelpOpen(false);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setVisible(false);
    setHelpOpen(false);
  };

  const install = async () => {
    if (!installEvent) {
      setHelpOpen(true);
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === 'accepted') {
      setVisible(false);
      setHelpOpen(false);
    }
  };

  if (!visible) return null;

  return (
    <aside className="aurora-install-banner" aria-label="Install Aurora">
      <img className="aurora-install-icon" src="/aurora-mark.svg" alt="" />
      <div className="aurora-install-copy">
        <strong>Install Aurora</strong>
        <span>Get the app on your device</span>
        {helpOpen && (
          <small>
            Open your browser menu and choose “Install app” or “Add to Home Screen”.
          </small>
        )}
      </div>
      <button className="aurora-install-action" type="button" onClick={install}>
        Install
      </button>
      <button className="aurora-install-close" type="button" onClick={dismiss} aria-label="Close install message">
        ×
      </button>
    </aside>
  );
}
