import 'server-only'

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? '')
  .split(',')
  .filter(Boolean)

export function isAdmin(clerkId: string): boolean {
  return ADMIN_USER_IDS.includes(clerkId)
}
