'use client'

import { useSyncExternalStore } from 'react'

import type { ImageRecipeReading } from '@/types/image-recipe'
import {
  readImageRecipeAPI,
  type ImageRecipeReadResponse,
} from '@/lib/api-client/image-recipe'

/**
 * 「从图读串」那一个勾选框的状态（owner 2026-10-25：工具行的键与拖到舞台上两种进法
 * 落到同一个框）。键在输入框里、拖放在舞台上、框挂在舞台上，三处不在一棵子树里，
 * 所以放在模块里一份，谁都能 `startImageRecipeImport(file)`。
 */

export type ImageRecipeImportState =
  | { status: 'idle' }
  | {
      status: 'reading' | 'ready' | 'error'
      /** 框顶那张小图。 */
      previewUrl: string
      reading?: ImageRecipeReading
      error?: Extract<ImageRecipeReadResponse, { success: false }>
    }

const IDLE: ImageRecipeImportState = { status: 'idle' }
let state: ImageRecipeImportState = IDLE
/** 换了一张图 / 关了框：迟到的结果作废。 */
let run = 0
const listeners = new Set<() => void>()

function set(next: ImageRecipeImportState) {
  state = next
  listeners.forEach((listener) => listener())
}

function revoke() {
  if (state.status !== 'idle') URL.revokeObjectURL(state.previewUrl)
}

export function startImageRecipeImport(file: File): void {
  if (!file.type.startsWith('image/')) return
  revoke()
  const id = ++run
  const previewUrl = URL.createObjectURL(file)
  set({ status: 'reading', previewUrl })
  void readImageRecipeAPI(file).then((response) => {
    if (id !== run || state.status === 'idle') return
    set(
      response.success
        ? { status: 'ready', previewUrl, reading: response.data }
        : { status: 'error', previewUrl, error: response },
    )
  })
}

export function closeImageRecipeImport(): void {
  run += 1
  revoke()
  set(IDLE)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state
const getServerSnapshot = () => IDLE

export function useImageRecipeImport(): ImageRecipeImportState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** 工具行的键 / 手机「＋」里那一行：弹系统选图，选中就开框。 */
export function pickImageRecipeFile(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) startImageRecipeImport(file)
  })
  input.click()
}
