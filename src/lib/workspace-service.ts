import { inboxData, dealData } from './inbox-store.ts';
import { loadConfig } from './config.ts';
import { dashboardData } from './dashboard-store.ts';
import { readImageTasks } from '../jobs/image-tasks.ts';
import { publishingData } from './publishing-store.ts';
import { usingDatabase, usedImages } from './media-store.ts';
import { assets, contents, topics, imageDrafts, imageGenerations, layouts } from '../db/schema.ts';
import { loadGenerationConfig } from '../ai/image-generation.ts';
import { shanghaiDate } from '../browser/policy.ts';
import { desc } from 'drizzle-orm';
import type { ContentData } from './content-model';
import type { DealData } from './deal-model';
import type { InboxData } from './inbox-model';
import type { PublishingData } from './publishing-model';
import type { LayoutData } from './layout-model';
import type { DashboardData } from './workspace-model';
import type { TopicData } from './topic-model';
import type { ImageData } from './image-model';
// 服务接入边界：只返回业务记录。接入采集、复盘、数据库后替换这些读取器，不在页面填充示例。
export async function readDashboard(): Promise<DashboardData> {
  const config = await loadConfig();
  return usingDatabase((db) => dashboardData(db, config));
}
export async function readTopics(): Promise<TopicData> {
  return {
    topics: [],
    d21Samples: null,
    generationReady: false,
    writeReady: false,
    serviceMessage: '选题服务待接入，暂不能生成或保存选择。',
  };
}
export async function readImages(): Promise<ImageData> {
  const config = await loadGenerationConfig();
  return usingDatabase((db) => ({
    tasks: readImageTasks(db),
    assets: db.db.select().from(assets).all(),
    drafts: db.db
      .select()
      .from(imageDrafts)
      .all()
      .map((r) => ({ ...r.input, id: r.id, updatedAt: r.updatedAt })),
    topics: db.db.select({ id: topics.id, title: topics.title }).from(topics).all(),
    contents: db.db.select().from(contents).all(),
    contentWriteReady: true,
    generationReady: true,
    storageReady: true,
    generationMessage: `使用本机ChatGPT套餐；今天已用${usedImages(db, shanghaiDate())}/${config.dailyLimit}次，一次只生成一张。`,
    generations: db.db.select().from(imageGenerations).orderBy(desc(imageGenerations.startedAt)).limit(30).all(),
  }));
}

export async function readLayouts(): Promise<LayoutData> {
  return usingDatabase((db) => ({
    documents: db.db.select().from(layouts).all(),
    contents: db.db.select().from(contents).all(),
    assets: db.db.select().from(assets).all(),
    storageReady: true,
    aiReady: true,
    handoffReady: true,
    message: '三个版本独立编辑；每次确认保存快照，送入发布准备。',
  }));
}

export async function readPublishing(): Promise<PublishingData> {
  return usingDatabase(publishingData);
}

export async function readInbox(): Promise<InboxData> {
  return usingDatabase(inboxData);
}

export async function readDeals(): Promise<DealData> {
  return usingDatabase(dealData);
}

export async function readContents(): Promise<ContentData> {
  return usingDatabase((db) => ({
    items: db.db.select().from(contents).all(),
    topics: db.db.select({ id: topics.id, title: topics.title }).from(topics).all(),
    recordsReady: true,
    writeReady: true,
    message: '',
  }));
}
