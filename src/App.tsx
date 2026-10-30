import { useState } from 'react';
import { Planner } from './app/Planner';
import { useAuth } from './auth/AuthProvider';
import { AuthScreen, ResetPasswordScreen, Splash } from './auth/AuthScreen';
import { Toaster } from './components/Toaster';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useApplyTheme } from './hooks/useSettings';
import { useSyncEngine } from './sync/useSyncEngine';

export function App() {
  useApplyTheme();
  const { status, profile } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  useSyncEngine(status === 'signedIn' ? profile : null);

  return (
    <>
      {status === 'loading' && <Splash />}
      {status === 'signedOut' && <AuthScreen />}
      {status === 'recovery' && <ResetPasswordScreen />}
      {status === 'signedIn' && profile && (
        <>
          <Planner key={profile.id} profile={profile} onRequestSignIn={() => setSignInOpen(true)} />
          {signInOpen && <AuthScreen overlay defaultEmail={profile.email} onClose={() => setSignInOpen(false)} />}
        </>
      )}
      <UpdatePrompt />
      <Toaster />
    </>
  );
}
