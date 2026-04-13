'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket'

export default function JoinPage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const saved = sessionStorage.getItem('ib_nickname')
    if (saved) {
      const socket = getSocket()
      socket.emit('rejoin', { nickname: saved }, (resp: { success?: boolean; error?: string }) => {
        if (resp?.success) {
          router.push('/game')
        } else {
          sessionStorage.removeItem('ib_nickname')
          setChecking(false)
        }
      })
    } else {
      setChecking(false)
    }
  }, [router])

  const handleJoin = () => {
    const name = nickname.trim()
    if (!name) { setError('请输入你的社交代号'); return }
    setJoining(true)
    setError('')
    const socket = getSocket()
    socket.emit('join', { nickname: name }, (resp: { success?: boolean; nickname?: string; error?: string }) => {
      if (resp?.error) {
        setError(resp.error)
        setJoining(false)
      } else {
        sessionStorage.setItem('ib_nickname', resp!.nickname!)
        router.push('/game')
      }
    })
  }

  if (checking) {
    return (
      <main className="game-bg flex items-center justify-center">
        <div className="text-white/40 text-lg pulse-slow">加载中...</div>
      </main>
    )
  }

  return (
    <main className="game-bg flex items-center justify-center p-4">
      <div className="glass w-full max-w-sm p-8 text-center">
        <button
          onClick={() => router.push('/')}
          className="text-white/30 hover:text-white/60 text-sm mb-6 block transition-colors"
        >
          ← 返回
        </button>

        <div className="text-4xl mb-3">👋</div>
        <h2 className="text-2xl font-bold text-white mb-1">加入游戏</h2>
        <p className="text-white/40 text-sm mb-7">输入一个你想在这里用的代号</p>

        <div className="space-y-3">
          <input
            type="text"
            value={nickname}
            onChange={(e) => { setNickname(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="你的社交代号"
            maxLength={16}
            autoFocus
            className="w-full px-4 py-3 rounded-xl text-white text-center text-lg
                       bg-white/10 border border-white/20 placeholder-white/30
                       focus:outline-none focus:border-white/40 transition-colors"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400
                       text-white font-bold text-lg transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {joining ? '加入中...' : '加入游戏 →'}
          </button>
        </div>
      </div>
    </main>
  )
}
