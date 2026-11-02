import {
  BROWSER_NETWORK_FAILURE_RE,
  TRANSPORT_ERROR_CODES,
  TRANSPORT_ERROR_I18N_KEYS,
  type TransportErrorCode,
} from '@/constants/transport-errors'
import type { AssistantOperatorMissingKey } from '@/types/assistant-operator'

/**
 * 错误字段的形状与「抛出来的东西 → 错误字段」（o-errors 第二轮，`docs/design/errors.md` §6）。
 * 单独一个文件、只依赖常量：显示层（`api-error-message.ts`）也要用，⛔ 别让它拖进
 * `shared.ts` 那串请求依赖。
 */

/** api-client 失败结果里的错误字段：显示层（`useErrorText`）只认这些。 */
export interface ApiErrorFields {
  /** 原话，只作诊断 / 「查看详情」；⛔ 不直接显示。 */
  error: string
  errorCode?: string
  i18nKey?: string
  traceId?: string
  detail?: string
  missingKey?: AssistantOperatorMissingKey
}

export function transportFields(
  code: TransportErrorCode,
  error: string,
): ApiErrorFields {
  return { error, errorCode: code, i18nKey: TRANSPORT_ERROR_I18N_KEYS[code] }
}

/**
 * `catch (error)` 里接到的异常 → 错误字段。浏览器断网、前台等待超时按事实打标；
 * 其余（JSON 解析失败、我们自己的程序异常）说成「意外错误」，原话只留作诊断。
 */
export function getThrownErrorFields(error: unknown): ApiErrorFields {
  // DOMException（超时 / 取消）在部分环境里不是 `instanceof Error`：按形状读。
  const shaped =
    typeof error === 'object' && error !== null
      ? (error as { name?: unknown; message?: unknown })
      : null
  const message =
    typeof shaped?.message === 'string'
      ? shaped.message
      : String(error ?? 'unknown')
  const name = typeof shaped?.name === 'string' ? shaped.name : ''
  if (name === 'TimeoutError') {
    return transportFields(TRANSPORT_ERROR_CODES.TIMEOUT, message)
  }
  if (name === 'AbortError') {
    return { error: message, errorCode: 'ABORTED' }
  }
  if (BROWSER_NETWORK_FAILURE_RE.test(message.trim())) {
    return transportFields(TRANSPORT_ERROR_CODES.NETWORK, message)
  }
  if (error instanceof ApiClientError) {
    return error.fields
  }
  return {
    error: message,
    errorCode: 'CLIENT_ERROR',
    i18nKey: 'errors.common.unexpected',
  }
}

/**
 * 要 `throw` 的失败结果（react-query 的 queryFn 等）：带着错误字段抛，显示层
 * `errText.thrown` 能读到 i18nKey，⛔ 别再 `throw new Error(result.error ?? '英文')`。
 */
export class ApiClientError extends Error {
  readonly fields: ApiErrorFields
  constructor(fields: Partial<ApiErrorFields> & { error?: string }) {
    super(fields.error ?? fields.errorCode ?? 'request failed')
    this.name = 'ApiClientError'
    this.fields = { ...fields, error: fields.error ?? this.message }
  }
}
