import type { SaveStatus } from './autosave-queue';
export function AutosaveStatus({ statuses }: { statuses: SaveStatus[] }) {
  const error = statuses.find((s) => s.state === 'error');
  const saving = statuses.some((s) => s.state === 'saving');
  if (!saving && !error && statuses.every((s) => s.state === 'idle')) return null;
  return (
    <span role="status" className="autosave-status">
      {saving ? '保存中' : error ? `保存失败：${error.reason}` : '已保存'}
    </span>
  );
}
