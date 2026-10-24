import { describe, expect, it } from 'vitest'

import {
  conversationIdFromPath,
  isStudioShellPath,
  libraryCategoryFromPath,
  shellOverlayFromPath,
  studioBenchHref,
  studioConversationHref,
  studioShellRouteKind,
} from '@/lib/studio-shell-route'

describe('studio-shell-route', () => {
  it('classifies routes into home / bench / page', () => {
    expect(studioShellRouteKind('/studio')).toBe('home')
    expect(studioShellRouteKind('/studio/c/abc')).toBe('home')
    expect(studioShellRouteKind('/studio/image')).toBe('bench')
    expect(studioShellRouteKind('/studio/lora/library')).toBe('bench')
    expect(studioShellRouteKind('/studio/node')).toBe('bench')
    expect(studioShellRouteKind('/studio/audio')).toBe('page')
    expect(studioShellRouteKind('/library/assets')).toBe('library')
    expect(studioShellRouteKind('/u/me')).toBe('library')
  })

  it('knows what overlays the middle column: a library category or my profile', () => {
    expect(shellOverlayFromPath('/library/prompts')).toBe('prompts')
    expect(shellOverlayFromPath('/u/me')).toBe('profile')
    expect(shellOverlayFromPath('/u/someone')).toBeNull()
    expect(shellOverlayFromPath('/studio')).toBeNull()
  })

  it('reads the library category and knows which routes the shell owns', () => {
    expect(libraryCategoryFromPath('/library/cards')).toBe('cards')
    expect(libraryCategoryFromPath('/library/unknown')).toBeNull()
    expect(libraryCategoryFromPath('/studio/image')).toBeNull()
    expect(isStudioShellPath('/library/assets')).toBe(true)
    expect(isStudioShellPath('/studio')).toBe(true)
    expect(isStudioShellPath('/gallery')).toBe(false)
    expect(isStudioShellPath('/librarything')).toBe(false)
  })

  it('reads the conversation id out of /studio/c/<id>', () => {
    expect(conversationIdFromPath('/studio/c/abc')).toBe('abc')
    expect(conversationIdFromPath('/studio/c/a%20b')).toBe('a b')
    expect(conversationIdFromPath('/studio/c')).toBeNull()
    expect(conversationIdFromPath('/studio/image')).toBeNull()
  })

  it('builds the conversation address, falling back to home', () => {
    expect(studioConversationHref('abc')).toBe('/studio/c/abc')
    expect(studioConversationHref(null)).toBe('/studio')
  })

  it('carries the conversation onto a bench without dropping its own params', () => {
    expect(studioBenchHref('/studio/image', 'abc')).toBe('/studio/image?c=abc')
    expect(studioBenchHref('/studio/node?project=p1', 'abc')).toBe(
      '/studio/node?project=p1&c=abc',
    )
    expect(studioBenchHref('/studio/node?c=old', 'new')).toBe(
      '/studio/node?c=new',
    )
    expect(studioBenchHref('/studio/video', null)).toBe('/studio/video')
  })
})
