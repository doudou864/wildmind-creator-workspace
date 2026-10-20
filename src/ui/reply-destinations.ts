import 'server-only';
import { loadBrowserConfig } from '@/browser/config';
export async function replyDestinations() {
  return Object.fromEntries((await loadBrowserConfig()).map((p) => [p.id, p.replyPages ?? {}]));
}
