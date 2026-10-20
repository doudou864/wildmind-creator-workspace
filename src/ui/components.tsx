'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { number } from '@/lib/format';
import type { Parameters } from '@/lib/config';

export function Button({
  className = '',
  variant = 'secondary',
  disabledReason,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'text';
  disabledReason?: string;
}) {
  const button = (
    <button className={`button button-${variant} ${className}`} {...props}>
      {children}
      {variant === 'text' && <span aria-hidden="true"> →</span>}
    </button>
  );
  return props.disabled ? (
    <span
      className="disabled-control"
      tabIndex={0}
      role="group"
      aria-label={disabledReason ?? props.title ?? '当前不可用'}
      data-disabled-reason={disabledReason ?? props.title ?? '请先完成所需内容，或等待当前操作结束。'}
      aria-describedby="disabled-help"
    >
      {button}
    </span>
  ) : (
    button
  );
}

function DisabledHelp() {
  const [hint, setHint] = useState<{ reason: string; x: number; y: number } | null>(null);
  useEffect(() => {
    function show(event: Event) {
      const target =
        event.target instanceof Element ? event.target.closest<HTMLElement>('[data-disabled-reason]') : null;
      if (!target) return setHint(null);
      const rect = target.getBoundingClientRect();
      setHint({
        reason: target.dataset.disabledReason!,
        x: Math.max(12, Math.min(rect.left, window.innerWidth - 360)),
        y: Math.min(rect.bottom + 6, window.innerHeight - 90),
      });
    }
    const hide = () => setHint(null);
    document.addEventListener('pointerover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);
  const tooltip = (
    <span
      id="disabled-help"
      role="tooltip"
      className={hint ? 'disabled-help' : 'sr-only'}
      style={hint ? { left: hint.x, top: hint.y } : undefined}
    >
      ⓘ {hint?.reason ?? '悬停或聚焦禁用操作，查看原因'}
    </span>
  );
  return hint ? createPortal(tooltip, document.querySelector('dialog[open]') ?? document.body) : tooltip;
}

export function PageHeader({
  title,
  summary,
  action,
  onRefresh,
  refreshing = false,
}: {
  title: string;
  summary: ReactNode;
  action: ReactNode;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      <p className="page-summary">{summary}</p>
      <div className="page-actions">
        {action}
        <Button
          onClick={() => {
            onRefresh();
            window.dispatchEvent(new Event('workspace:refresh-pickers'));
          }}
          disabled={refreshing}
          disabledReason="正在处理，请稍后刷新。"
        >
          刷新
        </Button>
      </div>
      <DisabledHelp />
    </div>
  );
}
export function Card({
  title,
  meta,
  children,
  className = '',
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <div className="card-heading">
        <h2>{title}</h2>
        {meta && <div className="card-meta">{meta}</div>}
      </div>
      {children}
    </section>
  );
}
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segments" role="group" aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.value}
          aria-pressed={option.value === value}
          className={option.value === value ? 'selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
export function Ratio({ value, parameters }: { value: number | null; parameters: Parameters }) {
  if (value == null) return <span className="muted mono">--</span>;
  const lit = Math.min(parameters.ratioCells, Math.floor(value / parameters.ratioPerCell));
  return (
    <span className="ratio" aria-label={`${number(value, 1)} 倍同龄基线`}>
      <b className="mono">{number(value, 1)}</b>
      <span className="ratio-cells" aria-hidden="true">
        {Array.from({ length: parameters.ratioCells }, (_, i) => (
          <i key={i} className={i < lit ? (value >= parameters.hitThreshold ? 'lit hit' : 'lit') : ''} />
        ))}
      </span>
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function Tag({ children, dot = false }: { children: ReactNode; dot?: boolean }) {
  return (
    <span className="tag">
      {dot && <span aria-hidden="true">● </span>}
      {children}
    </span>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      className={className}
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-content">
        <header>
          <h2 id="dialog-title">{title}</h2>
          <Button onClick={onClose} aria-label="关闭详情">
            关闭 ×
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
