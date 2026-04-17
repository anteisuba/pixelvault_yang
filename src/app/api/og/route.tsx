import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

import { getGenerationById } from '@/services/generation.service'
import { getCreatorProfile } from '@/services/user.service'

export const runtime = 'nodejs'

import {
  BRAND_ACCENT,
  BRAND_BG,
  BRAND_BORDER,
  BRAND_FG,
  BRAND_MUTED,
} from '@/lib/design-tokens'

const BRAND = 'PixelVault'
const BG = BRAND_BG
const FG = BRAND_FG
const MUTED = BRAND_MUTED
const ACCENT = BRAND_ACCENT
const BORDER = BRAND_BORDER

/**
 * Dynamic OG image generation.
 *
 * Usage:
 *   /api/og?type=generation&id=<generationId>
 *   /api/og?type=profile&username=<username>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type')

  if (type === 'generation') {
    return generateGenerationOG(searchParams.get('id'))
  }
  if (type === 'profile') {
    return generateProfileOG(searchParams.get('username'))
  }

  return new Response('Missing or invalid type parameter', { status: 400 })
}

// ─── Generation OG ──────────────────────────────────────────────

async function generateGenerationOG(id: string | null) {
  if (!id) {
    return new Response('Missing id', { status: 400 })
  }

  const generation = await getGenerationById(id)
  if (!generation || !generation.isPublic) {
    return fallbackOG()
  }

  const promptSnippet = generation.isPromptPublic
    ? generation.prompt.length > 120
      ? generation.prompt.slice(0, 117) + '...'
      : generation.prompt
    : 'AI-generated artwork'

  const isVideo = generation.outputType === 'VIDEO'

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: BG,
      }}
    >
      {/* Left: image preview */}
      <div
        style={{
          width: 630,
          height: 630,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f0efe8',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={generation.url}
          alt=""
          width={630}
          height={630}
          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        />
        {isVideo && (
          <div
            style={{
              position: 'absolute',
              bottom: 20,
              left: 20,
              backgroundColor: 'rgba(0,0,0,0.6)',
              color: '#fff',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 18,
              display: 'flex',
            }}
          >
            VIDEO
          </div>
        )}
      </div>

      {/* Right: metadata */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 40px',
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            width: 48,
            height: 4,
            backgroundColor: ACCENT,
            borderRadius: 2,
            display: 'flex',
          }}
        />

        {/* Prompt */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            marginTop: 24,
          }}
        >
          <p
            style={{
              fontSize: 28,
              color: FG,
              lineHeight: 1.4,
              fontFamily: 'serif',
              margin: 0,
            }}
          >
            {promptSnippet}
          </p>
        </div>

        {/* Model + dimensions */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 16,
                color: MUTED,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {generation.provider}
            </span>
            <span style={{ fontSize: 16, color: BORDER }}>|</span>
            <span
              style={{
                fontSize: 16,
                color: MUTED,
              }}
            >
              {generation.width} x {generation.height}
            </span>
          </div>

          {/* Brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: `1px solid ${BORDER}`,
              paddingTop: 16,
              marginTop: 8,
            }}
          >
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: FG,
                letterSpacing: -0.5,
              }}
            >
              {BRAND}
            </span>
            <span
              style={{
                fontSize: 14,
                color: ACCENT,
                textTransform: 'uppercase',
                letterSpacing: 2,
              }}
            >
              AI Gallery
            </span>
          </div>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  )
}

// ─── Profile OG ─────────────────────────────────────────────────

async function generateProfileOG(username: string | null) {
  if (!username) {
    return new Response('Missing username', { status: 400 })
  }

  const profile = await getCreatorProfile(username, null, 1, 4)
  if (!profile || 'private' in profile) {
    return fallbackOG()
  }

  const displayName = profile.displayName ?? profile.username

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: BG,
        padding: '48px 56px',
      }}
    >
      {/* Top: avatar + name + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatarUrl}
            alt=""
            width={80}
            height={80}
            style={{ borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              backgroundColor: BORDER,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 700,
              color: MUTED,
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: FG }}>
            {displayName}
          </span>
          <span style={{ fontSize: 18, color: MUTED }}>
            @{profile.username} · {profile.publicImageCount} works ·{' '}
            {profile.followerCount} followers
          </span>
        </div>
      </div>

      {profile.bio && (
        <p
          style={{
            fontSize: 20,
            color: MUTED,
            fontFamily: 'serif',
            marginTop: 20,
            lineHeight: 1.5,
          }}
        >
          {profile.bio.length > 140
            ? profile.bio.slice(0, 137) + '...'
            : profile.bio}
        </p>
      )}

      {/* Image grid preview */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 'auto',
          paddingTop: 24,
        }}
      >
        {profile.generations.slice(0, 4).map((g) => (
          <div
            key={g.id}
            style={{
              width: 240,
              height: 240,
              borderRadius: 16,
              overflow: 'hidden',
              border: `1px solid ${BORDER}`,
              display: 'flex',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={g.url}
              alt=""
              width={240}
              height={240}
              style={{ objectFit: 'cover', width: '100%', height: '100%' }}
            />
          </div>
        ))}
        {profile.generations.length === 0 && (
          <div
            style={{
              flex: 1,
              height: 240,
              borderRadius: 16,
              backgroundColor: '#f0efe8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: MUTED,
              fontSize: 20,
            }}
          >
            No public works yet
          </div>
        )}
      </div>

      {/* Brand footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${BORDER}`,
          paddingTop: 16,
          marginTop: 24,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: FG,
            letterSpacing: -0.5,
          }}
        >
          {BRAND}
        </span>
        <span
          style={{
            fontSize: 14,
            color: ACCENT,
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          Creator Profile
        </span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  )
}

// ─── Fallback ───────────────────────────────────────────────────

function fallbackOG() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BG,
        gap: 16,
      }}
    >
      <span
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: FG,
          letterSpacing: -1,
        }}
      >
        {BRAND}
      </span>
      <span
        style={{
          fontSize: 20,
          color: ACCENT,
          textTransform: 'uppercase',
          letterSpacing: 3,
        }}
      >
        AI Gallery & Creation Platform
      </span>
    </div>,
    { width: 1200, height: 630 },
  )
}
