import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from '../hooks/useToasts';

/**
 * Registers the service worker. Tells the user once when the app is cached for offline use,
 * and offers a reload when a new version has been downloaded in the background.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Installed apps can stay open for days; check for updates every hour.
      if (registration) setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (offlineReady) toast({ message: 'DoneIt is ready to work offline.', tone: 'success' });
  }, [offlineReady]);

  useEffect(() => {
    if (!needRefresh) return;
    toast({
      message: 'A new version of DoneIt is available.',
      duration: 0,
      action: { label: 'Reload', run: () => void updateServiceWorker(true) },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
