'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket'
import type { GameState, BestPair } from '@/types/game'

const OPT_COLORS = [
  '#ef4444', '#3b82f6', '#f59e0b', '#10b981',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]
function optColor(i: number) { return OPT_COLORS[i % OPT_COLORS.length] }

// ── Best Pairs Block ─────────────────────────────────────────
function BestPairsBlock({ pairs, me, label }: { pairs: BestPair[]; me: string; label: string }) {
  if (pairs.length === 0) return null
  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <p className="text-center text-white/40 text-xs mb-3">{label}</p>
      <div className="space-y-2">
        {pairs.map((pair, i) => {
          const isMine = pair.names.includes(me)
          return (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl px-4 py-2"
              style={{ background: isMine ? 'rgba(250,204,21,0.12)' : 'rgba(255,255,255,0.05)' }}
            >
              <span className="text-sm">
                {pair.names.map((n, ni) => (
                  <span key={n}>
                    {ni > 0 && <span className="text-white/30 mx-1">×</span>}
                    <span className={n === me ? 'text-yellow-300 font-bold' : 'text-white'}>
                      {n}
                    </span>
                  </span>
                ))}
              </span>
              <span className="text-yellow-300 font-bold text-sm ml-3 shrink-0">
                {pair.score}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function GamePage() {
  const router = useRouter()
  const [gs, setGs] = useState<GameState | null>(null)
  const [me, setMe] = useState('')
  const [myAnswers, setMyAnswers] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null)

  useEffect(() => {
    const nickname = sessionStorage.getItem('ib_nickname')
    if (!nickname) { router.push('/join'); return }
    setMe(nickname)

    const socket = getSocket()
    socketRef.current = socket
    const onState = (state: GameState) => setGs(state)
    socket.on('state', onState)

    socket.emit('rejoin', { nickname }, (resp: { success?: boolean; error?: string }) => {
      if (resp?.error) { sessionStorage.removeItem('ib_nickname'); router.push('/join') }
    })

    return () => { socket.off('state', onState) }
  }, [router])

  const submitAnswer = (answer: string) => {
    if (!gs || gs.status !== 'question') return
    const qi = gs.currentQuestionIndex
    if (myAnswers[qi] !== undefined || submitting) return
    setSubmitting(true)
    socketRef.current?.emit('answer', { questionIndex: qi, answer }, () => {
      setMyAnswers((prev) => ({ ...prev, [qi]: answer }))
      setSubmitting(false)
    })
  }

  if (!gs) {
    return (
      <main className="game-bg flex items-center justify-center">
        <p className="text-white/40 text-xl pulse-slow">连接中...</p>
      </main>
    )
  }

  // ── Lobby ────────────────────────────────────────────────
  if (gs.status === 'lobby') {
    return (
      <main className="game-bg flex items-center justify-center p-4">
        <div className="glass w-full max-w-lg p-8 text-center">
          <div className="text-4xl mb-3">👋</div>
          <h2 className="text-2xl font-bold text-white mb-1">
            嗨，<span className="text-yellow-300">{me}</span>！
          </h2>
          <p className="text-white/50 mb-6">游戏即将开始，等待主持人启动…</p>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-white/30 text-xs mb-3">已加入 {gs.totalCount} 人</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {gs.participants.map((p) => (
                <span key={p.nickname} className={p.nickname === me ? 'pill my-pill' : 'pill other-pill'}>
                  {p.nickname}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  // ── Question ─────────────────────────────────────────────
  if (gs.status === 'question') {
    const q = gs.questions[gs.currentQuestionIndex]
    const myAns = myAnswers[gs.currentQuestionIndex]

    return (
      <main className="game-bg flex flex-col items-center justify-center p-4 gap-4">
        <p className="text-white/40 text-sm">第 {gs.currentQuestionIndex + 1} / {gs.totalQuestions} 题</p>

        <div className="glass w-full max-w-xl p-6">
          <h2 className="text-xl font-bold text-white text-center mb-6 leading-relaxed">{q.text}</h2>

          {myAns === undefined ? (
            <div className="flex flex-col gap-3">
              {q.options.map((opt, i) => (
                <button
                  key={opt}
                  className="option-btn"
                  style={{ background: optColor(i) }}
                  onClick={() => submitAnswer(opt)}
                  disabled={submitting}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <div className="flex justify-center mb-5">
                <span className="px-5 py-2 rounded-full text-white font-bold text-base"
                  style={{ background: optColor(q.options.indexOf(myAns)) }}>
                  ✓ {myAns}
                </span>
              </div>
              <p className="text-center text-white/40 text-sm mb-4">
                已回答 {gs.answeredCount} / {gs.totalCount} 人
              </p>
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const count = (gs.currentAnswerDist[opt] ?? []).length
                  const pct = gs.answeredCount > 0 ? (count / gs.answeredCount) * 100 : 0
                  return (
                    <div key={opt} className="flex items-center gap-2">
                      <span className="text-white/60 text-xs w-20 truncate shrink-0">{opt}</span>
                      <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: optColor(i) }} />
                      </div>
                      <span className="text-white/50 text-xs w-5 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-center text-white/25 text-xs mt-5">等待主持人显示结果…</p>
            </div>
          )}
        </div>
      </main>
    )
  }

  // ── Results ──────────────────────────────────────────────
  if (gs.status === 'results') {
    const q = gs.questions[gs.currentQuestionIndex]

    return (
      <main className="game-bg flex flex-col items-center justify-center p-4 gap-4">
        <p className="text-white/40 text-sm">
          第 {gs.currentQuestionIndex + 1} / {gs.totalQuestions} 题 · 结果揭晓
        </p>

        <div className="glass w-full max-w-xl p-6">
          <h2 className="text-base font-semibold text-white/70 text-center mb-5">{q.text}</h2>

          <div className="space-y-4">
            {q.options.map((opt, i) => {
              const names: string[] = gs.currentAnswerDist[opt] ?? []
              if (names.length === 0) return null
              return (
                <div key={opt}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-sm px-3 py-1 rounded-full"
                      style={{ background: optColor(i) }}>
                      {opt}
                    </span>
                    <span className="text-white/40 text-sm">{names.length} 人</span>
                  </div>
                  <div className="rounded-xl p-3 flex flex-wrap gap-2"
                    style={{ background: optColor(i) + '25' }}>
                    {names.map((name) => (
                      <span key={name} className={name === me ? 'pill my-pill' : 'pill other-pill'}>
                        {name === me ? `✨ ${name}` : name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 每题结果后显示目前最默契 */}
          {gs.showCompatibility && (
            <BestPairsBlock pairs={gs.bestPairs} me={me} label="✨ 目前最默契" />
          )}

          <p className="text-center text-white/25 text-xs mt-6">等待主持人进入下一环节…</p>
        </div>
      </main>
    )
  }

  // ── Grouping ─────────────────────────────────────────────
  if (gs.status === 'grouping') {
    return (
      <main className="game-bg flex items-center justify-center p-4">
        <div className="glass w-full max-w-sm p-8 text-center">
          <div className="text-5xl mb-4 pulse-slow">🎲</div>
          <h2 className="text-2xl font-bold text-white mb-2">正在寻找你的默契组</h2>
          <p className="text-white/40">主持人正在计算分组结果，稍等…</p>
        </div>
      </main>
    )
  }

  // ── Done ─────────────────────────────────────────────────
  if (gs.status === 'done') {
    const myGroup = gs.groups.find((g) => g.members.includes(me))

    return (
      <main className="game-bg flex items-center justify-center p-4">
        <div className="glass w-full max-w-sm p-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-4">分组结果出炉！</h2>

          {myGroup ? (
            <>
              <p className="text-white/60 mb-1">
                你在 <span className="text-yellow-300 font-bold text-xl">第 {myGroup.id} 组</span>
              </p>
              {gs.showCompatibility && (
                <p className="text-white/30 text-sm mb-5">
                  组内匹配度 <span className="text-yellow-300 font-semibold">{myGroup.compatibility}%</span>
                </p>
              )}
              {!gs.showCompatibility && <div className="mb-5" />}
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-white/30 text-xs mb-3">你的组员</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {myGroup.members.map((name) => (
                    <span key={name} className={name === me ? 'pill my-pill' : 'pill other-pill'}>
                      {name === me ? `⭐ ${name}` : name}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-white/50">未能找到你的分组信息</p>
          )}

          {/* 全场最默契 */}
          {gs.showCompatibility && (
            <BestPairsBlock pairs={gs.bestPairs} me={me} label="💫 全场最默契" />
          )}
        </div>
      </main>
    )
  }

  return null
}
