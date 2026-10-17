'use client';
import { useEffect, useRef } from 'react';

// Debounce typing; a failed write waits for another edit instead of looping.
export function useAutosave(key: string, enabled: boolean, save: () => Promise<unknown>) {
  const latest = useRef({ key, enabled, save });
  latest.current = { key, enabled, save };
  const attempted = useRef<string | null>(null);
  const running = useRef(false);
  async function persist() {
    const current = latest.current;
    if (!current.enabled || running.current || attempted.current === current.key) return;
    attempted.current = current.key;
    running.current = true;
    try {
      await current.save();
    } finally {
      running.current = false;
    }
  }
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    if (!enabled || attempted.current === key) return;
    const timer = window.setTimeout(() => void persistRef.current(), 400);
    return () => window.clearTimeout(timer);
  }, [key, enabled]);
  // Navigating away flushes the pending edit without asking the user to save.
  useEffect(
    () => () => {
      void persistRef.current();
    },
    [],
  );
}
