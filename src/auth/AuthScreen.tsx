import { useState, type FormEvent, type ReactNode } from 'react';
import { CloudOffIcon, DownloadIcon, XIcon } from '../components/icons';
import { InstallModal } from '../components/InstallModal';
import { useInstall } from '../hooks/useInstall';
import { useOnline } from '../hooks/useOnline';
import { useAuth } from './AuthProvider';

const background = `url('${import.meta.env.BASE_URL}image.jpg') center / cover no-repeat`;

export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center p-6 max-sm:p-4" style={{ background }}>
      <div className="absolute inset-0 bg-[rgb(15_23_42/0.32)] backdrop-blur-[3px]" />
      <div className="relative z-10 w-full max-w-[410px]">{children}</div>
    </div>
  );
}

export function Splash() {
  return (
    <Backdrop>
      <div className="mx-auto flex w-fit items-center gap-3 rounded-[14px] bg-white/92 px-6 py-4 text-sm font-semibold text-[#23231F] shadow-2xl backdrop-blur-md">
        <span className="size-[18px] animate-spin rounded-full border-[2.5px] border-accent border-t-transparent" />
        Loading DoneIt Planner…
      </div>
    </Backdrop>
  );
}

interface AuthScreenProps {
  /** Shown on top of the planner (guest → account, or after a session expired). */
  overlay?: boolean;
  defaultEmail?: string;
  onClose?: () => void;
}

export function AuthScreen({ overlay, defaultEmail = '', onClose }: AuthScreenProps) {
  const { signIn, signUp, continueLocally, cloudAvailable } = useAuth();
  const online = useOnline();
  const install = useInstall();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [installOpen, setInstallOpen] = useState(false);

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError('');
    setMessage('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Please enter your email and password.');
    if (mode === 'signup' && password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    setError('');
    setMessage('');
    if (mode === 'signin') {
      const err = await signIn(email, password);
      setBusy(false);
      if (err) setError(err);
      else onClose?.();
    } else {
      const res = await signUp(name, email, password);
      setBusy(false);
      if (res.error) setError(res.error);
      else if (res.message) {
        setMessage(res.message);
        setMode('signin');
        setPassword('');
      } else onClose?.();
    }
  };

  const tab = (key: 'signin' | 'signup', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === key}
      onClick={() => switchMode(key)}
      className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors ${
        mode === key ? 'bg-white text-[#23231F] shadow-[0_1px_3px_rgb(0_0_0/0.08)]' : 'text-[#7C7C72]'
      }`}
    >
      {label}
    </button>
  );

  const card = (
    <div className="flex flex-col gap-5 rounded-[22px] border border-white/85 bg-white/95 px-7 py-8 text-[#23231F] shadow-[0_24px_60px_rgb(0_0_0/0.22)] backdrop-blur-xl max-sm:px-5 max-sm:py-6 [color-scheme:light]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[22px] font-bold tracking-tight">DoneIt Planner</h1>
          <p className="mt-1 mb-0 text-[13px] text-[#6E6E64]">
            {overlay ? 'Sign in to back up and sync your tasks.' : 'Sign in to access your planner and tasks.'}
          </p>
        </div>
        {overlay ? (
          <button type="button" aria-label="Close" onClick={onClose} className="p-1 text-[#8A8A80] hover:text-[#23231F]">
            <XIcon size={18} />
          </button>
        ) : (
          !install.installed && (
            <button
              type="button"
              onClick={() => setInstallOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-[#E2E2DB] bg-white px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-accent shadow-sm hover:bg-[#EEF1FF]"
            >
              <DownloadIcon size={13} strokeWidth={2.2} /> Install
            </button>
          )
        )}
      </div>

      {!online && (
        <div className="flex items-start gap-2 rounded-[10px] border border-[#F3D58A] bg-[#FFF8E1] px-3 py-2.5 text-[12.5px] leading-snug text-[#7A5A00]" role="status">
          <CloudOffIcon size={15} className="mt-px shrink-0" />
          <span>You're offline. Signing in needs a connection, but you can start planning without an account right now.</span>
        </div>
      )}

      {cloudAvailable && (
        <>
          <div className="flex gap-1 rounded-[10px] bg-[#F4F4F0] p-[3px]" role="tablist">
            {tab('signin', 'Sign in')}
            {tab('signup', 'Create account')}
          </div>

          {error && (
            <div role="alert" className="rounded-[10px] border border-[#F8B4B7] bg-[#FEECEE] px-3 py-2 text-[12.5px] leading-snug text-[#CE2C31]">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="rounded-[10px] border border-[#B0E7C5] bg-[#E6F8ED] px-3 py-2 text-[12.5px] leading-snug text-[#18794E]">
              {message}
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-3.5">
            {mode === 'signup' && (
              <AuthField label="Full name">
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Morgan" autoComplete="name" />
              </AuthField>
            )}
            <AuthField label="Email address">
              <input
                className={inputClass}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
              />
            </AuthField>
            <AuthField label="Password">
              <input
                className={inputClass}
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? 6 : undefined}
              />
            </AuthField>
            <button type="submit" disabled={busy} className="btn btn-primary mt-1.5 py-[11px] text-sm">
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
        </>
      )}

      {!overlay && (
        <div className="flex flex-col items-center gap-1 border-t border-[#EFEFE9] pt-4 text-center">
          <button type="button" onClick={continueLocally} className="text-[13px] font-semibold text-accent hover:underline">
            Continue without an account
          </button>
          <span className="text-[11.5px] text-[#8A8A80]">Tasks stay on this device. You can sign in later to sync them.</span>
        </div>
      )}
    </div>
  );

  return (
    <>
      {overlay ? (
        <div className="fixed inset-0 z-[55] overflow-y-auto">
          <Backdrop>{card}</Backdrop>
        </div>
      ) : (
        <Backdrop>{card}</Backdrop>
      )}
      <InstallModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </>
  );
}

const inputClass =
  'w-full rounded-[10px] border border-[#E2E2DB] bg-white px-3 py-2.5 text-sm text-[#23231F] placeholder:text-[#9A9A90] focus:border-accent focus:ring-[3px] focus:ring-accent/20 focus:outline-none';

function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-[#5C5C54]">{label}</span>
      {children}
    </label>
  );
}
