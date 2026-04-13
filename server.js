const { createServer } = require('http')
const { Server } = require('socket.io')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, port })
const handle = app.getRequestHandler()

// ============================================================
//  GAME STATE
// ============================================================

const DEFAULT_QUESTIONS = [
  {
    id: 'q1',
    text: '狮子、小熊猫、小狗、大象、和一只不会游泳的小黄鸭同时掉在水里，你会先救哪一只？',
    options: ['🦁 狮子', '🦝 小熊猫', '🐕 小狗', '🐘 大象', '🐥 小黄鸭'],
  },
]

function freshState(questions, groupSize) {
  return {
    // 'lobby' | 'question' | 'results' | 'grouping' | 'done'
    status: 'lobby',
    currentQuestionIndex: 0,
    groupSize: groupSize || 5,
    questions: questions || DEFAULT_QUESTIONS,
    // { id, nickname, answers: (string|null)[], groupId: number|null }
    participants: [],
    // { id, members: string[] }
    groups: [],
  }
}

let G = freshState()

// ============================================================
//  HELPERS
// ============================================================

function answerDist(questionIndex) {
  const q = G.questions[questionIndex]
  if (!q) return {}
  const dist = {}
  q.options.forEach((o) => { dist[o] = [] })
  G.participants.forEach((p) => {
    const a = p.answers[questionIndex]
    if (a !== null && a !== undefined && dist[a] !== undefined) {
      dist[a].push(p.nickname)
    }
  })
  return dist
}

function publicState() {
  const qi = G.currentQuestionIndex
  return {
    status: G.status,
    currentQuestionIndex: qi,
    groupSize: G.groupSize,
    questions: G.questions,
    totalQuestions: G.questions.length,
    participants: G.participants.map((p) => ({
      nickname: p.nickname,
      answeredCurrent:
        p.answers[qi] !== null && p.answers[qi] !== undefined,
      groupId: p.groupId,
    })),
    currentAnswerDist: answerDist(qi),
    answeredCount: G.participants.filter(
      (p) => p.answers[qi] !== null && p.answers[qi] !== undefined,
    ).length,
    totalCount: G.participants.length,
    groups: G.groups,
  }
}

function calculateGroups() {
  const { participants, groupSize, questions } = G
  if (participants.length === 0) return

  const numQ = questions.length

  function similarity(a, b) {
    let score = 0
    for (let i = 0; i < numQ; i++) {
      if (a.answers[i] && b.answers[i] && a.answers[i] === b.answers[i]) score++
    }
    return score
  }

  const unassigned = [...participants]
  const groups = []
  let gid = 1

  while (unassigned.length > 0) {
    if (unassigned.length <= groupSize) {
      // last group — take everyone remaining
      const group = unassigned.splice(0)
      group.forEach((p) => { p.groupId = gid })
      groups.push({ id: gid, members: group.map((p) => p.nickname) })
    } else {
      const pivot = unassigned.shift()
      pivot.groupId = gid
      const group = [pivot]
      // sort rest by similarity to pivot
      unassigned.sort((a, b) => similarity(b, pivot) - similarity(a, pivot))
      const fill = unassigned.splice(0, groupSize - 1)
      fill.forEach((p) => { p.groupId = gid; group.push(p) })
      groups.push({ id: gid, members: group.map((p) => p.nickname) })
    }
    gid++
  }

  G.groups = groups
}

// ============================================================
//  SERVER
// ============================================================

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // socket.io 的轮询请求不能交给 Next.js 处理，否则会被抢先响应
    if (req.url?.startsWith('/socket.io')) return
    handle(req, res)
  })

  const io = new Server(httpServer, { cors: { origin: '*' } })

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

  io.on('connection', (socket) => {
    // push current state immediately
    socket.emit('state', publicState())

    // ── AUTH ────────────────────────────────────────────────

    socket.on('admin:auth', (password, cb) => {
      if (password === ADMIN_PASSWORD) {
        cb({ success: true })
      } else {
        cb({ error: '密码错误' })
      }
    })

    // ── PARTICIPANT ─────────────────────────────────────────

    socket.on('join', ({ nickname }, cb) => {
      const name = nickname?.trim()
      if (!name) return cb?.({ error: '请输入有效的社交代号' })
      if (G.status !== 'lobby') return cb?.({ error: '游戏已经开始，无法加入' })

      const existing = G.participants.find((p) => p.nickname === name)
      if (existing) {
        // same name — treat as reconnect
        existing.id = socket.id
        socket.data.nickname = name
        return cb?.({ success: true, nickname: name })
      }

      G.participants.push({
        id: socket.id,
        nickname: name,
        answers: new Array(G.questions.length).fill(null),
        groupId: null,
      })
      socket.data.nickname = name
      cb?.({ success: true, nickname: name })
      io.emit('state', publicState())
    })

    socket.on('rejoin', ({ nickname }, cb) => {
      const p = G.participants.find((x) => x.nickname === nickname)
      if (!p) return cb?.({ error: 'not_found' })
      p.id = socket.id
      socket.data.nickname = nickname
      cb?.({ success: true })
    })

    socket.on('answer', ({ questionIndex, answer }, cb) => {
      const p = G.participants.find((x) => x.id === socket.id)
      if (!p) return cb?.({ error: 'not_joined' })
      if (G.status !== 'question') return cb?.({ error: 'not_in_question' })
      if (questionIndex !== G.currentQuestionIndex) return cb?.({ error: 'wrong_q' })

      p.answers[questionIndex] = answer
      cb?.({ success: true })
      io.emit('state', publicState())
    })

    // ── ADMIN ───────────────────────────────────────────────

    socket.on('admin:save_settings', ({ questions, groupSize }) => {
      G.questions = questions
      G.groupSize = groupSize
      G.participants.forEach((p) => {
        p.answers = new Array(questions.length).fill(null)
      })
      io.emit('state', publicState())
    })

    socket.on('admin:start', () => {
      if (G.questions.length === 0) return
      G.status = 'question'
      G.currentQuestionIndex = 0
      io.emit('state', publicState())
    })

    socket.on('admin:show_results', () => {
      if (G.status !== 'question') return
      G.status = 'results'
      io.emit('state', publicState())
    })

    socket.on('admin:next_question', () => {
      if (G.status !== 'results') return
      const next = G.currentQuestionIndex + 1
      if (next >= G.questions.length) {
        G.status = 'grouping'
      } else {
        G.currentQuestionIndex = next
        G.status = 'question'
      }
      io.emit('state', publicState())
    })

    socket.on('admin:calculate_groups', () => {
      calculateGroups()
      G.status = 'done'
      io.emit('state', publicState())
    })

    socket.on('admin:reset', () => {
      G = freshState(G.questions, G.groupSize)
      io.emit('state', publicState())
    })

    // ── DISCONNECT ──────────────────────────────────────────

    socket.on('disconnect', () => {
      if (G.status === 'lobby') {
        G.participants = G.participants.filter((p) => p.id !== socket.id)
        io.emit('state', publicState())
      }
    })
  })

  httpServer.listen(port, () => {
    console.log(`\n  ✅  破冰游戏运行中`)
    console.log(`  参与者地址：http://localhost:${port}`)
    console.log(`  管理员地址：http://localhost:${port}/admin\n`)
  })
})
