import { describe, expect, it } from 'vitest'

import {
  accountAvatarSrc,
  accountInitial,
  clerkAvatarToStore,
  isClerkDefaultAvatarUrl,
} from '@/lib/account-avatar'

function clerkUrl(payload: Record<string, string>): string {
  const segment = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `https://img.clerk.com/${segment}`
}

const DEFAULT_URL = clerkUrl({
  type: 'default',
  iid: 'ins_test',
  rid: 'user_test',
  initials: 'Y',
})
const UPLOADED_URL = clerkUrl({
  type: 'proxy',
  src: 'https://images.clerk.dev/uploaded/img_test',
})

describe('isClerkDefaultAvatarUrl', () => {
  it('⭐ Clerk 自动画的那张认得出来', () => {
    expect(isClerkDefaultAvatarUrl(DEFAULT_URL)).toBe(true)
    // 带查询串（Clerk 会拼 ?width= 之类）照样认。
    expect(isClerkDefaultAvatarUrl(`${DEFAULT_URL}?width=80`)).toBe(true)
  })

  it('⭐ 用户自己传的 / OAuth 带来的不算默认图', () => {
    expect(isClerkDefaultAvatarUrl(UPLOADED_URL)).toBe(false)
  })

  it('⛔ 认不出来的一律当真头像（不吞用户的图）', () => {
    expect(isClerkDefaultAvatarUrl('https://cdn.example.com/a.png')).toBe(false)
    expect(isClerkDefaultAvatarUrl('https://img.clerk.com/not-json')).toBe(
      false,
    )
    expect(isClerkDefaultAvatarUrl('https://img.clerk.com/')).toBe(false)
    expect(isClerkDefaultAvatarUrl('not a url')).toBe(false)
  })
})

describe('accountAvatarSrc', () => {
  it('没有 / 默认图 → null，真头像原样给', () => {
    expect(accountAvatarSrc(null)).toBeNull()
    expect(accountAvatarSrc(undefined)).toBeNull()
    expect(accountAvatarSrc('')).toBeNull()
    expect(accountAvatarSrc(DEFAULT_URL)).toBeNull()
    expect(accountAvatarSrc(UPLOADED_URL)).toBe(UPLOADED_URL)
  })
})

describe('clerkAvatarToStore', () => {
  it('⭐ 只有 Clerk 说他有图才存', () => {
    expect(clerkAvatarToStore(DEFAULT_URL, false)).toBeNull()
    expect(clerkAvatarToStore(UPLOADED_URL, true)).toBe(UPLOADED_URL)
    expect(clerkAvatarToStore(null, true)).toBeNull()
  })
})

describe('accountInitial', () => {
  it('取第一个字，英文转大写，按字符不劈半', () => {
    expect(accountInitial('yining')).toBe('Y')
    expect(accountInitial('  林小雨')).toBe('林')
    expect(accountInitial('😀 smile')).toBe('😀')
  })

  it('没名字 → null', () => {
    expect(accountInitial(null)).toBeNull()
    expect(accountInitial(undefined)).toBeNull()
    expect(accountInitial('   ')).toBeNull()
  })
})
