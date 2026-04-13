'use client'
import { useEffect, useState } from 'react'
import { getSocket } from '@/lib/socket'
import type { GameState, Question } from '@/types/game'

function useServerURL() {
  const [url, setUrl] = useState('')
  useEffect(() => {
    fetch('/api/server-info')
      .then((r) => r.json())
      .then(({ ip, port }) => setUrl(`http://${ip}:${port}`))
      .catch(() => setUrl(`http://localhost:3000`))
  }, [])
  return url
}

const OPT_COLORS = [
  '#ef4444', '#3b82f6', '#f59e0b', '#10b981',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]
function optColor(i: number) { return OPT_COLORS[i % OPT_COLORS.length] }

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  lobby:    { label: '大厅等待', color: '#6b7280' },
  question: { label: '答题中',   color: '#22c55e' },
  results:  { label: '查看结果', color: '#3b82f6' },
  grouping: { label: '等待分组', color: '#f59e0b' },
  done:     { label: '已分组',   color: '#8b5cf6' },
}

const EMPTY_NEW_Q = { text: '', options: ['', '', '', '', ''] }

export default function AdminPage() {
  const serverURL = useServerURL()
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [gs, setGs] = useState<GameState | null>(null)
  const [tab, setTab] = useState<'console' | 'settings'>('console')

  // Settings edit state (local; synced to server via save button)
  const [editQs, setEditQs] = useState<Question[]>([])
  const [editGroupSize, setEditGroupSize] = useState(5)
  const [newQ, setNewQ] = useState(EMPTY_NEW_Q)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!authed) return
    const socket = getSocket()
    const onState = (state: GameState) => {
      setGs(state)
      // Only pre-fill settings if user hasn't edited yet
      setSaved((prev) => {
        if (!prev) {
          setEditQs(state.questions)
          setEditGroupSize(state.groupSize)
        }
        return prev
      })
    }
    socket.on('state', onState)
    return () => { socket.off('state', onState) }
  }, [authed])

  const handleAuth = () => {
    if (!password.trim()) return
    setAuthLoading(true)
    setAuthError('')
    getSocket().emit('admin:auth', password, (resp: { success?: boolean; error?: string }) => {
      setAuthLoading(false)
      if (resp?.success) {
        setAuthed(true)
      } else {
        setAuthError(resp?.error || '密码错误')
      }
    })
  }

  // ── 密码门 ───────────────────────────────────────────────
  if (!authed) {
    return (
      <main className="game-bg flex items-center justify-center p-4">
        <div className="glass w-full max-w-xs p-8 text-center">
          <div className="text-4xl mb-3">🔐</div>
          <h2 className="text-xl font-bold text-white mb-1">管理员登录</h2>
          <p className="text-white/40 text-sm mb-6">请输入管理员密码</p>
          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setAuthError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              placeholder="密码"
              autoFocus
              className="w-full px-4 py-3 rounded-xl text-white text-center text-lg
                         bg-white/10 border border-white/20 placeholder-white/30
                         focus:outline-none focus:border-white/40 transition-colors"
            />
            {authError && <p className="text-red-400 text-sm">{authError}</p>}
            <button
              onClick={handleAuth}
              disabled={authLoading}
              className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400
                         text-white font-bold transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authLoading ? '验证中...' : '进入管理台'}
            </button>
            <button
              onClick={() => window.history.back()}
              className="text-white/30 hover:text-white/50 text-sm transition-colors"
            >
              ← 返回
            </button>
          </div>
        </div>
      </main>
    )
  }

  const emit = (event: string, data?: unknown) => getSocket().emit(event, data)

  const saveSettings = () => {
    const validQs = editQs.filter(
      (q) => q.text.trim() && q.options.filter((o) => o.trim()).length >= 2,
    )
    emit('admin:save_settings', { questions: validQs, groupSize: editGroupSize })
    setSaved(true)
  }

  const addQuestion = () => {
    if (!newQ.text.trim()) return
    const validOpts = newQ.options.filter((o) => o.trim())
    if (validOpts.length < 2) return
    const q: Question = { id: Date.now().toString(), text: newQ.text.trim(), options: validOpts }
    setEditQs((prev) => [...prev, q])
    setNewQ(EMPTY_NEW_Q)
    setSaved(false)
  }

  const removeQ = (id: string) => {
    setEditQs((prev) => prev.filter((q) => q.id !== id))
    setSaved(false)
  }

  if (!gs) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        连接中...
      </div>
    )
  }

  const statusInfo = STATUS_LABEL[gs.status] ?? { label: gs.status, color: '#6b7280' }
  const qi = gs.currentQuestionIndex
  const currentQ = gs.questions[qi]
  const isLastQ = qi >= gs.totalQuestions - 1

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* ── Header ── */}
      <div className="bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-center justify-between shrink-0">
        <h1 className="font-bold text-lg">🎮 破冰游戏 · 管理台</h1>
        <div className="flex items-center gap-3">
          <span
            className="status-badge text-white"
            style={{ background: statusInfo.color }}
          >
            {statusInfo.label}
          </span>
          <button
            onClick={() => { if (confirm('确定重置游戏？所有参与者数据将清空')) emit('admin:reset') }}
            className="px-3 py-1 bg-red-700 hover:bg-red-600 rounded-lg text-sm transition-colors"
          >
            重置
          </button>
        </div>
      </div>

      {/* ── Participant URL banner ── */}
      {serverURL && (
        <div className="bg-indigo-950 border-b border-indigo-800 px-5 py-2 flex items-center gap-3 text-sm">
          <span className="text-indigo-400 shrink-0">📱 参与者扫码/输入：</span>
          <span className="text-white font-mono font-bold">{serverURL}</span>
          <button
            onClick={() => navigator.clipboard.writeText(serverURL)}
            className="ml-auto text-indigo-400 hover:text-white text-xs border border-indigo-700
                       hover:border-indigo-400 px-2 py-0.5 rounded transition-colors shrink-0"
          >
            复制
          </button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-800 shrink-0">
        {(['console', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'console' ? '控制台' : '题目设置'}
          </button>
        ))}
      </div>

      {/* ── Console ── */}
      {tab === 'console' && (
        <div className="flex-1 overflow-auto p-5 space-y-5">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '参与人数', value: gs.totalCount, color: '#fff' },
              { label: '题目数量', value: gs.totalQuestions, color: '#818cf8' },
              { label: '每组人数', value: gs.groupSize, color: '#34d399' },
            ].map((s) => (
              <div key={s.label} className="bg-gray-900 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-gray-500 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Control buttons */}
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="text-gray-400 text-sm font-semibold mb-3">游戏控制</h3>
            <div className="flex flex-wrap gap-3">
              {gs.status === 'lobby' && (
                <button
                  onClick={() => emit('admin:start')}
                  disabled={gs.totalQuestions === 0 || gs.totalCount === 0}
                  className="px-5 py-2 bg-green-700 hover:bg-green-600 rounded-lg font-semibold
                             disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  开始游戏 ▶
                </button>
              )}

              {gs.status === 'question' && (
                <button
                  onClick={() => emit('admin:show_results')}
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg font-semibold transition-colors"
                >
                  显示本题结果 📊
                </button>
              )}

              {gs.status === 'results' && (
                <button
                  onClick={() => emit('admin:next_question')}
                  className="px-5 py-2 bg-indigo-700 hover:bg-indigo-600 rounded-lg font-semibold transition-colors"
                >
                  {isLastQ ? '进入分组阶段 →' : '下一题 →'}
                </button>
              )}

              {gs.status === 'grouping' && (
                <button
                  onClick={() => emit('admin:calculate_groups')}
                  className="px-5 py-2 bg-purple-700 hover:bg-purple-600 rounded-lg font-semibold transition-colors"
                >
                  计算并公布分组 🎯
                </button>
              )}
            </div>

            {gs.status === 'lobby' && gs.totalCount === 0 && (
              <p className="text-yellow-600 text-xs mt-2">等待参与者加入后才能开始游戏</p>
            )}
            {gs.status === 'lobby' && gs.totalQuestions === 0 && (
              <p className="text-yellow-600 text-xs mt-2">请先在「题目设置」中添加题目</p>
            )}
          </div>

          {/* Live question results (question + results phase) */}
          {currentQ && (gs.status === 'question' || gs.status === 'results') && (
            <div className="bg-gray-900 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm font-semibold">
                  第 {qi + 1} 题
                </span>
                <span className="text-gray-500 text-sm">
                  {gs.answeredCount} / {gs.totalCount} 人已回答
                </span>
              </div>
              <p className="text-white mb-4 leading-relaxed">{currentQ.text}</p>

              <div className="space-y-3">
                {currentQ.options.map((opt, i) => {
                  const names: string[] = gs.currentAnswerDist[opt] ?? []
                  const pct = gs.answeredCount > 0 ? (names.length / gs.answeredCount) * 100 : 0
                  return (
                    <div key={opt}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300">{opt}</span>
                        <span className="text-gray-500 text-xs">
                          {names.length} 人 ({Math.round(pct)}%)
                        </span>
                      </div>
                      {/* Bar */}
                      <div className="bg-gray-800 rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                            background: optColor(i),
                          }}
                        />
                      </div>
                      {/* Names (results phase) */}
                      {gs.status === 'results' && names.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {names.map((n) => (
                            <span
                              key={n}
                              className="text-xs bg-gray-800 rounded px-2 py-0.5 text-gray-300"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Final groups */}
          {gs.status === 'done' && gs.groups.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-4">
              <h3 className="text-gray-400 text-sm font-semibold mb-3">分组结果</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {gs.groups.map((g) => (
                  <div key={g.id} className="bg-gray-800 rounded-xl p-3">
                    <p className="font-bold text-indigo-300 mb-2">第 {g.id} 组</p>
                    <div className="flex flex-wrap gap-2">
                      {g.members.map((n) => (
                        <span key={n} className="text-sm bg-gray-700 px-2 py-1 rounded text-gray-200">
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Participant list */}
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="text-gray-400 text-sm font-semibold mb-3">
              参与者 ({gs.totalCount})
            </h3>
            {gs.participants.length === 0 ? (
              <p className="text-gray-600 text-sm">暂无参与者</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {gs.participants.map((p) => (
                  <span
                    key={p.nickname}
                    className="text-sm px-3 py-1 rounded-full"
                    style={{
                      background: p.answeredCurrent ? '#15803d' : '#374151',
                      color: '#fff',
                    }}
                  >
                    {p.nickname}
                    {p.answeredCurrent && ' ✓'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Settings ── */}
      {tab === 'settings' && (
        <div className="flex-1 overflow-auto p-5 space-y-5">
          {gs.status !== 'lobby' && (
            <div className="bg-yellow-900/50 border border-yellow-700 rounded-xl p-3 text-yellow-300 text-sm">
              ⚠️ 游戏进行中。修改并保存将重置所有参与者的答题记录。
            </div>
          )}

          {/* Group size */}
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="text-gray-400 text-sm font-semibold mb-3">分组人数</h3>
            <div className="flex items-center gap-4">
              <span className="text-gray-300">每组</span>
              <input
                type="number"
                min={2}
                max={20}
                value={editGroupSize}
                onChange={(e) => { setEditGroupSize(Number(e.target.value)); setSaved(false) }}
                className="w-20 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                           text-white text-center focus:outline-none focus:border-indigo-500"
              />
              <span className="text-gray-300">人</span>
            </div>
          </div>

          {/* Existing questions */}
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="text-gray-400 text-sm font-semibold mb-3">
              题目列表 ({editQs.length})
            </h3>
            {editQs.length === 0 ? (
              <p className="text-gray-600 text-sm">还没有题目，在下方添加</p>
            ) : (
              <div className="space-y-3">
                {editQs.map((q, qi2) => (
                  <div key={q.id} className="bg-gray-800 rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 text-sm shrink-0">{qi2 + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm mb-2 leading-relaxed">{q.text}</p>
                        <div className="flex flex-wrap gap-2">
                          {q.options.map((opt, oi) => (
                            <span
                              key={opt}
                              className="text-xs px-2 py-1 rounded text-white"
                              style={{ background: optColor(oi) + '55' }}
                            >
                              {opt}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => removeQ(q.id)}
                        className="text-red-500 hover:text-red-400 text-sm px-2 shrink-0"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new question */}
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="text-gray-400 text-sm font-semibold mb-3">添加新题目</h3>
            <div className="space-y-3">
              <textarea
                value={newQ.text}
                onChange={(e) => setNewQ({ ...newQ, text: e.target.value })}
                placeholder="题目内容…"
                rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl
                           text-white placeholder-gray-600 resize-none
                           focus:outline-none focus:border-indigo-500 text-sm"
              />
              <div className="space-y-2">
                {newQ.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: optColor(i) }}
                    />
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...newQ.options]
                        next[i] = e.target.value
                        setNewQ({ ...newQ, options: next })
                      }}
                      placeholder={`选项 ${i + 1}${i >= 2 ? '（可留空）' : ''}`}
                      className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg
                                 text-white placeholder-gray-600 text-sm
                                 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={addQuestion}
                className="w-full py-2 bg-indigo-700 hover:bg-indigo-600 rounded-xl
                           font-semibold text-sm transition-colors"
              >
                + 添加题目
              </button>
            </div>
          </div>

          {/* Save */}
          <button
            onClick={saveSettings}
            className="w-full py-3 bg-green-700 hover:bg-green-600 rounded-xl
                       font-bold text-base transition-colors"
          >
            {saved ? '✓ 已保存到服务器' : '保存并同步设置 →'}
          </button>
        </div>
      )}
    </div>
  )
}
