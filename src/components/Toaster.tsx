import { dismissToast, useToasts } from '../hooks/useToasts';
import { XIcon } from './icons';

const toneClass = {
  default: 'bg-[#23231F] text-white dark:bg-[#F3F3F7] dark:text-[#16161B]',
  error: 'bg-danger-bg text-danger border border-danger-line',
  success: 'bg-success-bg text-success border border-success-line',
};

export function Toaster() {
  const toasts = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex max-w-[460px] items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-medium shadow-lg animate-[toast-in_160ms_ease-out] ${toneClass[t.tone]}`}
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="shrink-0 rounded-md px-2 py-1 font-bold text-[#9AA8FF] hover:bg-white/10 dark:text-accent"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            className="shrink-0 opacity-60 hover:opacity-100"
            onClick={() => dismissToast(t.id)}
          >
            <XIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
