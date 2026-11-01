import 'server-only'

import crypto from 'crypto'
import { db } from '@/lib/db'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'

// ─── Encryption ─────────────────────────────────────────────────
// Uses AES-256-GCM with a 32-byte key from CIVITAI_TOKEN_SECRET env var.
// Format stored: hex(iv):hex(authTag):hex(ciphertext)

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit IV recommended for GCM

function getEncryptionKey(): Buffer {
  const secret = process.env.CIVITAI_TOKEN_SECRET
  if (!secret) {
    throw new Error('CIVITAI_TOKEN_SECRET environment variable is not set')
  }
  // Accept 64-char hex (32 bytes) or raw 32-char string
  if (secret.length === 64 && /^[0-9a-fA-F]+$/.test(secret)) {
    return Buffer.from(secret, 'hex')
  }
  if (secret.length === 32) {
    return Buffer.from(secret, 'utf8')
  }
  throw new Error(
    'CIVITAI_TOKEN_SECRET must be a 64-char hex string or 32-char UTF-8 string',
  )
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(stored: string): string {
  const [ivHex, authTagHex, encHex] = stored.split(':')
  if (!ivHex || !authTagHex || !encHex) {
    throw new Error('Invalid encrypted token format')
  }
  const key = getEncryptionKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

// ─── Service Functions ───────────────────────────────────────────

export async function setCivitaiToken(
  clerkId: string,
  token: string,
): Promise<void> {
  const user = await ensureUser(clerkId)
  const encrypted = encrypt(token)
  await db.user.update({
    where: { id: user.id },
    data: { civitaiToken: encrypted },
  })
  logger.info('[CivitaiToken] Token saved', { userId: user.id })
}

export async function getCivitaiToken(clerkId: string): Promise<string | null> {
  const user = await ensureUser(clerkId)
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { civitaiToken: true },
  })
  if (!dbUser?.civitaiToken) return null
  try {
    return decrypt(dbUser.civitaiToken)
  } catch (err) {
    logger.error('[CivitaiToken] Decryption failed', { userId: user.id, err })
    return null
  }
}

export async function hasCivitaiToken(clerkId: string): Promise<boolean> {
  const user = await ensureUser(clerkId)
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { civitaiToken: true },
  })
  return !!dbUser?.civitaiToken
}

export async function deleteCivitaiToken(clerkId: string): Promise<void> {
  const user = await ensureUser(clerkId)
  await db.user.update({
    where: { id: user.id },
    data: { civitaiToken: null },
  })
  logger.info('[CivitaiToken] Token deleted', { userId: user.id })
}

/**
 * Fetch civitai token directly by internal DB userId (used by recipe compiler).
 */
export async function getCivitaiTokenByInternalUserId(
  userId: string,
): Promise<string | null> {
  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: { civitaiToken: true },
  })
  if (!dbUser?.civitaiToken) return null
  try {
    return decrypt(dbUser.civitaiToken)
  } catch (err) {
    logger.error('[CivitaiToken] Decryption failed (by internal userId)', {
      userId,
      err,
    })
    return null
  }
}

/**
 * Inject Civitai token into a LoRA URL that doesn't already have a token param.
 * Returns the URL unchanged if it's not a civitai.com URL or already has a token.
 */
export function injectCivitaiToken(url: string, token: string): string {
  if (!url.includes('civitai.com')) return url
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.has('token')) return url
    parsed.searchParams.set('token', token)
    return parsed.toString()
  } catch {
    return url
  }
}
