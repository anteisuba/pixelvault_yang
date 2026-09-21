import 'server-only'

export function canUseQwenEvaluation(userId: string): boolean {
  if (process.env.NODE_ENV === 'development') return true
  return (process.env.QWEN_EVALUATION_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId)
}
