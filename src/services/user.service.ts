import 'server-only'

import { clerkClient } from '@clerk/nextjs/server'

import { db } from '@/lib/db'
import type { User } from '@/lib/generated/prisma/client'

export type { User }

// ─── Service Functions ────────────────────────────────────────────

export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  return db.user.findUnique({
    where: { clerkId },
  })
}

/**
 * Get or create a DB user for the given Clerk ID (JIT provisioning).
 * Falls back to Clerk SDK to fetch email if the user doesn't exist in DB.
 */
export async function ensureUser(clerkId: string): Promise<User> {
  const existing = await db.user.findUnique({ where: { clerkId } })
  if (existing) return existing

  const client = await clerkClient()
  const clerkUser = await client.users.getUser(clerkId)
  const email = clerkUser.emailAddresses[0]?.emailAddress
  if (!email) throw new Error('No email found for Clerk user')

  return db.user.upsert({
    where: { clerkId },
    update: {},
    create: { clerkId, email },
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
