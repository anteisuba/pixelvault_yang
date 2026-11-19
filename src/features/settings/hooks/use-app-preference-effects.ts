'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import {
  REDUCE_MOTION_ATTRIBUTE,
  SETTINGS_PREFERENCE_KEYS,
} from '@/features/settings/constants'
import { useLocalPreference } from '@/hooks/use-local-preference'
import { subscribeGenerationStatus } from '@/lib/generation-status-signal'

/**
 * 设置 › 偏好里那两颗开关**真正起作用的地方**（`MainProviders` 调用，整个 `(main)` 都在它下面）。
 * 偏好页本身只写 localStorage；这里读同一把 key（`useLocalPreference` 同页写入会广播），
 * 所以开关一拨立即生效，⛔ 不用刷新。
 */

/**
 * 减少动效：开 = `<html data-reduce-motion>`（globals.css 末尾的降级块同时认它），
 * 返回 true 让调用方把 `MotionConfig reducedMotion` 设成 `"always"`；
 * 关 = 跟随系统（`"user"`）。
 */
export function useReduceMotionPreference(): boolean {
  const [value] = useLocalPreference(SETTINGS_PREFERENCE_KEYS.reduceMotion)
  const reduce = value === '1'

  useEffect(() => {
    if (!reduce) return
    const root = document.documentElement
    root.setAttribute(REDUCE_MOTION_ATTRIBUTE, '')
    return () => root.removeAttribute(REDUCE_MOTION_ATTRIBUTE)
  }, [reduce])

  return reduce
}

/** 这台浏览器有没有通知这件事（老 Safari、部分 WebView 没有）。 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/**
 * 生成完成时通知：图 / 视频 / 音频 / 3D 任一单**完成或失败**、且页面不在前台时，
 * 弹一条浏览器通知。信号来自状态查询的统一出口（`lib/generation-status-signal.ts`），
 * ⛔ 各台不再各写一份。同一单只报一次（轮询会反复读到同一个终态）；取消的不报（是你自己点的）。
 * 权限只在偏好页打开开关那一刻请求；这里没拿到权限就安静不报。
 */
export function useGenerationCompleteNotifier(): void {
  const t = useTranslations('Settings')
  const [value] = useLocalPreference(SETTINGS_PREFERENCE_KEYS.notifyOnComplete)
  const enabled = value === '1'
  const notified = useRef(new Set<string>())

  useEffect(() => {
    if (!enabled || !isNotificationSupported()) return
    const seen = notified.current

    return subscribeGenerationStatus((signal) => {
      if (signal.status !== 'COMPLETED' && signal.status !== 'FAILED') return
      const id = `${signal.kind}:${signal.jobId}`
      if (seen.has(id)) return
      seen.add(id)
      if (!document.hidden) return
      if (Notification.permission !== 'granted') return

      const outcome = signal.status === 'COMPLETED' ? 'done' : 'failed'
      const notification = new Notification(
        t(`notifications.${outcome}.${signal.kind}`),
        { body: t('notifications.body'), tag: id },
      )
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    })
  }, [enabled, t])
}
