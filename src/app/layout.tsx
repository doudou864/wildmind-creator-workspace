import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'WILDMIND · 野生脑洞工作台', description: '野生脑洞 AI 自媒体运营工作台 · 总控台、选题中心、生图中心、排版中心与发布中心' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
