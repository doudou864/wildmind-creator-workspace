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
  return {
    assets: [],
    drafts: [],
    topics: [],
    contents: [],
    contentWriteReady: false,
    generationReady: false,
    storageReady: false,
    generationMessage: '生图服务待接入；素材与草稿存储服务待接入。',
  };
}

export async function readLayouts(): Promise<LayoutData> {
  return {
    documents: [],
    contents: [],
    assets: [],
    storageReady: false,
    aiReady: false,
    handoffReady: false,
    message: '稿件保存、AI 修改与确认稿交接待接入；未保存编辑仅在当前窗口临时保留，关闭或刷新窗口将丢失。',
  };
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
  return { items: [], topics: [], recordsReady: false, writeReady: false, message: '作品存储服务待接入' };
}
