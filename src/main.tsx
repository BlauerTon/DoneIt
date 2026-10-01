import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { captureInstallPrompt } from './hooks/useInstall';

captureInstallPrompt();

// The v1 service worker kept its own cache; the new worker manages precaching itself.
if ('caches' in window) {
  void caches
    .keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('doneit-cache-')).map((k) => caches.delete(k))))
    .catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
