'use client'

import { useEffect, useState } from 'react'

import { getCharacterRecentActivityAPI } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { CharacterRecentActivity } from '@/types/character-growth'

/**
 * 角色总览「最近」那几张卡（角色大项目第 ① 步）：每位最近一件事，最多三位。
 * 读不到就是空（那一段不画），⛔ 为它弹错。`enabled` 为假时不读（手机总览没有这一段）。
 */
export function useCharacterRecentActivity(enabled: boolean) {
  const [rows, setRows] = useState<CharacterRecentActivity[]>([])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const cancel = deferEffectTask(() => {
      void getCharacterRecentActivityAPI().then((result) => {
        if (alive && result.success) setRows(result.data)
      })
    })
    return () => {
      alive = false
      cancel()
    }
  }, [enabled])

  return rows
}
