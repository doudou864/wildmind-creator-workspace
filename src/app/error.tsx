'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="workspace"><section className="card"><h1>总控台暂时无法加载</h1><p>请检查配置文件是否有效，或查看终端错误记录。</p><button className="button" onClick={reset}>重试</button></section></main>;
}
