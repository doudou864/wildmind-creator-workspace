'use client';
import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const node = ref.current;
    if (node) {
      node.style.height = 'auto';
      node.style.height = node.scrollHeight + (node.offsetHeight - node.clientHeight) + 'px';
    }
  };
  useLayoutEffect(resize, [props.value]);
  return (
    <textarea
      {...props}
      ref={ref}
      style={{ ...props.style, overflow: 'hidden', resize: 'none' }}
      onChange={(e) => {
        props.onChange?.(e);
        resize();
      }}
    />
  );
}
