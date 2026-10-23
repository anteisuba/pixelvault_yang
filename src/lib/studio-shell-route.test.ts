import { describe, expect, it } from 'vitest'

import {
  conversationIdFromPath,
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
