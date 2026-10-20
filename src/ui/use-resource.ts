'use client';
import { visibleRecords } from './visible-records.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    throw new Error('无法连接本机服务，请检查工作台是否正在运行，然后重试；填写内容已保留。');
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('服务响应无法读取，请稍后重试。');
  }
  if (!response.ok)
    throw new Error(
      typeof body?.error === 'string' && /[\u4e00-\u9fff]/.test(body.error)
        ? body.error
        : `请求失败（${response.status}），请稍后重试；填写内容已保留。`,
    );
  return body as T;
}
export function useResource<T>(url: string, initial: T, fetchOnMount = false) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await request<T>(url);
      if (current === sequence.current) {
        setData(next);
        setError('');
      }
    } catch (error) {
      if (current === sequence.current) setError(error instanceof Error ? error.message : '读取失败');
    }
  }, [url]);
  useEffect(() => {
    if (fetchOnMount) void refresh();
  }, [fetchOnMount, refresh]);
  useEffect(() => {
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);
  const visible = useMemo(() => visibleRecords(data), [data]);
  return { data: visible, error, refresh };
}
