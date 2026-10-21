import { runEgo } from './ego.ts';
// A deleted space cannot be resumed. Never claim an existing user-owned space.
export async function existingCollectionSpace(id: number, execute = runEgo) {
  const spaces = (await execute("console.log('WORKSPACE_RESULT:'+JSON.stringify(await listTaskSpaces()));")) as {
    id: number;
    ownership: string;
  }[];
  const space = spaces.find((s) => s.id === id);
  if (!space) return undefined;
  if (space.ownership !== 'agent') throw Error('采集浏览器已交给你，请处理后明确恢复采集');
  return id;
}
