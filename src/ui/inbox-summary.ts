import { assessReplies, waitingCount, type InboxMessage } from '../lib/inbox-model';
// Shared presentation summary. Classification and conversation deduplication stay in the business model.
export function inboxSummary(items: InboxMessage[]) {
  const category = (m: InboxMessage, value: string) =>
    m.classification.status === 'ready' && m.classification.result.category === value;
  const valuable = items.filter((m) => category(m, 'deal') || category(m, 'idea'));
  const ideas = items.filter((m) => category(m, 'idea'));
  const assessments = assessReplies(items);
  return {
    waiting: waitingCount(items, items),
    valuableWaiting: waitingCount(valuable, items),
    dealWaiting: waitingCount(
      items.filter((m) => category(m, 'deal')),
      items,
    ),
    ideaDmWaiting: waitingCount(
      ideas.filter((m) => m.channel === 'dm'),
      items,
    ),
    ideaCommentWaiting: waitingCount(
      ideas.filter((m) => m.channel === 'comment'),
      items,
    ),
    incomplete: valuable.filter((m) => assessments.get(m.id)?.state === 'unknown'),
    valuable,
    assessments,
  };
}
