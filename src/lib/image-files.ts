import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, copyFile, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
const run = promisify(execFile);
export async function imageInfo(file: string) {
  const bytes = await readFile(file);
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? 'image/jpeg'
      : null;
  if (!mime) throw new Error('文件内容不是有效的PNG或JPEG图片。');
  const { stdout } = await run('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]);
  const width = Number(stdout.match(/pixelWidth: (\d+)/)?.[1]),
    height = Number(stdout.match(/pixelHeight: (\d+)/)?.[1]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new Error('无法读取图片尺寸。');
  return { width, height, mime, bytes: bytes.length };
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
export function exactCrop(width: number, height: number, ratio: string, maxFraction: number) {
  const parts = ratio.split(':').map(Number);
  if (parts.length !== 2 || parts.some((x) => !Number.isFinite(x) || x <= 0)) throw new Error('图片比例无效。');
  const scale = 10 ** Math.max(...ratio.split(':').map((x) => (x.split('.')[1] ?? '').length));
  let [w, h] = parts.map((x) => Math.round(x * scale));
  const divisor = gcd(w, h);
  w /= divisor;
  h /= divisor;
  const unit = Math.floor(Math.min(width / w, height / h));
  const crop = { width: unit * w, height: unit * h };
  if (unit < 1 || 1 - crop.width / width > maxFraction || 1 - crop.height / height > maxFraction)
    throw new Error('生成图片与要求比例偏差过大，不能轻裁；本次未保存素材，请调整提示词后重试。');
  return crop;
}
export async function normalizeImage(source: string, destination: string, ratio: string, maxFraction: number) {
  const info = await imageInfo(source),
    crop = exactCrop(info.width, info.height, ratio, maxFraction);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  if (crop.width === info.width && crop.height === info.height) await copyFile(source, destination);
  else
    await run('/usr/bin/sips', [
      '--cropToHeightWidth',
      String(crop.height),
      String(crop.width),
      source,
      '--out',
      destination,
    ]);
  const checked = await imageInfo(destination);
  if (checked.width !== crop.width || checked.height !== crop.height) throw new Error('图片比例处理失败，未保存素材。');
  return checked;
}
export async function assetFile(relative: string) {
  const root = await realpath(path.resolve('data'));
  const full = await realpath(path.resolve(relative));
  if (!full.startsWith(root + path.sep)) throw new Error('素材路径不在data目录。');
  return full;
}
export function imageRatio(width: number, height: number) {
  const d = gcd(width, height);
  return `${width / d}:${height / d}`;
}
