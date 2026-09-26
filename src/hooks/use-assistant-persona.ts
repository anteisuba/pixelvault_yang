'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import { DURATION_MS } from '@/constants/motion'
import { deferEffectTask } from '@/lib/defer-effect-task'
import {
  getAssistantPersonaAPI,
  updateAssistantPersonaAPI,
  uploadAssistantAvatarAPI,
} from '@/lib/api-client'
import {
  toAssistantPersonaUpdate,
  type AssistantPersona,
  type UpdateAssistantPersonaRequest,
} from '@/types/assistant-persona'

/**
 * 助手设置（persona）的读 / 写 / 传头像
 * （`docs/references/pages/assistant-shell.md` §8）。
 *
 * ⚠ **初值不是 null 而是默认值**：库里没有那一行时服务返回的就是
 * `ASSISTANT_PERSONA_DEFAULTS`，所以对话框在拉到数据之前也能画出正确的初始态 ——
 * ⛔ 不做「加载中什么都不显示」的空窗（那一格永远是同一份默认值）。
 */

const DEFAULT_PERSONA: AssistantPersona = { ...ASSISTANT_PERSONA_DEFAULTS }

const personaListeners = new Set<(update: Partial<AssistantPersona>) => void>()

function publishPersona(update: Partial<AssistantPersona>) {
  for (const listener of personaListeners) listener(update)
}

export interface UseAssistantPersonaValue {
  persona: AssistantPersona
  isLoading: boolean
  isSaving: boolean
  error: string | null
  /** 写一整份（`PUT` 收完整形状）。返回是否成功，失败时 `error` 上有话说。 */
  save(input: UpdateAssistantPersonaRequest): Promise<boolean>
  /**
   * 传一张自定义头像。成功后整份重读一次：服务端顺手把头像单选表切到了
   * 「我上传的」，显示用的那张图也跟着换 —— 只补一格 URL 会和它对不上。
   */
  uploadAvatar(imageData: string): Promise<boolean>
  reload(): Promise<void>
}

export function useAssistantPersona(
  options: { enabled?: boolean } = {},
): UseAssistantPersonaValue {
  const enabled = options.enabled ?? true
  const [persona, setPersona] = useState<AssistantPersona>(DEFAULT_PERSONA)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 组件卸载之后别再 setState —— 对话框是关掉就走的那种。 */
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    const onChange = (update: Partial<AssistantPersona>) => {
      setPersona((current) => ({ ...current, ...update }))
    }
    personaListeners.add(onChange)
    return () => {
      personaListeners.delete(onChange)
      aliveRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    const result = await getAssistantPersonaAPI()
    if (!aliveRef.current) return
    setIsLoading(false)
    if (result.success) {
      setPersona(result.data)
      setError(null)
      return
    }
    setError(result.error)
  }, [])

  /**
   * ⚠ 走 `deferEffectTask`：React 19 的 lint 不允许在 effect 体里同步启动会
   * setState 的活（`react-hooks/set-state-in-effect`）。全仓既有 hook 都是这个
   * 形状（`use-collections.ts` 等），⛔ 别在这里另发明一套。
   */
  useEffect(() => {
    if (!enabled) return
    return deferEffectTask(() => {
      void reload()
    })
  }, [enabled, reload])

  const save = useCallback(async (input: UpdateAssistantPersonaRequest) => {
    setIsSaving(true)
    const result = await updateAssistantPersonaAPI(input)
    if (!aliveRef.current) return result.success
    setIsSaving(false)
    if (result.success) {
      publishPersona(result.data)
      setError(null)
      return true
    }
    setError(result.error)
    return false
  }, [])

  const uploadAvatar = useCallback(async (imageData: string) => {
    setIsSaving(true)
    const result = await uploadAssistantAvatarAPI(imageData)
    const fresh = result.success ? await getAssistantPersonaAPI() : null
    if (!aliveRef.current) return result.success
    setIsSaving(false)
    if (!result.success) {
      setError(result.error)
      return false
    }
    /** 重读失败也算传成功了 —— 图已经在库里，至少把那张图先换上。 */
    publishPersona(
      fresh?.success
        ? fresh.data
        : { avatarUrl: result.data.url, uploadedAvatarUrl: result.data.url },
    )
    setError(null)
    return true
  }, [])

  return {
    persona,
    isLoading,
    isSaving,
    error,
    save,
    uploadAvatar,
    reload,
  }
}

/** 右上角那一小行字的四态（助手设置 B：改了就存，没有「保存」键）。 */
export type AssistantPersonaSaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

/** 「已保存」停多久再淡出（动效表：停 1.5s）。 */
const SAVED_LINGER_MS = 1_500

