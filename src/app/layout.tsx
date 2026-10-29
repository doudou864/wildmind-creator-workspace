import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '总控台 · WILDMIND 野生脑洞工作台',
  description: '野生脑洞 AI 视频创作工作台 · 总控台、消息、作品数据、选题、封面生成与一键发布',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // 翻译扩展会在 React 启动前给 html 添加主题属性，仅容忍根元素的属性差异。
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
