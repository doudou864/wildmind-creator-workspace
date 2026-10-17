'use client';

import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { number } from '@/lib/format';
import type { Parameters } from '@/lib/config';

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export function Card({ index, title, meta, children, className = '' }: { index: string; title: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}><div className="card-heading"><h2><span className="eyebrow">{index}</span>{title}</h2>{meta && <div className="card-meta">{meta}</div>}</div>{children}</section>;
}
export function Segmented<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <div className="segments" role="group" aria-label={label}>{options.map(option => <Button key={option.value} aria-pressed={option.value === value} className={option.value === value ? 'selected' : ''} onClick={() => onChange(option.value)}>{option.label}</Button>)}</div>;
}
export function Ratio({ value, parameters }: { value: number | null; parameters: Parameters }) {
  if (value == null) return <span className="muted mono">--</span>;
  const lit = Math.min(parameters.ratioCells, Math.floor(value / parameters.ratioPerCell));
  return <span className="ratio" aria-label={`${number(value, 1)} 倍同龄基线`}><b className="mono">{number(value, 1)}</b><span className="ratio-cells" aria-hidden="true">{Array.from({ length: parameters.ratioCells }, (_, i) => <i key={i} className={i < lit ? (value >= parameters.hitThreshold ? 'lit hit' : 'lit') : ''} />)}</span></span>;
}
export function Empty({ children }: { children: ReactNode }) { return <p className="empty">{children}</p>; }
export function Tag({ children, outline = false }: { children: ReactNode; outline?: boolean }) {
  return <span className={`tag${outline ? ' tag-outline' : ''}`}>{children}</span>;
}
export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); opener?.focus(); };
  }, []);
  return <dialog ref={ref} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="dialog-title"><div className="dialog-content"><header><h2 id="dialog-title">{title}</h2><Button onClick={onClose} aria-label="关闭详情">关闭 ×</Button></header>{children}</div></dialog>;
}
