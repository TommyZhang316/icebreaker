import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '破冰时刻',
  description: '找到和你最默契的那群人',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="antialiased">{children}</body>
    </html>
  )
}
