import { usingDatabase } from '@/lib/media-store';
import { enqueueImageTask } from '@/jobs/image-tasks';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    const input = await request.json();
    const id = request.headers.get('idempotency-key');
    if (!id) throw new Error('缺少生图请求编号，请刷新后重试。');
    const task = await usingDatabase((db) => enqueueImageTask(db, id, input));
    return Response.json(
      {
        task,
        message:
          task.status === 'success'
            ? '这项任务已经完成，未重复生成。'
            : '后台任务已接收，可以刷新或关闭页面；重新打开可查看进度。',
      },
      { status: 202 },
    );
  } catch (e) {
    return serviceError(e);
  }
}
