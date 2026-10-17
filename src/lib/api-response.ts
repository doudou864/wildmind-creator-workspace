import { ZodError } from 'zod';
export function unavailable(service: string) {
  return Response.json({ error: `${service}尚未接入，本次操作未执行。`, code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
}
export function invalid(error: unknown) {
  if (error instanceof ZodError)
    return Response.json({ error: '输入内容不符合要求，请检查必填项。', code: 'INVALID_INPUT' }, { status: 400 });
  return Response.json({ error: '请求格式有误。', code: 'INVALID_INPUT' }, { status: 400 });
}

export function serviceError(error: unknown) {
  if (error instanceof ZodError) return invalid(error);
  const message = error instanceof Error ? error.message : '';
  return Response.json(
    { error: /[\u4e00-\u9fff]/.test(message) ? message : '服务处理失败，本次操作未完成，请稍后重试。' },
    { status: 400 },
  );
}
