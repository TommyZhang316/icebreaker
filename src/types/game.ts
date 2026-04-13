export interface Question {
  id: string
  text: string
  options: string[]
}

export interface PublicParticipant {
  nickname: string
  answeredCurrent: boolean
  groupId: number | null
}

export interface Group {
  id: number
  members: string[]
}

export interface GameState {
  status: 'lobby' | 'question' | 'results' | 'grouping' | 'done'
  currentQuestionIndex: number
  groupSize: number
  questions: Question[]
  totalQuestions: number
  participants: PublicParticipant[]
  currentAnswerDist: Record<string, string[]>
  answeredCount: number
  totalCount: number
  groups: Group[]
}
