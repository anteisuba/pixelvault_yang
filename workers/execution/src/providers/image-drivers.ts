import {
  isWorkerImageProviderId,
  WORKER_IMAGE_PROVIDER_MODES,
  type WorkerMultiStepImageProviderId,
  type WorkerSingleStepImageProviderId,
} from '../../../../src/constants/worker-image-providers'
import type { WorkerImageGenerationResult } from '../index'
import { falImageDriver } from './fal/image'
import { generateGeminiImage } from './gemini/image'
import { generateHuggingFaceImage } from './huggingface/image'
import { ideogramImageDriver } from './ideogram/image'
import { type ReportStage, runMultiStepDriver } from './multi-step'
import { novelAiImageDriver } from './novelai/image'
import { generateOpenAIImage } from './openai/image'
import { generatePixAiImage } from './pixai/image'
import { replicateImageDriver } from './replicate/image'
import { runnerImageDriver } from './runner/image'
import type {
  ImageDriverRuntime,
  MultiStepImageDriver,
  SingleStepImageDriver,
} from './types'
import { generateVolcEngineImage } from './volcengine/image'
import type { WorkflowStep } from 'cloudflare:workers'

/**
 * 出图驱动表（o-worker 第 3、4 步）。键就是共享契约
 * `src/constants/worker-image-providers.ts` 里的服务商：契约里多一家、这里没写驱动，
 * 类型检查直接报错。每家的实现在 `providers/<名字>/image.ts`；步骤名一律沿用上线时的名字。
 *
 * 一次请求就拿回图的（`single-step`）：
 */
export const SINGLE_STEP_IMAGE_DRIVERS: Record<
  WorkerSingleStepImageProviderId,
  SingleStepImageDriver
> = {
  gemini: { stepName: 'generate-gemini-image', generate: generateGeminiImage },
  huggingface: {
    stepName: 'generate-huggingface-image',
    generate: generateHuggingFaceImage,
  },
  // 火山国内站和 BytePlus 国际站同一套 Ark 出图 API，站点按 providerBaseUrl 区分，共用一个步骤名。
  volcengine: {
    stepName: 'generate-volcengine-image',
    generate: generateVolcEngineImage,
  },
  byteplus: {
    stepName: 'generate-volcengine-image',
    generate: generateVolcEngineImage,
  },
  novelai: novelAiImageDriver,
  pixai: { stepName: 'generate-pixai-image', generate: generatePixAiImage },
  openai: { stepName: 'generate-openai-image', generate: generateOpenAIImage },
}

export function getSingleStepImageDriver(
  providerId: string,
): SingleStepImageDriver | null {
  if (!isWorkerImageProviderId(providerId)) return null
  if (WORKER_IMAGE_PROVIDER_MODES[providerId] !== 'single-step') return null
  return SINGLE_STEP_IMAGE_DRIVERS[
    providerId as WorkerSingleStepImageProviderId
  ]
}

export type RunMultiStepImageDriver = (
  step: WorkflowStep,
  runtime: ImageDriverRuntime,
  reportStage: ReportStage,
) => Promise<WorkerImageGenerationResult>

export function bindMultiStepImageDriver<TJob, TPoll, TDone>(
  driver: MultiStepImageDriver<TJob, TPoll, TDone>,
): RunMultiStepImageDriver {
  return (step, runtime, reportStage) =>
    runMultiStepDriver(step, runtime, driver, reportStage)
}

/** 先提交再轮询的（`multi-step`），跑通用流程 `runMultiStepDriver`： */
export const MULTI_STEP_IMAGE_DRIVERS: Record<
  WorkerMultiStepImageProviderId,
  RunMultiStepImageDriver
> = {
  fal: bindMultiStepImageDriver(falImageDriver),
  ideogram: bindMultiStepImageDriver(ideogramImageDriver),
  replicate: bindMultiStepImageDriver(replicateImageDriver),
  runner: bindMultiStepImageDriver(runnerImageDriver),
}

export function getMultiStepImageDriver(
  providerId: string,
): RunMultiStepImageDriver | null {
  if (!isWorkerImageProviderId(providerId)) return null
  if (WORKER_IMAGE_PROVIDER_MODES[providerId] !== 'multi-step') return null
  return MULTI_STEP_IMAGE_DRIVERS[providerId as WorkerMultiStepImageProviderId]
}
