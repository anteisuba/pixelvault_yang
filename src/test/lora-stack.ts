import type { LoraAssetRecord } from '@/types'

/**
 * 真 `LoraStackProvider` 的起始挂载：它按登录用户读 localStorage 里的那一份。
 * 测试里 `@clerk/nextjs` 的 `useAuth` 回 `{ isLoaded: true, userId: LORA_STACK_CLERK_ID }`，
 * 再用这个把要的挂载写进去。
 */
export const LORA_STACK_CLERK_ID = 'clerk_lora_stack_test'

export function seedLoraStack(
  items: { asset: LoraAssetRecord; scale?: number; enabled?: boolean }[],
  clerkId = LORA_STACK_CLERK_ID,
) {
  window.localStorage.setItem(
    `pv.active-lora-stack.v2.${clerkId}`,
    JSON.stringify({ ownerClerkId: clerkId, items }),
  )
}

/** 一把能挂的 LoRA 记录（只填必填格）。 */
export function loraAsset(
  id: string,
  patch: Partial<LoraAssetRecord> = {},
): LoraAssetRecord {
  return {
    id,
    name: `LoRA ${id}`,
    styleCode: `pv-${id}`,
    source: 'imported',
    type: 'style',
    baseModelFamily: 'illustrious',
    provider: 'civitai',
    triggerWord: 'trig',
    loraUrl: `https://example.com/${id}.safetensors`,
    coverImageUrl: null,
    previewImageUrls: [],
    defaultScale: 0.8,
    isPublic: false,
    isOwn: false,
    createdAt: '2026-10-25T00:00:00.000Z',
    ...patch,
  } as LoraAssetRecord
}
