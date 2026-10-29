import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'WILDMIND · 野生脑洞工作台',
  description: '野生脑洞 AI 自媒体运营工作台 · 总控台、选题中心、生图中心、排版中心、发布中心、互动收件箱与商单列表',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // 翻译扩展会在 React 启动前给 html 添加主题属性，仅容忍根元素的属性差异。
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
