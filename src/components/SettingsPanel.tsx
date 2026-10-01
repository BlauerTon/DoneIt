import { useState } from 'react';
import { usePlanner } from '../app/PlannerContext';
import { initials } from '../auth/profile';
import { useInstall } from '../hooks/useInstall';
import { updateSettings, useSettings, type ThemeSetting } from '../hooks/useSettings';
import { toast } from '../hooks/useToasts';
import { REMINDER_OPTIONS } from '../lib/reminders';
import { disableNotifications, enableNotifications, notificationPermission, pushAvailable } from '../reminders/push';
import { BellIcon, DownloadIcon, KeyboardIcon, LogoutIcon, MonitorIcon, MoonIcon, SunIcon } from './icons';
import { SyncIndicator } from './SyncIndicator';

interface SettingsPanelProps {
  onInstall: () => void;
  onSignOut: () => void;
  onSignIn: () => void;
  onShortcuts?: () => void;
  size?: 'sm' | 'md';
}

export function SettingsPanel({ onInstall, onSignOut, onSignIn, onShortcuts, size = 'sm' }: SettingsPanelProps) {
  const { profile } = usePlanner();
  const settings = useSettings();
  const install = useInstall();
  const local = profile.kind === 'local';
  const md = size === 'md';

  return (
    <div className="flex flex-col gap-2.5">
      <div className={`flex items-center gap-2.5 rounded-[10px] border border-line bg-card ${md ? 'p-3' : 'px-3 py-2.5'}`}>
        <div
          className={`flex shrink-0 items-center justify-center rounded-full bg-avatar font-bold text-avatar-ink ${
            md ? 'size-10 text-sm' : 'size-8 text-[11.5px]'
          }`}
        >
          {local ? 'ME' : initials(profile.name, profile.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate font-semibold text-ink ${md ? 'text-sm' : 'text-[13px]'}`}>
            {local ? 'Guest' : profile.name}
          </div>
          <div className="truncate text-[11px] text-muted">{local ? 'Not signed in' : profile.email}</div>
        </div>
      </div>

      <SyncIndicator userId={profile.id} onSignIn={onSignIn} />

      <Row label="Theme" stack={!md}>
        <Segmented<ThemeSetting>
          value={settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            { value: 'light', label: 'Light', icon: <SunIcon size={13} /> },
            { value: 'dark', label: 'Dark', icon: <MoonIcon size={13} /> },
            { value: 'system', label: 'Auto', icon: <MonitorIcon size={13} /> },
          ]}
        />
      </Row>

      <Row label="Timeline">
        <Segmented
          value={settings.density}
          onChange={(density) => updateSettings({ density })}
          options={[
            { value: 'comfortable', label: 'Roomy' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </Row>

      <RemindersSection local={local} />

      <Row label="Show completed">
        <Switch checked={settings.showCompleted} onChange={(showCompleted) => updateSettings({ showCompleted })} label="Show completed tasks" />
      </Row>

      {!install.installed && (
        <button type="button" onClick={onInstall} className={`btn btn-ghost w-full justify-start ${md ? 'py-3' : 'text-xs'}`}>
          <DownloadIcon size={14} strokeWidth={2.2} />
          <span>{md ? 'Download & install DoneIt' : 'Download app'}</span>
        </button>
      )}

      {onShortcuts && (
        <button type="button" onClick={onShortcuts} className="btn btn-ghost w-full justify-start text-xs max-md:hidden">
          <KeyboardIcon size={14} />
          <span>Keyboard shortcuts</span>
        </button>
      )}

      <button
        type="button"
        onClick={onSignOut}
        className={`btn w-full border border-danger-line bg-danger-bg text-danger hover:opacity-90 ${md ? 'py-3' : 'text-[12.5px]'}`}
      >
        <LogoutIcon size={14} />
        <span>{local ? 'Clear data & exit' : 'Log out'}</span>
      </button>
    </div>
  );
}

function RemindersSection({ local }: { local: boolean }) {
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const permission = notificationPermission();
  const on = settings.notifications && permission === 'granted';

  const hint = on
    ? local
      ? 'Notifications while DoneIt is open. Sign in to also get them when it is closed.'
      : pushAvailable()
        ? 'Notifications even when DoneIt is closed.'
        : 'Notifications while DoneIt is open.'
    : permission === 'denied'
      ? 'Blocked in browser settings. In-app reminders still appear while DoneIt is open.'
      : 'Reminders appear inside DoneIt. Turn on to get notifications too.';

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (!next) {
        await disableNotifications();
        return;
      }
      const result = await enableNotifications(!local);
      if (result.message) toast({ message: result.message, tone: result.ok ? 'default' : 'error', duration: 8000 });
      else if (result.ok) {
        toast({
          message: result.background ? 'Reminders on, even when DoneIt is closed.' : 'Reminders on.',
          tone: 'success',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <BellIcon size={14} /> Notifications
        </span>
        <Switch checked={on} onChange={(v) => !busy && void toggle(v)} label="Reminder notifications" />
      </div>
      <p className="m-0 text-[11px] leading-snug text-muted">{hint}</p>
      <label className="flex items-center justify-between gap-2 text-[12.5px] text-ink-2">
        <span className="shrink-0" title="Reminder added to new tasks that have a time">Default</span>
        <select
          aria-label="Default reminder for new timed tasks"
          value={settings.defaultReminder ?? ''}
          onChange={(e) => updateSettings({ defaultReminder: e.target.value === '' ? null : Number(e.target.value) })}
          className="min-w-0 max-w-[160px] flex-1 cursor-pointer rounded-md border border-field-line bg-field px-1.5 py-1 text-[12px] text-ink"
        >
          {REMINDER_OPTIONS.map((o) => (
            <option key={o.label} value={o.value ?? ''}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Row({ label, children, stack }: { label: string; children: React.ReactNode; stack?: boolean }) {
  return (
    <div
      className={`flex gap-2 rounded-[10px] border border-line bg-card px-3 py-2 ${
        stack ? 'flex-col [&>[role=radiogroup]]:w-full [&_[role=radio]]:flex-1 [&_[role=radio]]:justify-center' : 'items-center justify-between'
      }`}
    >
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="flex rounded-lg bg-hover p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.label}
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors ${
            value === o.value ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {o.icon}
          <span className={o.icon ? 'max-[300px]:hidden' : ''}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-[42px] shrink-0 rounded-full p-0.5 transition-colors ${checked ? 'bg-accent' : 'bg-[#D0D0CA] dark:bg-[#3A3A46]'}`}
    >
      <span
        className={`block size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : ''}`}
      />
    </button>
  );
}
