// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { PROJECT_RULE_KIND_IDS } from '@/constants/assistant-operator'
import { fakeServer, renderHookWithApp } from '@/test/app-harness'
import type { ProjectRule } from '@/types/assistant-persona'

import { useProjectRules } from './use-project-rules'

const ok = (data: unknown) => Response.json({ success: true, data })

function rule(id: string, text: string): ProjectRule {
  return {
    id,
    scope: null,
    text,
    kind: PROJECT_RULE_KIND_IDS.sourceAllow,
    source: 'creator',
    createdAt: '2026-11-04T00:00:00.000Z',
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('useProjectRules', () => {
  it('首次加载还在路上时加了一条：回来的旧名单 ⛔ 盖掉刚加的那条', async () => {
    const old = rule('rule-old', 'danbooru')
    const added = rule('rule-new', 'pixiv')
    const stored = [old]
    let releaseFirstList!: () => void
    let listCalls = 0
    fakeServer()
      .on('GET', API_ENDPOINTS.ASSISTANT_RULES, () => {
        listCalls += 1
        const snapshot = [...stored]
        if (listCalls > 1) return ok(snapshot)
        return new Promise<Response>((resolve) => {
          releaseFirstList = () => resolve(ok(snapshot))
        })
      })
      .on('POST', API_ENDPOINTS.ASSISTANT_RULES, () => {
        stored.unshift(added)
        return ok(added)
      })

    const { result } = renderHookWithApp(() => useProjectRules())
    await waitFor(() => expect(listCalls).toBe(1))

    await act(async () => {
      await result.current.add({
        text: 'pixiv',
        kind: PROJECT_RULE_KIND_IDS.sourceAllow,
      })
    })
    expect(result.current.rules.map((r) => r.id)).toEqual(['rule-new'])

    await act(async () => releaseFirstList())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rules.map((r) => r.id)).toEqual([
      'rule-new',
      'rule-old',
    ])
  })
})
