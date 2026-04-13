'use client'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()

  return (
    <main className="game-bg flex items-center justify-center p-4">
      <div className="glass w-full max-w-sm p-10 text-center">
        <div className="text-5xl mb-3">🧊</div>
        <h1 className="text-3xl font-bold text-white mb-1">破冰时刻</h1>
        <p className="text-white/40 text-sm mb-10">找到和你最默契的那群人</p>

        <div className="flex flex-col gap-4">
          <button
            onClick={() => router.push('/join')}
            className="w-full py-4 rounded-xl bg-indigo-500 hover:bg-indigo-400
                       text-white font-bold text-lg transition-colors"
          >
            我是参与者
          </button>
          <button
            onClick={() => router.push('/admin')}
            className="w-full py-4 rounded-xl bg-white/10 hover:bg-white/20
                       text-white/70 hover:text-white font-semibold text-lg
                       border border-white/15 transition-colors"
          >
            我是管理员
          </button>
        </div>
      </div>
    </main>
  )
}
