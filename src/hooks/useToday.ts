import { useEffect, useState } from 'react';
import { todayISO, type ISODate } from '../lib/dates';

/** Today's date that rolls over at midnight, even if the installed app stays open overnight. */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        setToday(todayISO());
        schedule();
      }, next.getTime() - now.getTime());
    };
    const refresh = () => {
      if (document.visibilityState === 'visible') setToday(todayISO());
    };
    schedule();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}

/** Minutes since midnight, refreshed every 30 seconds (for the "now" line on the timeline). */
export function useNowMinutes(): number {
  const read = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
