import 'server-only'

import { db } from '@/lib/db'
import type { User } from '@/lib/generated/prisma/client'

export type { User }

// ─── Service Functions ────────────────────────────────────────────

export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  return db.user.findUnique({
    where: { clerkId },
  })
}

export async function createUser(params: {
  clerkId: string
  email: string
}): Promise<User> {
  return db.user.create({
    data: {
      clerkId: params.clerkId,
      email: params.email,
    },
  })
}
