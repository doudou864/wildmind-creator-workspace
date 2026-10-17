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
  return {
    platforms: {},
    hitRates: [],
    questions: [],
    questionsReady: false,
    plannedContents: [],
    plansReady: false,
    themes: [],
    themesReady: false,
    themeSyncReady: false,
    accountAlerts: [],
    accountAlertsReady: false,
    collectionReady: false,
    reviewReady: false,
  };
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
  return {
    contents: [],
    videos: [],
    assets: [],
    snapshots: [],
    batches: [],
    receipts: [],
    accounts: [],
    recommendations: [],
    storageReady: false,
    aiReady: false,
    uploadReady: false,
    publishReady: false,
    handoffReady: false,
    message: '发布存储、AI 配置与平台发布服务待接入；本页仅准备内容，不会上传或发布。',
  };
}

export async function readInbox(): Promise<InboxData> {
  return {
    items: [],
    themes: [],
    sources: [],
    recordsReady: false,
    topicSyncReady: false,
    message: '评论与私信读取、分类和选题同步服务待接入；当前没有可展示的业务记录。',
  };
}

export async function readDeals(): Promise<DealData> {
  return {
    items: [],
    messages: [],
    recordsReady: false,
    writeReady: false,
    suggestionReady: false,
    message: '商单存储与状态建议服务待接入；暂无可展示的商单记录。',
  };
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
