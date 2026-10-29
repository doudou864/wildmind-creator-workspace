import { isVisibleRecord } from './visible-records';

export type CoverChatDraft = {
  text: string;
  skillId: string;
  ratio: string;
  topicId?: string;
  topicTitle?: string;
};

export function topicCoverDraft(topicId: string, topics: { id: string; title: string }[]): CoverChatDraft {
  const topic = topics.find((item) => item.id === topicId && isVisibleRecord(item));
  if (!topic) throw Error('这个选题已失效或已归档，请返回选题重新选择。');
  return { text: topic.title, skillId: '', ratio: '', topicId: topic.id, topicTitle: topic.title };
}

// Dimensions may have been rounded to integer pixels by the image generator.
export function imageRatioLabel(width: number, height: number, ratios: string[], original: string) {
  return (
    ratios.find((ratio) => {
      const [w, h] = ratio.split(':').map(Number);
      return w > 0 && h > 0 && (Math.round((width * h) / w) === height || Math.round((height * w) / h) === width);
    }) ?? original
  );
}
