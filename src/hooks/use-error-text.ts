'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import {
  getApiErrorMessage,
  getGenerationErrorMessage,
  getThrownErrorMessage,
} from '@/lib/api-error-message'

interface ErrorPayloadLike {
  error?: string
  errorCode?: string
  i18nKey?: string
  hasReferenceImage?: boolean
}

/**
 * 错误显示的唯一入口（o-errors，`docs/design/errors.md`）：失败结果 / 抛出的异常 →
 * 当前语言的一句话。
 *
 * - `api`：一般接口（增删改、下载、上传）——后端 i18nKey，否则调用方那句 + 原话补充。
 * - `generation`：出图 / 视频 / 音频 / 3D —— 再按错误码与服务商原话分类。
 * - `thrown`：`catch (err)` 里的异常。
 *
 * ⛔ 别再写 `response.error ?? t('…')` / `err instanceof Error ? err.message : …`：
 *   那会把服务端或浏览器的英文原话原样摆到中文 / 日文界面上。
 */
export function useErrorText() {
  const tErrors = useTranslations('Errors')
  return useMemo(() => {
    // 测试里的 next-intl 替身常常没有 `has`：当作「这句没翻译」，回调用方那句。
    const t = Object.assign(
      (key: string, values?: Record<string, string>) => tErrors(key, values),
      {
        has: (key: string) =>
          typeof tErrors.has === 'function' ? tErrors.has(key) : false,
        raw: (key: string) =>
          typeof tErrors.raw === 'function' ? tErrors.raw(key) : undefined,
      },
    )
    return {
      api: (payload: ErrorPayloadLike, fallback: string) =>
        getApiErrorMessage(t, payload, fallback),
      generation: (payload: ErrorPayloadLike, fallback: string) =>
        getGenerationErrorMessage(t, payload, fallback),
      thrown: (error: unknown, fallback: string) =>
        getThrownErrorMessage(t, error, fallback),
    }
  }, [tErrors])
}
