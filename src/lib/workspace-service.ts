import type { LayoutData } from './layout-model';
import type { DashboardData } from './workspace-model';
import type { TopicData } from './topic-model';
import type { ImageData } from './image-model';
// 服务接入边界：只返回业务记录。接入采集、复盘、数据库后替换这些读取器，不在页面填充示例。
export async function readDashboard(): Promise<DashboardData> { return {platforms:{},hitRates:[],collectionReady:false,reviewReady:false}; }
export async function readTopics(): Promise<TopicData> { return {topics:[],d21Samples:null,generationReady:false,writeReady:false,serviceMessage:'选题服务待接入，暂不能生成或保存选择。'}; }
export async function readImages(): Promise<ImageData> { return {assets:[],drafts:[],topics:[],contents:[],generationReady:false,storageReady:false,generationMessage:'生图服务待接入；素材与草稿存储服务待接入。'}; }

export async function readLayouts(): Promise<LayoutData> { return {documents:[],assets:[],storageReady:false,aiReady:false,handoffReady:false,message:'稿件保存、AI 修改与确认稿交接待接入；本页编辑离开后不会保存。'}; }
