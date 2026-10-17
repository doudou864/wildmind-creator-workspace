'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  let body;
  try { body=await response.json(); } catch { throw new Error('服务响应无法读取，请稍后重试。'); }
  if (!response.ok) throw new Error(body.error ?? '操作失败，请重试');
  return body as T;
}
export function useResource<T>(url: string, initial: T) {
  const [data,setData]=useState(initial);
  const [error,setError]=useState('');
  const sequence=useRef(0);
  const refresh=useCallback(async()=>{
    const current=++sequence.current;
    try { const next=await request<T>(url); if(current===sequence.current){setData(next);setError('');} }
    catch(error){ if(current===sequence.current)setError(error instanceof Error?error.message:'读取失败'); }
  },[url]);
  useEffect(()=>{const onFocus=()=>void refresh(); const onVisibility=()=>{if(document.visibilityState==='visible')void refresh();}; window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onVisibility);return()=>{window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisibility);};},[refresh]);
  return {data,error,refresh};
}
