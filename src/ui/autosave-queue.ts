export type SaveContext = { isCurrent: () => boolean };
export type SaveStatus = { state: 'idle' | 'saving' | 'saved' | 'error'; reason?: string };
type Snapshot = { key: string; enabled: boolean; save: (context: SaveContext) => Promise<unknown> };

// One request in flight, one replaceable latest snapshot. Failed versions never spin.
export function createAutosaveQueue(report: (status: SaveStatus) => void) {
  let latest: Snapshot | undefined;
  let attempted: string | undefined;
  let pending: Promise<void> | undefined;
  async function drain() {
    while (latest?.enabled && latest.key !== attempted) {
      const current = latest;
      attempted = current.key;
      report({ state: 'saving' });
      try {
        await current.save({ isCurrent: () => latest?.key === current.key });
        report({ state: 'saved' });
      } catch (error) {
        report({ state: 'error', reason: error instanceof Error ? error.message : '本机保存失败' });
      }
    }
  }
  return {
    update(snapshot: Snapshot) {
      latest = snapshot;
    },
    flush() {
      if (!pending)
        pending = drain().finally(() => {
          pending = undefined;
        });
      return pending;
    },
  };
}
