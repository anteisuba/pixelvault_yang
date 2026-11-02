import 'server-only'

import {
  CREDIT_GRANT_REASONS,
  CREDIT_LIMITS,
  USAGE_FUNDING,
} from '@/constants/credits'
import { isAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { Prisma } from '@/lib/generated/prisma/client'

/**
 * 平台点数的余额（`docs/design/platform-credits.md` §2.4–2.5）。
 *
 * - 余额 = `CreditGrant` 送的总数 − 账本里**平台出钱**那几行的 `points` 总数。⛔ 不另存余额：
 *   两个数一定会对不上。
 * - 自己 key 的花费（funding = byok）只记不扣（owner：「只显示不拦」）。
 * - admin（`ADMIN_USER_IDS`，即 owner）不受点数限制，但花费照样记账。
 */

type CreditReadClient = Pick<typeof db, 'creditGrant' | 'apiUsageLedger'>

export interface CreditBalance {
  grantedPoints: number
  spentPoints: number
  balancePoints: number
  /** admin：不受点数限制（余额照算，给 owner 看）。 */
  exempt: boolean
}

function toNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value.toString()) : 0
}

/** 点数不够时抛出：说清楚还剩多少、这次要多少，⛔ 不说「提供商错误」。 */
export class CreditsExhaustedError extends ApiRequestError {
  readonly code = 'CREDITS_EXHAUSTED' as const

  constructor(
    readonly balancePoints: number,
    readonly neededPoints: number,
  ) {
    super(
      'CREDITS_EXHAUSTED',
      402,
      'errors.creditsExhausted',
      `Not enough credits: ${balancePoints.toFixed(1)} left, this needs about ${neededPoints.toFixed(1)}.`,
    )
    this.name = 'CreditsExhaustedError'
  }
}

/**
 * 注册礼：每人一次（`dedupeKey` 唯一）。新用户与存量用户都在第一次读余额时补上，
 * 所以不用另写批量迁移、也不怕建用户的哪条路漏了。
 */
export async function ensureSignupGrant(userId: string): Promise<void> {
  await db.creditGrant.upsert({
    where: { dedupeKey: `${CREDIT_GRANT_REASONS.signup}:${userId}` },
    create: {
      userId,
      points: CREDIT_LIMITS.signupGrantPoints,
      reason: CREDIT_GRANT_REASONS.signup,
      dedupeKey: `${CREDIT_GRANT_REASONS.signup}:${userId}`,
    },
    update: {},
  })
}

/** 只读余额（不补注册礼）——放在锁里、事务里用。 */
export async function readCreditBalance(
  userId: string,
  client: CreditReadClient = db,
): Promise<Omit<CreditBalance, 'exempt'>> {
  const [granted, spent] = await Promise.all([
    client.creditGrant.aggregate({
      where: { userId },
      _sum: { points: true },
    }),
    client.apiUsageLedger.aggregate({
      where: { userId, funding: USAGE_FUNDING.platform },
      _sum: { points: true },
    }),
  ])
  const grantedPoints = toNumber(granted._sum.points)
  const spentPoints = toNumber(spent._sum.points)
  return {
    grantedPoints,
    spentPoints,
    balancePoints: Math.round((grantedPoints - spentPoints) * 1000) / 1000,
  }
}

/** 这个人的余额（顺手补注册礼）。设置页、LoRA 台、助手钱闸都读它。 */
export async function getCreditBalance(userId: string): Promise<CreditBalance> {
  await ensureSignupGrant(userId)
  const [balance, user] = await Promise.all([
    readCreditBalance(userId),
    db.user.findUnique({ where: { id: userId }, select: { clerkId: true } }),
  ])
  return { ...balance, exempt: user ? isAdmin(user.clerkId) : false }
}

/**
 * 平台出钱的对话（朋友用 owner 的 DeepSeek）开跑前查一次：余额 > 0 才放行。
 * 一轮对话花多少事先估不准（DeepSeek 一轮通常 < 1 点），所以只要求「还有」，
 * 最后一轮可能略微透支，结算照实记。admin 不拦。
 */
export async function assertCreditsLeft(userId: string): Promise<void> {
  const balance = await getCreditBalance(userId)
  if (balance.exempt) return
  if (balance.balancePoints <= 0) {
    throw new CreditsExhaustedError(balance.balancePoints, 0)
  }
}

export interface GrantCreditsInput {
  /** 收点的人：邮箱或用户名。 */
  recipient: string
  points: number
  note?: string
  grantedByUserId: string
}

/** admin 手动送点（owner 给朋友加额度）。只有 admin 能调，路由层已校验。 */
export async function grantCredits(input: GrantCreditsInput): Promise<{
  userId: string
  displayName: string | null
  balance: CreditBalance
}> {
  const recipient = input.recipient.trim()
  const user = await db.user.findFirst({
    where: {
      isDeleted: false,
      OR: [
        { email: { equals: recipient, mode: 'insensitive' } },
        { username: { equals: recipient, mode: 'insensitive' } },
      ],
    },
    select: { id: true, displayName: true, username: true },
  })
  if (!user) {
    throw new ApiRequestError(
      'CREDIT_RECIPIENT_NOT_FOUND',
      404,
      'errors.creditRecipientNotFound',
      'No user with that email or username.',
    )
  }
  await db.creditGrant.create({
    data: {
      userId: user.id,
      points: input.points,
      reason: CREDIT_GRANT_REASONS.ownerGift,
      note: input.note,
      grantedBy: input.grantedByUserId,
    },
  })
  return {
    userId: user.id,
    displayName: user.displayName ?? user.username,
    balance: await getCreditBalance(user.id),
  }
}
