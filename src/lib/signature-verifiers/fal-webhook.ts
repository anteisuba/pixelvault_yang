import 'server-only'

import {
  createPublicKey,
  createVerify,
  type JsonWebKey as NodeJsonWebKey,
} from 'node:crypto'

import { FAL_WEBHOOK } from '@/constants/execution'
import { ApiRequestError } from '@/lib/errors'

// ─── JWKS key cache ─────────────────────────────────────────────────────────

let _cachedJwks: NodeJsonWebKey[] | null = null
let _cacheExpiresAt = 0

async function fetchFalJwks(): Promise<NodeJsonWebKey[]> {
  const now = Date.now()
  if (_cachedJwks && now < _cacheExpiresAt) return _cachedJwks

  const response = await fetch(FAL_WEBHOOK.JWKS_URL, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`FAL JWKS fetch failed: HTTP ${response.status}`)
  }

  const jwks = (await response.json()) as { keys?: NodeJsonWebKey[] }
  const ed25519Keys = (jwks.keys ?? []).filter(
    (k) => k.kty === 'OKP' && k.crv === 'Ed25519',
  )

  if (ed25519Keys.length === 0) {
    throw new Error('FAL JWKS returned no Ed25519 keys')
  }

  _cachedJwks = ed25519Keys
  _cacheExpiresAt = now + FAL_WEBHOOK.JWKS_CACHE_TTL_MS
  return ed25519Keys
}

// ─── Signature verification ──────────────────────────────────────────────────

/**
 * Verify the Ed25519 signature on an incoming FAL webhook request.
 *
 * FAL signs with its private key, publishes the public key at JWKS_URL.
 * The signed message is the raw UTF-8 body bytes.
 * The signature is base64url-encoded in the `x-fal-signature-ed25519` header.
 *
 * Throws `ApiRequestError(401)` on any verification failure.
 */
export async function verifyFalWebhookSignature(
  rawBody: string,
  request: Request,
): Promise<void> {
  const sigHeader = request.headers.get(FAL_WEBHOOK.SIGNATURE_HEADER)

  if (!sigHeader) {
    throw new ApiRequestError(
      'MISSING_FAL_SIGNATURE',
      401,
      'errors.auth.unauthorized',
      'Missing FAL webhook signature.',
    )
  }

  // Decode base64url → raw bytes
  const signatureBytes = Buffer.from(
    sigHeader.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  )
  const bodyBytes = Buffer.from(rawBody, 'utf8')

  let jwks: NodeJsonWebKey[]
  try {
    jwks = await fetchFalJwks()
  } catch (err) {
    throw new ApiRequestError(
      'FAL_JWKS_UNAVAILABLE',
      502,
      'errors.common.unexpected',
      err instanceof Error ? err.message : 'Failed to fetch FAL public keys.',
    )
  }

  for (const jwk of jwks) {
    try {
      const publicKey = createPublicKey({ key: jwk, format: 'jwk' })
      const verifier = createVerify('Ed25519')
      verifier.update(bodyBytes)
      if (verifier.verify(publicKey, signatureBytes)) return
    } catch {
      // Malformed key in JWKS — try next
    }
  }

  throw new ApiRequestError(
    'INVALID_FAL_SIGNATURE',
    401,
    'errors.auth.unauthorized',
    'FAL webhook signature verification failed.',
  )
}
