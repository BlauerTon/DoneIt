import { isIOS, useInstall } from '../hooks/useInstall';
import { DeviceIcon, DownloadIcon, MonitorIcon, XIcon } from './icons';
import { Modal } from './Modal';

export function InstallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const install = useInstall();
  const ios = isIOS();

  const steps = [
    {
      icon: <MonitorIcon size={15} />,
      title: 'Windows & Mac (Chrome, Edge)',
      body: (
        <>
          Click the <strong>Install</strong> icon at the right of the address bar, then choose <em>Install</em>.
        </>
      ),
      show: !ios,
    },
    {
      icon: <DeviceIcon size={15} />,
      title: 'iPhone & iPad (Safari)',
      body: (
        <>
          Tap <strong>Share</strong>, scroll down, and choose <strong>Add to Home Screen</strong>.
        </>
      ),
      show: true,
    },
    {
      icon: <DeviceIcon size={15} />,
      title: 'Android (Chrome)',
      body: (
        <>
          Open the <strong>⋮</strong> menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </>
      ),
      show: !ios,
    },
  ];

  return (
    <Modal open={open} onClose={onClose} labelledBy="install-title" className="max-w-[440px]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 id="install-title" className="flex items-center gap-2 text-lg font-bold text-ink">
            <DownloadIcon size={20} className="text-accent" strokeWidth={2.2} />
            Install DoneIt
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted hover:text-ink">
            <XIcon size={18} />
          </button>
        </div>
        <p className="m-0 text-[13.5px] leading-relaxed text-ink-2">
          Install DoneIt as an app on your computer or phone. Once installed it opens without an internet connection, and
          your tasks stay available offline.
        </p>
        <div className="flex flex-col gap-2.5">
          {steps
            .filter((s) => s.show)
            .map((s) => (
              <div key={s.title} className="flex flex-col gap-1 rounded-[10px] border border-line bg-field px-3.5 py-3">
                <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                  {s.icon}
                  {s.title}
                </div>
                <div className="text-[12.5px] leading-relaxed text-muted">{s.body}</div>
              </div>
            ))}
        </div>
        <div className="flex justify-end gap-2.5">
          {install.canPrompt && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (await install.prompt()) onClose();
              }}
            >
              Install now
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
