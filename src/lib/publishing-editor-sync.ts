/** A list refresh may still contain the revision from before the latest autosave. */
export function shouldSyncPublishingEditor(
  local: { id: string; revision: number } | null,
  remote: { id: string; revision: number } | undefined,
  dirty: boolean,
) {
  return !dirty && !!local && !!remote && local.id === remote.id && remote.revision > local.revision;
}
