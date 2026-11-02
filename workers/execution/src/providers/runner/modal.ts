import type { ExecutionEnv } from '../../index'
import { JSON_CONTENT_TYPE } from '../../lib/http'

export function modalRunnerRequest(
  env: ExecutionEnv,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
): Promise<Response> {
  if (!env.RUNNER_MODAL_URL || !env.RUNNER_MODAL_TOKEN) {
    throw new Error('RUNNER_MODAL_URL / RUNNER_MODAL_TOKEN are not configured.')
  }
  return fetch(`${env.RUNNER_MODAL_URL.replace(/\/$/, '')}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${env.RUNNER_MODAL_TOKEN}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
}
