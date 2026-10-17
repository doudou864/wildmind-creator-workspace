'use client';
import { useLayoutEffect, useRef } from 'react';
// 仅在当前浏览器文档的内存中保留临时编辑，不代表已保存到业务服务。
const sessions = new Map<string, unknown>();
let listening = false;
function warn(event: BeforeUnloadEvent) {
  if (sessions.size) {
    event.preventDefault();
    event.returnValue = '';
  }
}
export function useEditSession<T>(key: string, value: T, dirty: boolean, restore: (value: T) => void) {
  const first = useRef(true);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useLayoutEffect(() => {
    if (!listening) {
      window.addEventListener('beforeunload', warn);
      listening = true;
    }
    if (first.current) {
      first.current = false;
      const saved = sessions.get(key);
      if (saved) {
        restoreRef.current(saved as T);
        return;
      }
    }
    if (dirty) sessions.set(key, value);
    else sessions.delete(key);
  }, [key, value, dirty]);
  return dirtyRef;
}
