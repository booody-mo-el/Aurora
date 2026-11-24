import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
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
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const updateSwRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          setUpdateAvailable(true);
        },
        onRegisterError(error) {
          console.warn('Aurora service worker registration failed:', error);
        }
      });
      updateSwRef.current = updateSW;
    } catch {
      // SW unavailable in this context
    }

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    let timer = 0;
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

    if (!isInstalled()) {
      const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedUntil <= Date.now()) {
        timer = window.setTimeout(() => setVisible(true), 2200);
      }
      window.addEventListener('beforeinstallprompt', onBeforeInstall);
      window.addEventListener('appinstalled', onInstalled);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
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
      setHelpOpen(prev => !prev);
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

  return (
    <>
      {!isOnline && (
        <div className="aurora-status-pill offline" role="status" aria-live="polite">
          <span className="aurora-status-dot" />
          Offline Mode — Cached app shell active
        </div>
      )}

      {updateAvailable && (
        <aside className="aurora-update-banner" role="status" aria-live="polite">
          <div>
            <strong>Update available</strong>
            <span>A new version of Aurora is ready.</span>
          </div>
          <div className="aurora-update-actions">
            <button
              type="button"
              className="aurora-update-btn"
              onClick={() => updateSwRef.current?.(true)}
            >
              Reload
            </button>
            <button
              type="button"
              className="aurora-install-close"
              aria-label="Dismiss update notification"
              onClick={() => setUpdateAvailable(false)}
            >
              ×
            </button>
          </div>
        </aside>
      )}

      {visible && (
        <aside className="aurora-install-banner" aria-label="Install Aurora">
          <img className="aurora-install-icon" src="/pwa-192x192.png" alt="" />
          <div className="aurora-install-copy">
            <strong>Install Aurora</strong>
            <span>Get the app on your device</span>
            {helpOpen && (
              <small>
                Open your browser menu (or Share on iOS Safari) and choose “Install app” or “Add to Home Screen”.
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
      )}
    </>
  );
}
