// Retain the retired endpoint to give old open tabs an explicit migration message.
export async function GET() {
  return Response.json({ error: '选题渠道已移入 Skill，请刷新选题页面后编辑来源入口' }, { status: 410 });
}
export async function POST() {
  return GET();
}
