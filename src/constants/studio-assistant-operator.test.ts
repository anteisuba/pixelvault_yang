import { describe, expect, it } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_FIELDS,
  STUDIO_OPERATOR_CHANGE_SUBJECT_BY_TOOL,
  studioOperatorChangeSubject,
} from '@/constants/studio-assistant-operator'

/**
 * **后果落在库里的那几条改动型工具**（2026-09-12 实测第 9 步）。
 *
 * 这张表同时是两处的判据，所以两处都钉住：
 *  ① checkpoint 薄卡上「已改 N 项：××」的后半句（⛔ 冒号后面不留空）；
 *  ② 「还原到这一步」那颗按钮的**负名单**（还原读的是工作台快照，而它们
 *     一颗旋钮都没动 —— 挂上去只会是一句「未保存完整配置，无法恢复」）。
 */
describe('库里那一档改动的标签表', () => {
  it('记规则 / 标审核态 / 素材库四条都在表里', () => {
    expect(
      studioOperatorChangeSubject(ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule),
    ).toBe('rule')
    expect(
      studioOperatorChangeSubject(ASSISTANT_OPERATOR_TOOL_IDS.setReviewState),
    ).toBe('reviewState')
    expect(
      studioOperatorChangeSubject(ASSISTANT_OPERATOR_TOOL_IDS.tagAsset),
    ).toBe('assetTags')
    expect(
      studioOperatorChangeSubject(ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset),
    ).toBe('assetFavorite')
    expect(
      studioOperatorChangeSubject(ASSISTANT_OPERATOR_TOOL_IDS.createFolder),
    ).toBe('assetFolder')
    expect(
      studioOperatorChangeSubject(ASSISTANT_OPERATOR_TOOL_IDS.moveAssets),
    ).toBe('assetMove')
  })

  it('⛔ 动表单的那些不在表里 —— 它们走登记簿的 field.*', () => {
    expect(
      studioOperatorChangeSubject(ASSISTANT_OPERATOR_TOOL_IDS.setPrompt),
    ).toBeNull()
    expect(
      studioOperatorChangeSubject(ASSISTANT_OPERATOR_TOOL_IDS.mountReference),
    ).toBeNull()
    expect(
      studioOperatorChangeSubject(ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate),
    ).toBeNull()
  })

  it('两张表不相交 —— 一格改动不能既是登记簿的字段又是库里那一档', () => {
    for (const subject of Object.values(
      STUDIO_OPERATOR_CHANGE_SUBJECT_BY_TOOL,
    )) {
      expect(STUDIO_OPERATOR_FIELDS).not.toContain(subject)
    }
  })
})
