'use client'

import { useSyncExternalStore } from 'react'

import type { GenerationRecord } from '@/types'
import type { ImageRecipeReading } from '@/types/image-recipe'
import {
  readImageRecipeAPI,
  readLibraryImageRecipeAPI,
  type ImageRecipeReadResponse,
} from '@/lib/api-client/image-recipe'

/**
 * 「从图读串」那一个勾选框的状态（owner 2026-10-25：工具行的键与拖到舞台上两种进法
 * 落到同一个框）。键在输入框里、拖放在舞台上、框挂在舞台上，三处不在一棵子树里，
 * 所以放在模块里一份，谁都能 `startImageRecipeImport(file)`。
 * 键先开「挑图」那一步（上传 / 拖入 / 最近素材 / 素材库，owner 10-25 补「从素材库选」），
 * 拖到舞台上的直接进读图。
 */

export type ImageRecipeImportState =
  | { status: 'idle' | 'picking' }
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
  if ('previewUrl' in state && state.previewUrl.startsWith('blob:'))
    URL.revokeObjectURL(state.previewUrl)
}

function read(
  previewUrl: string,
  request: () => Promise<ImageRecipeReadResponse>,
): void {
  revoke()
  const id = ++run
  set({ status: 'reading', previewUrl })
  void request().then((response) => {
    if (id !== run || state.status === 'idle') return
    set(
      response.success
        ? { status: 'ready', previewUrl, reading: response.data }
        : { status: 'error', previewUrl, error: response },
    )
  })
}

/** 工具行的键 / 手机「＋」里那一行：先开挑图那一步。 */
export function openImageRecipePicker(): void {
  run += 1
  revoke()
  set({ status: 'picking' })
}

export function startImageRecipeImport(file: File): void {
  if (!file.type.startsWith('image/')) return
  read(URL.createObjectURL(file), () => readImageRecipeAPI(file))
}

/** 素材库 / 最近素材里挑的一张：服务端按那一行读（文件自带 → 那一行记的配方 → 认标签）。 */
export function startImageRecipeImportFromGeneration(
  generation: GenerationRecord,
): void {
  if (generation.outputType !== 'IMAGE') return
  read(generation.thumbnailUrl ?? generation.url, () =>
    readLibraryImageRecipeAPI(generation.id),
  )
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
