import { NextResponse } from 'next/server'
import os from 'os'

function getLocalIP(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      // 跳过 IPv6 和 loopback
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return 'localhost'
}

export function GET() {
  const ip = getLocalIP()
  return NextResponse.json({ ip, port: process.env.PORT ?? '3000' })
}
