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
  const names = [row.title, row.name, row.brand, row.contentTitle];
  // A layout's first source line is its title; body text is never a name filter.
  if (row.variants && typeof row.source === 'string') names.push(row.source.split('\n')[0]);
  const draft = object(row.draft),
    input = object(row.input);
  names.push(object(draft?.commonCopy)?.title, input?.title);
  return !names.some((name) => typeof name === 'string' && /验收|测试/.test(name));
}
export function visibleRecords<T>(data: T): T {
  const root = object(data);
  if (!root) return data;
  const groups: unknown[][] = [];
  function collect(node: RecordView) {
    for (const [key, value] of Object.entries(node)) {
      if (collections.has(key) && Array.isArray(value)) groups.push(value);
      if (key === 'platforms' && object(value))
        Object.values(value as RecordView).forEach((platform) => {
          if (object(platform)) collect(platform as RecordView);
        });
    }
  }
  collect(root);
  const hidden = new Set<unknown>();
  const rows = groups
    .flat()
    .map(object)
    .filter((row): row is RecordView => !!row);
  for (const row of rows) if (!isVisibleRecord(row) && row.id) hidden.add(row.id);
  function linked(row: RecordView) {
    const draft = object(row.draft),
      input = object(row.input);
    return [
      row.contentId,
      row.topicId,
      row.batchId,
      row.postId,
      row.layoutId,
      row.parentAssetId,
      draft?.contentId,
      input?.contentId,
      input?.topicId,
    ].some((id) => id != null && hidden.has(id));
  }
  let size: number;
  do {
    size = hidden.size;
    for (const row of rows) if (row.id && linked(row)) hidden.add(row.id);
  } while (size !== hidden.size);
  const visible = (value: unknown) => {
    const row = object(value);
    return !row || (isVisibleRecord(row) && !hidden.has(row.id) && !linked(row));
  };
  function project(node: RecordView): RecordView {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => {
        if (collections.has(key) && Array.isArray(value)) return [key, value.filter(visible)];
        if (key === 'selected') return [key, visible(value) ? value : null];
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
