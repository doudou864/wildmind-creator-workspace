// Presentation-only read filter. Never apply this to mutation requests or persisted records.
type RecordView = Record<string, unknown>;
const collections = new Set([
  'items',
  'contents',
  'plannedContents',
  'topics',
  'themes',
  'questions',
  'accountAlerts',
  'assets',
  'drafts',
  'documents',
  'videos',
  'snapshots',
  'batches',
  'receipts',
  'tasks',
  'generations',
  'messages',
  'posts',
  'works',
]);
const object = (value: unknown): RecordView | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordView) : null;
export function isVisibleRecord(value: unknown): boolean {
  const row = object(value);
  if (!row) return true;
  if (
    row.fixture === true ||
    row.fixture === 'fixture' ||
    row.isFixture === true ||
    row.source === 'fixture' ||
    (Array.isArray(row.tags) && row.tags.includes('fixture'))
  )
    return false;
  return true;
}
export function visibleRecords<T>(data: T): T {
  const root = object(data);
  if (!root) return data;
  function project(node: RecordView): RecordView {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => {
        if (collections.has(key) && Array.isArray(value)) return [key, value.filter(isVisibleRecord)];
        if (key === 'selected') return [key, isVisibleRecord(value) ? value : null];
        if (key === 'platforms' && object(value))
          return [
            key,
            Object.fromEntries(
              Object.entries(value as RecordView).map(([id, platform]) => [
                id,
                object(platform) ? project(platform as RecordView) : platform,
              ]),
            ),
          ];
        return [key, value];
      }),
    );
  }
  return project(root) as T;
}
