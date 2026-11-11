import { fireEvent, within } from '@testing-library/react'
import { vi } from 'vitest'

import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import type { UserApiKeyRecord } from '@/types'

/**
 * 真 `ApiKeysProvider` + 真 `QuickSetupDialog` 的组件测试用。被测文件自己在
 * `@/lib/api-client` 上替掉 `listApiKeys / createApiKey / verifyApiKey / deleteApiKey`
 * （名单缓存按 Clerk userId 存，每例换一个 userId），再用这里的几样拼场景。
 */

/** 服务端回来的一把 key。 */
export function apiKeyRecord(
  overrides: Partial<UserApiKeyRecord> = {},
): UserApiKeyRecord {
  const adapterType = overrides.adapterType ?? AI_ADAPTER_TYPES.OPENAI
  return {
    id: 'key-1',
    modelId: 'model-1',
    adapterType,
    providerConfig: getDefaultProviderConfig(adapterType),
    label: `${adapterType} key`,
    maskedKey: 'sk-****1234',
    isActive: true,
    isDefault: false,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

/** `deferToIdle` 在 jsdom 里立刻跑：名单一挂上就去拉。 */
export function runIdleTasksImmediately(): void {
  vi.stubGlobal('requestIdleCallback', (task: () => void) => {
    task()
    return 1
  })
  vi.stubGlobal('cancelIdleCallback', () => {})
}

/** 此刻开着的那个配 key 弹窗（没开 = null）。 */
export function openQuickSetup(): HTMLElement | null {
  const input = document.getElementById('quick-setup-key')
  return input?.closest<HTMLElement>('[role="dialog"]') ?? null
}

/** 在开着的配 key 弹窗里填一把 key、按「验证」。 */
export function submitQuickSetup(
  verifyLabel: string | RegExp,
  key = 'sk-test-0123456789',
): void {
  const dialog = openQuickSetup()
  if (!dialog) throw new Error('配 key 弹窗没开')
  fireEvent.change(document.getElementById('quick-setup-key')!, {
    target: { value: key },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: verifyLabel }))
}