export interface UseAssistantPersonaAutosaveValue {
  /** 服务端那一份 —— 只读的几格（显示用的头像、正在用的角色）读它。 */
  persona: AssistantPersona
  /** 控件上显示的那一份 = 服务端那份 + 还没落库的改动。 */
  draft: UpdateAssistantPersonaRequest
  status: AssistantPersonaSaveStatus
  isLoading: boolean
  /** 只改界面上那一格（打字）。离开输入框时 `commit()` 再存。 */
  edit(patch: Partial<UpdateAssistantPersonaRequest>): void
  /** 改几格并立刻存（点选类控件）。 */
  apply(patch: Partial<UpdateAssistantPersonaRequest>): void
  /** 整份换掉并立刻存（用角色 / 不用角色）。 */
  replace(next: UpdateAssistantPersonaRequest): void
  /** 把 `edit` 攒下的存掉（失焦 / 回车）。没改过就什么都不做。 */
  commit(): void
  /** 「没保存上 · 重试」。 */
  retry(): void
  uploadAvatar(imageData: string): Promise<boolean>
}

/**
 * **改了就存**（助手设置 B，owner 2026-09-26：没有「取消 / 保存」）。
 *
 * ⭐ 请求**排队、合并**：同一时刻只有一个 `PUT` 在路上，途中又改了就只记住最新
 * 那一份，前一个落地后再发 —— ⛔ 不并发：两个请求先发后到时，旧的那份会把新的
 * 盖掉，而用户看到的是「刚点的那一下被弹回去了」。
 * ⭐ 控件显示的是 `draft`（服务端那份 + 没落库的改动），落地后若没有正在打的字就
 * 回到服务端那份 —— 名字跟着角色走、显示用的头像这类服务端才算得出的格，这时
 * 才对得上。
 */
export function useAssistantPersonaAutosave(
  options: { enabled?: boolean } = {},
): UseAssistantPersonaAutosaveValue {
  const {
    persona,
    isLoading,
    save,
    uploadAvatar: uploadAvatarToServer,
  } = useAssistantPersona(options)
  const [overlay, setOverlay] = useState<UpdateAssistantPersonaRequest | null>(
    null,
  )
  const [status, setStatus] = useState<AssistantPersonaSaveStatus>('idle')
  const draft = overlay ?? toAssistantPersonaUpdate(persona)

  const inFlightRef = useRef(false)
  const queuedRef = useRef<UpdateAssistantPersonaRequest | null>(null)
  /** 打了字还没存（输入框里）。有它时落地后不回到服务端那份，免得吞掉正在打的字。 */
  const editingRef = useRef(false)
  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (lingerRef.current) clearTimeout(lingerRef.current)
    }
  }, [])

  const run = useCallback(
    async (request: UpdateAssistantPersonaRequest) => {
      if (inFlightRef.current) {
        queuedRef.current = request
        return
      }
      inFlightRef.current = true
      if (lingerRef.current) clearTimeout(lingerRef.current)
      setStatus('saving')
      const takeQueued = () => {
        const queued = queuedRef.current
        queuedRef.current = null
        return queued
      }
      let next: UpdateAssistantPersonaRequest | null = request
      let ok = true
      while (next) {
        ok = await save(next)
        if (!ok) break
        next = takeQueued()
      }
      inFlightRef.current = false
      if (!aliveRef.current) return
      if (!ok) {
        // 失败**留在原地**：控件上仍是用户刚选的那一份，「重试」发的就是它。
        setStatus('failed')
        return
      }
      if (!editingRef.current) setOverlay(null)
      setStatus('saved')
      lingerRef.current = setTimeout(() => {
        if (aliveRef.current) setStatus('idle')
      }, SAVED_LINGER_MS + DURATION_MS.base)
    },
    [save],
  )

  const edit = useCallback(
    (patch: Partial<UpdateAssistantPersonaRequest>) => {
      editingRef.current = true
      setOverlay({ ...draft, ...patch })
    },
    [draft],
  )

  const apply = useCallback(
    (patch: Partial<UpdateAssistantPersonaRequest>) => {
      const next = { ...draft, ...patch }
      editingRef.current = false
      setOverlay(next)
      void run(next)
    },
    [draft, run],
  )

  const replace = useCallback(
    (next: UpdateAssistantPersonaRequest) => {
      editingRef.current = false
      setOverlay(next)
      void run(next)
    },
    [run],
  )

  const commit = useCallback(() => {
    if (!editingRef.current) return
    editingRef.current = false
    void run(draft)
  }, [draft, run])

  const retry = useCallback(() => {
    void run(draft)
  }, [draft, run])

  const uploadAvatar = useCallback(
    async (imageData: string) => {
      if (lingerRef.current) clearTimeout(lingerRef.current)
      setStatus('saving')
      const ok = await uploadAvatarToServer(imageData)
      if (!aliveRef.current) return ok
      if (!ok) {
        setStatus('failed')
        return false
      }
      /** 传完服务端已切到「我上传的」—— 没落库的那份也跟上，免得下一次存把它切回去。 */
      setOverlay((current) =>
        current ? { ...current, avatarChoice: 'upload' } : current,
      )
      setStatus('saved')
      lingerRef.current = setTimeout(() => {
        if (aliveRef.current) setStatus('idle')
      }, SAVED_LINGER_MS + DURATION_MS.base)
      return true
    },
    [uploadAvatarToServer],
  )

  return {
    persona,
    draft,
    status,
    isLoading,
    edit,
    apply,
    replace,
    commit,
    retry,
    uploadAvatar,
  }
}
