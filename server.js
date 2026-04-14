const { createServer } = require('http')
const { Server } = require('socket.io')
const next = require('next')
const fs = require('fs')
const path = require('path')

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, port })
const handle = app.getRequestHandler()

// ============================================================
//  PERSISTENCE  (survives server restarts within same deploy)
// ============================================================

const DATA_FILE = path.join(__dirname, 'data.json')

function loadSaved() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    }
  } catch (e) {
    console.error('[data] load failed:', e.message)
  }
  return null
}

function persist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      questions: G.questions,
      groupSize: G.groupSize,
      showCompatibility: G.showCompatibility,
    }, null, 2))
  } catch (e) {
    console.error('[data] save failed:', e.message)
  }
}

// ============================================================
//  DEFAULT QUESTIONS
// ============================================================

const DEFAULT_QUESTIONS = [
  {
    id: 'q1',
    text: '狮子、小熊猫、小狗、大象、和一只不会游泳的小黄鸭同时掉在水里，你会先救哪一只？',
    options: ['🦁 狮子', '🦝 小熊猫', '🐕 小狗', '🐘 大象', '🐥 小黄鸭'],
  },
  {
    id: 'q2',
    text: '如果你可以拥有以下其中一项超能力，你会选哪个？',
    options: [
      '🧠 超级智慧（考前几小时满绩，然后去麻省做荣誉教授或香港某校做校长）',
      '💪 超级体魄（各项身体素质超顶级运动员，但打不过美国队长）',
      '🤝 超级亲和（任何人天生对你有亲近感，愿意为你付出）',
      '🔮 超级感受（随意感受他人心中所思所想）',
      '♾️ 超级生命（无灾无病活到150岁，衰老极慢，永远18岁~）',
    ],
  },
  {
    id: 'q3',
    text: '末日降临，系统给你瞬移到孤岛并提供一件神奇物品，你会选哪个？（选完发现是一场梦）',
    options: [
      '💧 取之不尽的杏仁水+皇家口粮（补充水分和所有身体所需营养）',
      '🤖 具身智能"Alexander Hamilton"（能帮你做除了伤害你以外的任何事）',
      '💾 盘古U盘+超级资源库（含所有现代工业资源，不含食物）',
      '🎣 钓鱼竿"海之眷顾999"（能钓上任何东西，包括辣条、5090显卡、你的教授）',
      '🌀 联通平行世界的神奇平台（可与别的世界的人沟通和跨时空交易）',
    ],
  },
  {
    id: 'q4',
    text: '你毕业后进了全球500强，你希望你的上司是？',
    options: [
      '☀️ Leo（阳光开朗，对你迟到睁一只眼闭一只眼）',
      '💬 Vicky（爱唠家常，经常带你见大客户）',
      '📚 Morgan（业务一流，毫不吝啬教你技能）',
      '🌍 Dylan（总部外派，不太说话但给你A级绩效）',
      '🍦 Zoe（旅游带手信，喜欢请大家吃冰激凌喝奶茶）',
    ],
  },
]

// ============================================================
//  GAME STATE
// ============================================================

function freshState(questions, groupSize, showCompatibility) {
  return {
    status: 'lobby',
    currentQuestionIndex: 0,
    groupSize: groupSize || 5,
    showCompatibility: showCompatibility || false,
    questions: questions || DEFAULT_QUESTIONS,
    participants: [],
    groups: [],
  }
}

const _saved = loadSaved()
let G = freshState(
  _saved?.questions || DEFAULT_QUESTIONS,
  _saved?.groupSize || 5,
  _saved?.showCompatibility || false,
)

// ============================================================
//  COMPUTATION HELPERS
// ============================================================

function answerDist(qi) {
  const q = G.questions[qi]
  if (!q) return {}
  const dist = {}
  q.options.forEach((o) => { dist[o] = [] })
  G.participants.forEach((p) => {
    const a = p.answers[qi]
    if (a != null && dist[a] !== undefined) dist[a].push(p.nickname)
  })
  return dist
}

// similarity between two participants considering questions 0..upTo
function pairSim(a, b, upTo) {
  let matches = 0, total = 0
  for (let i = 0; i <= upTo; i++) {
    if (a.answers[i] != null && b.answers[i] != null) {
      total++
      if (a.answers[i] === b.answers[i]) matches++
    }
  }
  return total > 0 ? matches / total : 0
}

