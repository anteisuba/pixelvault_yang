import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_MODEL_CANNOT_SEE_CODE,
  ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
  ASSISTANT_PROVIDER_ERROR_CODES,
} from '@/constants/assistant-operator'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { assistantKeySetupForError } from '@/lib/assistant-key-setup'

describe('assistantKeySetupForError', () => {
  it('一把 key 都没有 → 免费档那一家（Gemini）', () => {
    expect(assistantKeySetupForError({ errorCode: 'MISSING_API_KEY' })).toEqual(
      {
        kind: 'freeTier',
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
        modelLabel: 'Gemini 3.8 Flash',
      },
    )
  })

  it('选定的模型缺 key → 它那一家、那个型号（⛔ 不换别家）', () => {
    expect(
      assistantKeySetupForError({
        errorCode: ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
        missingKey: {
          adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
          modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
        },
      }),
    ).toEqual({
      kind: 'pinnedModel',
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
      modelLabel: 'DeepSeek V4 Pro',
    })
  })

  it('那一家的 key 被厂商拒了 → 重配它那一家；额度用完 → null（配 key 解决不了）', () => {
    const provider = {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
    }
    expect(
      assistantKeySetupForError({
        errorCode: ASSISTANT_PROVIDER_ERROR_CODES.authFailed,
        missingKey: provider,
      }),
    ).toMatchObject({ kind: 'pinnedModel', ...provider })
    expect(
      assistantKeySetupForError({
        errorCode: ASSISTANT_PROVIDER_ERROR_CODES.insufficientBalance,
        missingKey: provider,
      }),
    ).toBeNull()
  })

  it('缺 key 码却没说哪一家 / 看不了图 / 别的错 → null（配 key 解决不了，或说不清配哪家）', () => {
    expect(
      assistantKeySetupForError({
        errorCode: ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
      }),
    ).toBeNull()
    expect(
      assistantKeySetupForError({ errorCode: ASSISTANT_MODEL_CANNOT_SEE_CODE }),
    ).toBeNull()
    expect(assistantKeySetupForError({ errorCode: null })).toBeNull()
  })
})
