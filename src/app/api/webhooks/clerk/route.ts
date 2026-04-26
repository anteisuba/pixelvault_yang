import { headers } from 'next/headers'
import { Webhook } from 'svix'

import {
  createUser,
  softDeleteUser,
  syncUserFromClerk,
} from '@/services/user.service'
import { logger } from '@/lib/logger'

// ─── Clerk event types ────────────────────────────────────────────

interface ClerkEmailAddress {
  email_address: string
}

interface ClerkUserData {
  id: string
  email_addresses?: ClerkEmailAddress[]
  first_name?: string | null
  last_name?: string | null
  image_url?: string | null
  username?: string | null
  deleted?: boolean
}

interface ClerkWebhookEvent {
  type: string
  data: ClerkUserData
}

// ─── POST /api/webhooks/clerk ─────────────────────────────────────

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    return new Response('Missing CLERK_WEBHOOK_SECRET', { status: 500 })
  }

  // 1. Read svix headers for signature verification
  const headerPayload = await headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  // 1b. Reject stale webhooks (older than 5 minutes)
  const timestampAge = Math.abs(Date.now() / 1000 - Number(svixTimestamp))
  if (timestampAge > 300) {
    return new Response('Webhook timestamp expired', { status: 400 })
  }

  // 2. Verify webhook signature
  const body = await request.text()
  const wh = new Webhook(secret)
  let event: ClerkWebhookEvent

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  // 3. Route by event type
  if (event.type === 'user.created') {
    const { id, email_addresses } = event.data
    const email = email_addresses?.[0]?.email_address

    if (!email) {
      return new Response('No email address on user', { status: 400 })
    }

    await createUser({ clerkId: id, email })
    logger.info('User created via Clerk webhook', { clerkId: id })
  } else if (event.type === 'user.updated') {
    const { id, first_name, last_name, image_url, username } = event.data
    const displayName = [first_name, last_name].filter(Boolean).join(' ') || null

    await syncUserFromClerk(id, {
      displayName,
      avatarUrl: image_url ?? null,
      username: username ?? null,
    })
    logger.info('User synced via Clerk webhook', { clerkId: id })
  } else if (event.type === 'user.deleted') {
    await softDeleteUser(event.data.id)
  } else {
    logger.info('Unhandled Clerk webhook event ignored', {
      eventType: event.type,
    })
  }

  return new Response(null, { status: 200 })
}
