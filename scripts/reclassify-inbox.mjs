import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { openDatabase, backupDatabase } from '../src/db/database.ts';
import { messages } from '../src/db/schema.ts';
import { loadInboxConfig } from '../src/lib/inbox-config.ts';
import { inboxClassificationSchema, enforceCommentValue } from '../src/lib/inbox-model.ts';
import { CodexJudgment } from '../src/ai/structured.ts';
const db = openDatabase();
try {
  const config = await loadInboxConfig();
  const rows = db.db
    .select()
    .from(messages)
    .all()
    .filter(
      (m) =>
        m.classification.status === 'ready' &&
        m.classification.result.category !== 'deal' &&
        m.classification.policyVersion !== config.valueRules.version,
    );
  if (rows.length) console.log('backup', await backupDatabase(db));
  const judgment = new CodexJudgment();
  for (let offset = 0; offset < rows.length; offset += config.valueRules.batchSize) {
    const batch = rows.slice(offset, offset + config.valueRules.batchSize);
    const schema = z.object({
      items: z.array(
        z.object({
          key: z.enum(batch.map((_, i) => String(i))),
          classification: inboxClassificationSchema.extend({
            category: z.enum(['idea', 'other']),
            valueKind: z.enum(['specific_help', 'resonance', 'none']),
          }),
        }),
      ),
    });
    const result = await judgment.read(
      schema,
      '重新严格筛选历史非商单消息；不创建商单。\n' +
        JSON.stringify(config.valueRules) +
        '\n' +
        JSON.stringify(
          batch.map((m, i) => ({
            key: String(i),
            body: m.body,
            channel: m.channel,
            reply: m.reply,
            context: m.context,
          })),
        ),
    );
    if (result.items.length !== batch.length || new Set(result.items.map((r) => r.key)).size !== batch.length)
      throw Error('分类结果未完整覆盖本批消息');
    db.db.transaction((tx) => {
      for (const row of result.items) {
        const old = batch[Number(row.key)];
        const current = tx.select().from(messages).where(eq(messages.id, old.id)).get();
        if (current.revision !== old.revision) throw Error('消息已变更，请重新运行');
        tx.update(messages)
          .set({
            classification: {
              status: 'ready',
              policyVersion: config.valueRules.version,
              result: enforceCommentValue(row.classification, old.reply, config.valueRules),
            },
            revision: old.revision + 1,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(messages.id, old.id))
          .run();
      }
    });
    console.log(`reclassified ${Math.min(offset + batch.length, rows.length)}/${rows.length}`);
  }
  console.log(
    JSON.stringify(
      db.sqlite
        .prepare(
          "select json_extract(classification,'$.result.category') category, count(*) count from messages group by category",
        )
        .all(),
    ),
  );
} finally {
  db.sqlite.close();
}
