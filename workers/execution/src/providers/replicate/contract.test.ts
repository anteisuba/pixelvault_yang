/**
 * Replicate 契约测试（o-worker 第 7 步）：官方 HTTP 文档的预测对象喂解析代码。
 * 样本见 `contract-fixtures.json`；有真实返回时直接替换。
 */
import { describe, expect, it } from 'vitest'

import fixtures from './contract-fixtures.json'
import { completeReplicatePrediction, readReplicatePrediction } from './image'

describe('Replicate 契约', () => {
  it('官方列出的预测状态都认得', () => {
    for (const status of fixtures.predictionStatuses) {
      expect(
        readReplicatePrediction({ ...fixtures.predictionStarting, status })
          .status,
      ).toBe(status)
    }
  })

  it('排队中：读出 id', () => {
    expect(readReplicatePrediction(fixtures.predictionStarting)).toMatchObject({
      id: fixtures.predictionStarting.id,
      status: 'starting',
    })
  })

  it('成功：从 output 读出图片地址', () => {
    const prediction = readReplicatePrediction(fixtures.predictionSucceeded)
    expect(completeReplicatePrediction(prediction).imageUrl).toBe(
      fixtures.predictionSucceeded.output[0],
    )
  })
})
