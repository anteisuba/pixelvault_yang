import { headers } from 'next/headers'
import type { UserJSON, WebhookEvent } from '@clerk/nextjs/server'
import { Webhook } from 'svix'

import {
  provisionVerifiedClerkUser,
  softDeleteUser,
} from '@/services/user.service'
import { logger } from '@/lib/logger'

function getVerifiedPrimaryEmail(data: UserJSON) {
  const primaryEmail = data.email_addresses.find(
    (emailAddress) => emailAddress.id === data.primary_email_address_id,
  )

  return primaryEmail?.verification?.status === 'verified' ? primaryEmail : null
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
  let event: WebhookEvent

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  // 3. Route by event type
  if (event.type === 'user.created' || event.type === 'user.updated') {
    const { id, first_name, last_name, image_url } = event.data
    const primaryEmail = getVerifiedPrimaryEmail(event.data)

    if (!primaryEmail) {
      logger.warn('Clerk user event skipped until primary email is verified', {
        clerkId: id,
        eventType: event.type,
      })
      return new Response(null, { status: 200 })
    }

    const displayName =
      [first_name, last_name].filter(Boolean).join(' ') || null

    await provisionVerifiedClerkUser({
      clerkId: id,
      email: primaryEmail.email_address,
      emailVerificationStatus: primaryEmail.verification?.status,
      displayName,
      avatarUrl: image_url ?? null,
    })
    logger.info('User provisioned via Clerk webhook', {
      clerkId: id,
      eventType: event.type,
    })
  } else if (event.type === 'user.deleted') {
    if (event.data.id) {
      await softDeleteUser(event.data.id)
    } else {
      logger.warn('Clerk user.deleted event missing user id')
    }
  } else {
    logger.info('Unhandled Clerk webhook event ignored', {
      eventType: event.type,
    })
  }

  return new Response(null, { status: 200 })
}
