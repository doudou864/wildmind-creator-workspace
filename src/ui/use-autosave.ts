'use client';
import { useEffect, useRef, useState } from 'react';
import { createAutosaveQueue, type SaveContext, type SaveStatus } from './autosave-queue';

export function useAutosave(key: string, enabled: boolean, save: (context: SaveContext) => Promise<unknown>) {
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle' });
  const queue = useRef<ReturnType<typeof createAutosaveQueue> | null>(null);
  if (!queue.current) queue.current = createAutosaveQueue(setStatus);
  queue.current.update({ key, enabled, save });
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void queue.current!.flush(), 400);
    return () => window.clearTimeout(timer);
  }, [key, enabled]);
  useEffect(() => {
    const flush = () => {
      void queue.current!.flush();
    };
    const hide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hide);
      flush();
    };
  }, []);
  return {
    ...status,
    flush: async () => {
      await queue.current!.flush();
      return queue.current!.isSaved();
    },
  };
}
