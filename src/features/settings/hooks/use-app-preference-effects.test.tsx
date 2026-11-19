/**
 * 设置 › 偏好两颗开关的生效处：真 `useLocalPreference`、真状态信号总线
 * （`lib/generation-status-signal`），只假 `Notification` 与 `document.hidden`。
 */
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { REDUCE_MOTION_ATTRIBUTE } from '@/features/settings/constants'
import { reportGenerationStatus } from '@/lib/generation-status-signal'
import { message, renderHookWithApp } from '@/test/app-harness'

import {
  useGenerationCompleteNotifier,
  useReduceMotionPreference,
} from './use-app-preference-effects'

const NOTIFY_KEY = 'pixelvault:settings:notify-on-complete'
const MOTION_KEY = 'pixelvault:settings:reduce-motion'

/** 同页写偏好的那条广播（`useLocalPreference` 的 setter 也是这么做的）。 */
function setPreference(key: string, value: string) {
  act(() => {
    localStorage.setItem(key, value)
    window.dispatchEvent(new Event('pv:local-preference'))
  })
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
}

const shown: { title: string; body?: string }[] = []

beforeEach(() => {
  localStorage.clear()
  shown.length = 0
  vi.stubGlobal(
    'Notification',
    Object.assign(
      function Notification(
        this: { onclick: unknown; close: () => void },
        title: string,
        options?: NotificationOptions,
      ) {
        shown.push({ title, body: options?.body })
        this.onclick = null
        this.close = () => {}
      },
      { permission: 'granted' as NotificationPermission },
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  setHidden(false)
  document.documentElement.removeAttribute(REDUCE_MOTION_ATTRIBUTE)
})

const ok = (status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED') => ({
  success: true,
  data: { status },
})

describe('useGenerationCompleteNotifier', () => {
  it('开着 + 页面在后台：完成 / 失败各报一次，同一单反复读到终态不重报', () => {
    localStorage.setItem(NOTIFY_KEY, '1')
    setHidden(true)
    renderHookWithApp(() => useGenerationCompleteNotifier())

    reportGenerationStatus('image', 'job-1', ok('IN_PROGRESS'))
    reportGenerationStatus('image', 'job-1', ok('COMPLETED'))
    reportGenerationStatus('image', 'job-1', ok('COMPLETED'))
    reportGenerationStatus('video', 'job-2', ok('FAILED'))

    expect(shown.map((item) => item.title)).toEqual([
      message('Settings.notifications.done.image'),
      message('Settings.notifications.failed.video'),
    ])
    expect(shown[0]!.body).toBe(message('Settings.notifications.body'))
  })

  it('页面在前台 / 取消的 / 开关关着 → 不报', () => {
    setHidden(false)
    localStorage.setItem(NOTIFY_KEY, '1')
    const { unmount } = renderHookWithApp(() => useGenerationCompleteNotifier())
    reportGenerationStatus('audio', 'job-3', ok('COMPLETED'))
    setHidden(true)
    reportGenerationStatus('model3d', 'job-4', ok('CANCELLED'))
    expect(shown).toEqual([])
    unmount()

    localStorage.setItem(NOTIFY_KEY, '0')
    renderHookWithApp(() => useGenerationCompleteNotifier())
    reportGenerationStatus('image', 'job-5', ok('COMPLETED'))
    expect(shown).toEqual([])
  })

  it('同页把开关拨开，不刷新就生效', () => {
    setHidden(true)
    renderHookWithApp(() => useGenerationCompleteNotifier())
    reportGenerationStatus('image', 'job-6', ok('COMPLETED'))
    expect(shown).toEqual([])

    setPreference(NOTIFY_KEY, '1')
    reportGenerationStatus('image', 'job-7', ok('COMPLETED'))
    expect(shown).toHaveLength(1)
  })

  it('没拿到通知权限 → 安静不报', () => {
    vi.stubGlobal(
      'Notification',
      Object.assign(function Notification() {}, {
        permission: 'denied' as NotificationPermission,
      }),
    )
    localStorage.setItem(NOTIFY_KEY, '1')
    setHidden(true)
    renderHookWithApp(() => useGenerationCompleteNotifier())
    reportGenerationStatus('image', 'job-8', ok('COMPLETED'))
    expect(shown).toEqual([])
  })
})

describe('useReduceMotionPreference', () => {
  it('开 → <html> 挂 data-reduce-motion 并返回 true；同页关掉立即摘掉', () => {
    const root = document.documentElement
    const { result } = renderHookWithApp(() => useReduceMotionPreference())
    expect(result.current).toBe(false)
    expect(root.hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(false)

    setPreference(MOTION_KEY, '1')
    expect(result.current).toBe(true)
    expect(root.hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(true)

    setPreference(MOTION_KEY, '0')
    expect(result.current).toBe(false)
    expect(root.hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(false)
  })
})
