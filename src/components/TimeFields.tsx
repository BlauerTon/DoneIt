import { useRef, type KeyboardEvent } from 'react';
import {
  setEndHour,
  setEndMinute,
  setStartHour,
  setStartMinute,
  type DraftUpdate,
  type TimeDraft,
} from '../lib/timeDraft';

type Segment = 'sh' | 'sm' | 'eh' | 'em';
const ORDER: Segment[] = ['sh', 'sm', 'eh', 'em'];

interface TimeFieldsProps {
  draft: TimeDraft;
  onChange: (draft: TimeDraft) => void;
}

/**
 * Two segmented [HH]:[MM] inputs with typing shortcuts:
 * "8" becomes 08 and jumps to minutes, ":" / Enter / → move forward, Backspace on an empty
 * segment moves back. The end time follows the start (+1h) until it is edited.
 */
export function TimeFields({ draft, onChange }: TimeFieldsProps) {
  const refs = useRef<Record<Segment, HTMLInputElement | null>>({ sh: null, sm: null, eh: null, em: null });

  const focus = (seg: Segment) => {
    const el = refs.current[seg];
    if (el) {
      el.focus();
      requestAnimationFrame(() => el.select());
    }
  };

  const handle = (seg: Segment, update: DraftUpdate) => {
    onChange(update.draft);
    if (update.advance) {
      const next = ORDER[ORDER.indexOf(seg) + 1];
      if (next) focus(next);
    }
  };

  const onKeyDown = (seg: Segment) => (e: KeyboardEvent<HTMLInputElement>) => {
    const idx = ORDER.indexOf(seg);
    const el = e.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length;
    if ((e.key === ':' || e.key === 'Enter') && (seg === 'sh' || seg === 'eh')) {
      e.preventDefault();
      focus(ORDER[idx + 1]);
    } else if (e.key === 'Enter' && seg === 'sm') {
      e.preventDefault();
      focus('eh');
    } else if (e.key === 'ArrowRight' && atEnd && idx < ORDER.length - 1) {
      e.preventDefault();
      focus(ORDER[idx + 1]);
    } else if ((e.key === 'ArrowLeft' && atStart) || (e.key === 'Backspace' && !el.value)) {
      if (idx > 0) {
        e.preventDefault();
        focus(ORDER[idx - 1]);
      }
    }
  };

  const input = (seg: Segment, placeholder: string, label: string, apply: (d: TimeDraft, v: string) => DraftUpdate) => (
    <input
      ref={(el) => {
        refs.current[seg] = el;
      }}
      value={draft[seg]}
      onChange={(e) => handle(seg, apply(draft, e.target.value))}
      onKeyDown={onKeyDown(seg)}
      onFocus={(e) => e.target.select()}
      placeholder={placeholder}
      aria-label={label}
      inputMode="numeric"
      autoComplete="off"
      maxLength={2}
      className="w-9 border-none bg-transparent text-center font-mono text-[15px] font-semibold text-ink outline-none placeholder:text-muted"
    />
  );

  const box =
    'flex items-center justify-center rounded-[10px] border border-field-line bg-field px-2.5 py-1.5 focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20';

  return (
    <div className="flex flex-wrap gap-3.5">
      <div className="flex min-w-[130px] flex-1 flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-2">Start time</span>
        <div className={box}>
          {input('sh', '08', 'Start hour', setStartHour)}
          <span className="mx-0.5 font-mono font-bold text-muted">:</span>
          {input('sm', '00', 'Start minute', setStartMinute)}
        </div>
      </div>
      <div className="flex min-w-[130px] flex-1 flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-2">End time</span>
        <div className={box}>
          {input('eh', '09', 'End hour', setEndHour)}
          <span className="mx-0.5 font-mono font-bold text-muted">:</span>
          {input('em', '00', 'End minute', setEndMinute)}
        </div>
      </div>
    </div>
  );
}
