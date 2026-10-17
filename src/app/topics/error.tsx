'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="workspace"><section className="card"><h1>选题中心暂时无法加载</h1><p className="empty">请检查选题输入渠道和参数配置，具体错误记录在本地终端。</p><button className="button" onClick={reset}>重试</button></section></main>;
}
