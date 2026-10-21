import { readFile } from 'node:fs/promises';
export class CollectionCancelled extends Error {
  constructor() {
    super('已停止本次采集');
  }
}
let controller: AbortController | undefined;
export function collectionSignal() {
  return controller?.signal;
}
export function throwIfCollectionCancelled() {
  if (controller?.signal.aborted) throw new CollectionCancelled();
}
export function watchCollectionCancellation(platform: string) {
  controller = new AbortController();
  const current = controller;
  const timer = setInterval(async () => {
    try {
      const value = JSON.parse(await readFile(`data/jobs/stop-${platform}.json`, 'utf8'));
      if (value.requestedAt) current.abort(new CollectionCancelled());
    } catch {}
  }, 500);
  timer.unref();
  return () => {
    clearInterval(timer);
    if (controller === current) controller = undefined;
  };
}
