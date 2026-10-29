import type { ReactNode } from 'react';

export function CreationShell({
  children,
}: {
  children: ReactNode;
  content: { id: string; title: string; form: string } | null;
  step: string;
  query: string;
  date: string;
  syncWindow: string;
}) {
  return <>{children}</>;
}