// top compatible pairs up to question upTo
function computeBestPairs(upTo) {
  const ps = G.participants
  if (ps.length < 2) return []
  const pairs = []
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      pairs.push({
        names: [ps[i].nickname, ps[j].nickname],
        score: Math.round(pairSim(ps[i], ps[j], upTo) * 100),
      })
    }
  }
  pairs.sort((a, b) => b.score - a.score)
  if (pairs.length === 0) return []
  const top = pairs[0].score
  // return all pairs tied at top, plus any >= 80%, max 6
  return pairs.filter((p, idx) => idx === 0 || p.score === top || p.score >= 80).slice(0, 6)
}

// average pairwise similarity within a group (participant objects)
function groupCompat(members) {
  if (members.length < 2) return 100
  const numQ = G.questions.length
  let sum = 0, count = 0
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      sum += pairSim(members[i], members[j], numQ - 1)
      count++
    }
  }
  return count > 0 ? Math.round(sum / count * 100) : 0
}

function calculateGroups() {
  const { participants, groupSize } = G
  if (participants.length === 0) return
  const numQ = G.questions.length

  const unassigned = [...participants]
  const groups = []
  let gid = 1

  while (unassigned.length > 0) {
    let group
    if (unassigned.length <= groupSize) {
      group = unassigned.splice(0)
    } else {
      const pivot = unassigned.shift()
      unassigned.sort((a, b) => pairSim(b, pivot, numQ - 1) - pairSim(a, pivot, numQ - 1))
      group = [pivot, ...unassigned.splice(0, groupSize - 1)]
    }
    group.forEach((p) => { p.groupId = gid })
    groups.push({ id: gid, members: group.map((p) => p.nickname), compatibility: groupCompat(group) })
    gid++
  }

  G.groups = groups
}

function publicState() {
  const qi = G.currentQuestionIndex
  const showBest = G.status === 'results' || G.status === 'done'
  return {
    status: G.status,
    currentQuestionIndex: qi,
    groupSize: G.groupSize,
    showCompatibility: G.showCompatibility,
    questions: G.questions,
    totalQuestions: G.questions.length,
    participants: G.participants.map((p) => ({
      nickname: p.nickname,
      answeredCurrent: p.answers[qi] != null,
      groupId: p.groupId,
    })),
    currentAnswerDist: answerDist(qi),
    answeredCount: G.participants.filter((p) => p.answers[qi] != null).length,
    totalCount: G.participants.length,
    groups: G.groups,
    bestPairs: showBest ? computeBestPairs(qi) : [],
  }
}

// ============================================================
//  SERVER
// ============================================================

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    if (req.url?.startsWith('/socket.io')) return
    handle(req, res)
  })

  const io = new Server(httpServer, { cors: { origin: '*' } })

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

  io.on('connection', (socket) => {
    socket.emit('state', publicState())

    // ── AUTH ────────────────────────────────────────────────
    socket.on('admin:auth', (password, cb) => {
      if (password === ADMIN_PASSWORD) {
        cb({ success: true })
        // 认证成功后主动推一次当前状态，避免客户端漏掉初始推送
        socket.emit('state', publicState())
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
        existing.id = socket.id
        socket.data.nickname = name
        return cb?.({ success: true, nickname: name })
      }
      G.participants.push({ id: socket.id, nickname: name, answers: new Array(G.questions.length).fill(null), groupId: null })
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
      G.participants.forEach((p) => { p.answers = new Array(questions.length).fill(null) })
      persist()
      io.emit('state', publicState())
    })

    socket.on('admin:toggle_compatibility', () => {
      G.showCompatibility = !G.showCompatibility
      persist()
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
      G.status = next >= G.questions.length ? 'grouping' : 'question'
      if (G.status === 'question') G.currentQuestionIndex = next
      io.emit('state', publicState())
    })

    socket.on('admin:calculate_groups', () => {
      calculateGroups()
      G.status = 'done'
      io.emit('state', publicState())
    })

    socket.on('admin:reset', () => {
      G = freshState(G.questions, G.groupSize, G.showCompatibility)
      io.emit('state', publicState())
    })

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
