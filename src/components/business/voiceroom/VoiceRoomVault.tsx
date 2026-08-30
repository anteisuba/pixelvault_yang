'use client'

import { useTranslations } from 'next-intl'

import type { VoiceLineRecord } from '@/types/voiceroom'

import { VoiceAvatar } from './VoiceAvatar'

/**
 * 素材库抽屉 —— 这个房间已经录下来的声音。
 *
 * 它回答的不是「有哪些台词」（那是聊天流的事），而是**「我刚才生成的东西存下来了
 * 吗」**。owner 2026-08-29 拍板生成即落库、无需保存，那这件事就得在界面上看得见，
 * 否则「无需保存」只是一句没人相信的承诺。
 *
 * ⚠ 只收**已经出声**的台词：还在生成、失败的那些不在这里，它们还不是素材。
 */

const VAULT_WAVE = [70, 45, 80, 55, 72, 60]

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** 抽屉里只放一句话的头，长的截断——完整的那句在上面的聊天流里。 */
function snippet(text: string): string {
  return [...text].length > 12 ? `${[...text].slice(0, 12).join('')}…` : text
}

interface VoiceRoomVaultProps {
  lines: VoiceLineRecord[]
  open: boolean
}

export function VoiceRoomVault({ lines, open }: VoiceRoomVaultProps) {
  const t = useTranslations('VoiceRoom')
  const takes = lines.filter((line) => line.audio?.status === 'COMPLETED')

  return (
    <div className="vr-vault" data-open={open || undefined} aria-hidden={!open}>
      {/*
       * ⚠ 这层 wrapper 不能省：`grid-template-rows: 0fr → 1fr` 的写法要求内容装在
       * 一个 `overflow: hidden` 的孩子里，否则 0fr 的行照样被内容撑开，抽屉根本收
       * 不起来。
       */}
      <div className="vr-vault-inner">
        <div className="vr-vault-row">
          {takes.map((line, index) => (
            <div
              key={line.id}
              className="vr-vault-card"
              style={{ '--vr-d': index } as React.CSSProperties}
            >
              <VoiceAvatar
                id={line.speakerId}
                name={line.speakerName}
                cover={line.speakerCover}
                kind={line.speakerKind}
                size="s"
              />
              <span className="vr-vault-meta">
                <span className="vr-vault-name">
                  {line.speakerName} · {snippet(line.text)}
                </span>
                <span className="vr-vault-sub">
                  {formatDuration(line.audio?.duration ?? null)} ·{' '}
                  {line.emotion
                    ? t(`emotion.${line.emotion}`)
                    : t('emotion.auto')}
                </span>
              </span>
              <span className="vr-vault-wave" aria-hidden>
                {VAULT_WAVE.map((height, bar) => (
                  <i
                    key={bar}
                    style={{ '--h': height } as React.CSSProperties}
                  />
                ))}
              </span>
            </div>
          ))}

          <span className="vr-vault-note">
            {takes.length === 0 ? t('vaultEmpty') : t('vaultNote')}
          </span>
        </div>
      </div>
    </div>
  )
}
