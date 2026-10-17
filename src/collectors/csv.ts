// RFC 4180 quoting, BOM, embedded newlines and empty cells. No numeric inference.
export function parseCsv(source: string): Record<string, string>[] {
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === '') quoted = !quoted;
      else throw new Error('CSV引号格式错误');
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(cell);
      cell = '';
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (row.some((v) => v !== '')) rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw new Error('CSV引号未闭合');
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift();
  if (!headers?.length || new Set(headers).size !== headers.length) throw new Error('CSV表头缺失或重复');
  return rows.map((values) => {
    if (values.length !== headers.length) throw new Error('CSV列数变化');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}
export function chinesePublishedAt(value: string) {
  const result = value.trim().replace(/(\d{4})年(\d{2})月(\d{2})日 (\d{2}:\d{2}:\d{2})/, '$1-$2-$3T$4+08:00');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(result) || !Number.isFinite(Date.parse(result)))
    throw new Error('导出发布时间格式变化');
  return result;
}
