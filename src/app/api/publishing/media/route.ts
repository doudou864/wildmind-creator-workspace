import { publishMediaSchema } from '@/lib/publishing-model';
import { invalid, unavailable } from '@/lib/api-response';
import { loadPublishingConfig } from '@/lib/publishing-config';
import { loadConfig } from '@/lib/config';
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const metadata = publishMediaSchema.parse(JSON.parse(String(form.get('metadata'))));
    const files = form.getAll('files');
    const config = await loadPublishingConfig((await loadConfig()).platforms);
    const video = metadata.kind === 'video';
    if (!files.length || (video && files.length !== 1) || (!video && files.length > config.xhsMaxImages))
      return invalid(null);
    if (
      files.some(
        (file) =>
          !(file instanceof File) ||
          file.size === 0 ||
          file.size > (video ? config.videoMaxMB : config.imageMaxMB) * 1024 * 1024 ||
          !(video ? config.videoTypes : config.imageTypes).includes(file.type),
      )
    )
      return invalid(null);
  } catch (error) {
    return invalid(error);
  }
  return unavailable('视频与图片存储服务');
}
