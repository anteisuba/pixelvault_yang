import 'server-only'

import {
  ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS,
  CANVAS_APPLY_OP_IDS,
  type AssistantOperatorReadStateArgs,
  type AssistantLoraParameters,
  type AssistantOperatorCharacterProfileDraft,
  type AssistantOperatorCharacterImagesDraft,
} from '@/types/assistant-operator'
import {
  type AssistantOperatorTool,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  isAssistantOperatorToolInDomain,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_TOOL_ARG_SHAPE_HINTS,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  type AssistantOperatorSearchKind,
  type AssistantResearchSource,
  type AssistantResearchDepth,
  type AssistantOperatorReferenceSlot,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  type AssistantOperatorDomain,
  type GenerationReviewState,
} from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import {
  type OperatorRun,
  type ToolPlan,
  reject,
  clamp,
} from '@/features/assistant/services/assistant-operator-run.service'
import {
  planSpecsPrecondition,
  planVideoSpecsPrecondition,
  planReadState,
  planSearchAssets,
  planSearchWebImages,
  planResearch,
  planReadUrl,
  planSearchWebVideos,
  planSearchWeb,
  planMountReference,
  planUnmountReference,
  planSetModel,
  planSetText,
  planSetSpecs,
  planSetVideoSpecs,
  planSetCount,
  planSetTagCharacters,
  planSetSceneTexts,
  planSetCapability,
  planMountAudioReference,
  planSetSound,
  planImportUserUrl,
  planSetLoraParameters,
} from '@/features/assistant/services/assistant-operator-planning.service'
import {
  loraMountedIdsHint,
  planSearchLoras,
  planMountLora,
  planUnmountLora,
  planSetLoraWeight,
  planShowLoraPicks,
  planLoraSetup,
} from '@/features/assistant/services/assistant-operator-lora.service'
import { planRequestGeneration } from '@/features/assistant/services/assistant-operator-generate.service'
import { planReadProjectRules } from '@/features/assistant/services/assistant-operator-memory.service'
import {
  planSetReviewState,
  planTagAsset,
  planFavoriteAsset,
  planCreateFolder,
  planAddToFolder,
  planProposeCharacterProfile,
  planProposeCharacterImages,
} from '@/features/assistant/services/assistant-operator-assets.service'
import {
  canvasNoOpReason,
  CANVAS_NO_OP_DETAIL,
  planCanvasApply,
  planCanvasBatch,
  planCanvasGenerate,
} from '@/features/assistant/services/assistant-operator-canvas.service'

/**
 * 助手执行器里的 **工具分派**：`planTool` 按工具名把一次调用交给各领域的规划函数（台面、LoRA、
 * 画布、库里写操作、项目规则……），新内核不再调用的旧工具在这里统一拒掉。
 * 11-10 从已删除的 `assistant-operator.service.ts` 原样搬出（M5），行为不变。
 * ⚠ 执行器的文件都叫 `assistant-operator-*.service.ts`：钱闸测试按这个前缀收源码。
 */

// ─── 工具分派 ───────────────────────────────────────────────────

export async function planTool(
  run: OperatorRun,
  tool: AssistantOperatorTool,
  rawArgs: unknown,
  userId: string,
): Promise<ToolPlan> {
  /**
   * ⭐ **域闸排在最前面**（P4-A，拍板 8）：这条工具压根不属于这个工作台时，
   * 后面每一道判断都是在回答一个不该被问的问题。理由用 `noSuchControl` ——
   * 与「这台机器上没这个控件」是同一件事，而它可教：助手读到之后会换一条路，
   * 而不是换个参数再撞一次。
   * ⚠ 系统提示里的工具表已经按域裁过（模型正常看不见域外的工具），这道闸是
   *    为「它照样编了一个」准备的 —— 提示词从来不是闸。
   */
  // 新内核在 LoRA 台上能直接挂（`run.nextKernel`）；别处照旧不在工具表里。
  const nextKernelMount =
    run.nextKernel === true &&
    tool === TOOL.mountLora &&
    run.request.domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.lora
  // 新内核在任何台上都能改素材库（第 4b 步），角色页也一样。
  const nextKernelLibrary =
    run.nextKernel === true && NEXT_KERNEL_LIBRARY_TOOLS.has(tool)
  if (
    !nextKernelMount &&
    !nextKernelLibrary &&
    !isAssistantOperatorToolInDomain(tool, run.request.domain)
  ) {
    return reject(
      REJECT.noSuchControl,
      `${tool} does not exist on this workbench. Use only the tools listed for you.`,
    )
  }

  // ⭐ 与参数无关的闸跑在 schema 之前 —— 见 `planSpecsPrecondition` 头注：
  //    这条工具在空档位下**无解**，让 schema 去抓只会吐一条模型学不会的
  //    `malformedArgs`。别把它挪到 `planSetSpecs` 里去，那已经在 schema 后面了。
  if (tool === TOOL.setSpecs) {
    const blocked = planSpecsPrecondition(run)
    if (blocked) return blocked
  }
  // 视频档同一个模式，判据不同（三张表里有一张非空即可）。
  if (tool === TOOL.setVideoSpecs) {
    const blocked = planVideoSpecsPrecondition(run)
    if (blocked) return blocked
  }

  const parsed = ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[tool].safeParse(rawArgs)
  if (!parsed.success) {
    /**
     * ⚠ 理由后面**接一份正确形状**（2026-09-12 实测第 9 步）：一句
     * 「text: Required」不可教，模型只会换个值再撞一次。形状表只覆盖实测撞过的
     * 那几条，缺席时照旧只报 issue（见 `ASSISTANT_OPERATOR_TOOL_ARG_SHAPE_HINTS`）。
     * ⚠ **issue 在前、形状在后**（2026-10-08 马尔福画布）：canvas_batch 那份形状
     *   一份就超过 `maxReasonChars`，放在前面时 issue 整段被截掉 —— 模型只读到
     *   通用形状、不知道错在哪，同一批原样再发一次，两步都是草稿然后被闸收尾。
     */
    const shape = ASSISTANT_OPERATOR_TOOL_ARG_SHAPE_HINTS[tool]
    /**
     * ⚠ 同一句只说一次（2026-10-09：一批两条 set_field 各带一份十几个字段的名单，
     * 300 字被两份名单占满，后面的提示与形状全被截掉）。
     */
    const pathsByMessage = new Map<string, string[]>()
    for (const issue of parsed.error.issues) {
      const paths = pathsByMessage.get(issue.message) ?? []
      paths.push(issue.path.join('.') || 'root')
      pathsByMessage.set(issue.message, paths)
    }
    const issues = [...pathsByMessage]
      .map(([message, paths]) => `${paths.join(', ')}: ${message}`)
      .join('; ')
    /**
     * ⚠ op 名写错时 zod 只报「Invalid input」（2026-10-08：一批 8 条全错、没说该写什么）。
     * 把合法的 op 名单接在后面。
     */
    const opNames =
      (tool === TOOL.canvasApply || tool === TOOL.canvasBatch) &&
      parsed.error.issues.some((issue) => issue.path.at(-1) === 'op')
        ? ` Valid op values: ${CANVAS_APPLY_OP_IDS.join(', ')}.`
        : ''
    const fieldHint =
      (tool === TOOL.canvasApply || tool === TOOL.canvasBatch) &&
      parsed.error.issues.some((issue) => issue.path.at(-1) === 'field')
        ? ' set_field only sets card labels; a prompt goes in set_prompt, a text card body in set_text, the model in set_model, generation settings in set_params.'
        : ''
    const mounted = loraMountedIdsHint(run, tool)
    /**
     * ⭐ 形状错是**同一步的草稿**（owner 2026-10-08：除了安全策略和额度，不该让用户
     * 看见报错）：退回给模型照着形状重写，时间线上是一行灰色草稿，⛔ 不是红字失败。
     * 连着两次同样的形状错仍由同类失败闸收尾，不会打转。
     */
    return {
      kind: 'rejected',
      reason: REJECT.malformedArgs,
      detail: clamp(
        `${issues}${opNames}${fieldHint}${shape ? ` — ${shape}` : ''}${mounted}`,
        LIMITS.maxReasonChars,
      ),
      quiet: true,
    }
  }

  // ⚠ `switch` 上的穷举：工具表加一条而这里没接，编译期就红（见文件末尾的
  //    `assertNever`）。别改成 if/else 链。
  switch (tool) {
    case TOOL.readState:
      return planReadState(run, parsed.data as AssistantOperatorReadStateArgs)
    case TOOL.searchAssets:
      return planSearchAssets(
        run,
        parsed.data as {
          query: string
          kind?: AssistantOperatorSearchKind
          limit?: number
        },
        userId,
      )
    case TOOL.searchWebImages:
      return planSearchWebImages(
        run,
        parsed.data as {
          query: string
          subject?: string
          preferOfficial?: boolean
          limit?: number
        },
        userId,
      )
    case TOOL.research:
      return planResearch(
        run,
        parsed.data as {
          goal: string
          entities?: string[]
          sources?: AssistantResearchSource[]
          onlySources?: string[]
          expandSources?: boolean
          depth?: AssistantResearchDepth
        },
        userId,
      )
    case TOOL.readUrl:
      return planReadUrl(run, parsed.data as { url: string; focus?: string })
    case TOOL.searchWebVideos:
      return planSearchWebVideos(
        run,
        parsed.data as { query: string; limit?: number },
      )
    case TOOL.searchWeb:
      return planSearchWeb(
        run,
        parsed.data as { query: string; limit?: number },
      )
    case TOOL.mountReference:
      return planMountReference(
        run,
        parsed.data as {
          assetId: string
          slot?: AssistantOperatorReferenceSlot
        },
        userId,
      )
    case TOOL.unmountReference:
      return planUnmountReference(
        run,
        parsed.data as {
          assetId?: string
          slotIndex?: number
          slot?: AssistantOperatorReferenceSlot
        },
      )
    case TOOL.setModel:
      return planSetModel(
        run,
        parsed.data as { modelId: string; channelId?: string },
      )
    case TOOL.setPrompt:
      return planSetText(
        run,
        ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
        parsed.data as Parameters<typeof planSetText>[2],
        userId,
      )
    case TOOL.setNegative:
      return planSetText(
        run,
        ASSISTANT_OPERATOR_CONFIRM_FIELDS.negative,
        parsed.data as Parameters<typeof planSetText>[2],
        userId,
      )
    case TOOL.setSpecs:
      return planSetSpecs(
        run,
        parsed.data as { aspectRatio: string; resolution: string },
      )
    case TOOL.setVideoSpecs:
      return planSetVideoSpecs(
        run,
        parsed.data as {
          durationSeconds?: number
          aspectRatio?: string
          resolution?: string
        },
      )
    case TOOL.setCount:
      return planSetCount(run, parsed.data as { count: number })
    case TOOL.setTagCharacters:
      return planSetTagCharacters(
        run,
        parsed.data as Parameters<typeof planSetTagCharacters>[1],
      )
    case TOOL.setSceneTexts:
      return planSetSceneTexts(
        run,
        parsed.data as Parameters<typeof planSetSceneTexts>[1],
      )
    case TOOL.setCapability:
      return planSetCapability(
        run,
        parsed.data as { key: string; value: string | number | boolean },
      )
    case TOOL.mountAudioReference:
      return planMountAudioReference(
        run,
        parsed.data as { assetId: string; ownerName?: string },
      )
    case TOOL.setSound:
      return planSetSound(run, parsed.data as { enabled: boolean })
    case TOOL.requestGeneration:
      return planRequestGeneration(run, parsed.data as { label?: string })
    case TOOL.importUserUrl:
      return planImportUserUrl(run, parsed.data as { url: string })
    case TOOL.searchLoras:
      return planSearchLoras(
        run,
        parsed.data as { query: string; limit?: number },
        userId,
      )
    /**
     * ⚠ `mount_lora` 只剩「搭配卡应用时客户端逐行挂」那一种步骤（lora-assistant
     * §13）：不在任何域的工具表里，域闸在前面就拒了，这里只为穷举。
     */
    case TOOL.mountLora:
      if (run.nextKernel)
        return planMountLora(
          run,
          parsed.data as { candidateId: string; weight?: number },
        )
      return reject(
        REJECT.noSuchControl,
        `Mounting is done by the creator. Ring candidates with ${TOOL.showLoraPicks}, or compose a setup with ${TOOL.planLoraSetup}.`,
      )
    case TOOL.unmountLora:
      return planUnmountLora(run, parsed.data as { loraId: string })
    case TOOL.setLoraParameters:
      return planSetLoraParameters(run, parsed.data as AssistantLoraParameters)
    case TOOL.setLoraWeight:
      return planSetLoraWeight(
        run,
        parsed.data as { loraId: string; weight: number },
      )
    case TOOL.readProjectRules:
      return planReadProjectRules(
        run,
        parsed.data as { scope?: AssistantOperatorDomain },
        userId,
      )
    case TOOL.showLoraPicks:
      return planShowLoraPicks(run, parsed.data as { candidateIds: string[] })
    case TOOL.planLoraSetup:
      return planLoraSetup(
        run,
        parsed.data as Parameters<typeof planLoraSetup>[1],
      )
    case TOOL.setReviewState:
      return planSetReviewState(
        run,
        parsed.data as {
          assetId: string
          state: GenerationReviewState
          reason?: string
        },
        userId,
      )
    /**
     * 素材库四条（§10）—— 它们**不吃 `run`**：准入是库（按 userId），⛔ 不是本轮
     * 检索名单，判据与 `set_review_state` 逐字同源（见那四个函数的组头注）。
     */
    case TOOL.tagAsset:
      return planTagAsset(
        parsed.data as { assetIds: string[]; tags: string[] },
        userId,
      )
    case TOOL.favoriteAsset:
      return planFavoriteAsset(
        parsed.data as { assetIds: string[]; value: boolean },
        userId,
      )
    case TOOL.createFolder:
      return planCreateFolder(
        parsed.data as { name: string; parentId?: string },
        userId,
      )
    case TOOL.addToFolder:
      return planAddToFolder(
        parsed.data as { assetIds: string[]; targetFolderId: string },
        userId,
      )
    // ── 画布三条（进度表 22）────────────────────────────────────
    case TOOL.canvasApply:
      const noOp = run.state.canvas
        ? canvasNoOpReason(run.state.canvas, parsed.data as NodeAssistantOpV4)
        : null
      if (noOp)
        return {
          kind: 'rejected',
          reason: REJECT.repeatedStep,
          detail: clamp(
            CANVAS_NO_OP_DETAIL.replace('{list}', noOp),
            LIMITS.maxReasonChars,
          ),
          quiet: true,
        }
      return planCanvasApply(run, parsed.data as NodeAssistantOpV4, userId)
    case TOOL.canvasBatch:
      return planCanvasBatch(
        run,
        (parsed.data as { ops: NodeAssistantOpV4[] }).ops,
        userId,
      )
    case TOOL.canvasGenerate:
      return planCanvasGenerate(run, parsed.data as { target: string })
    case TOOL.proposeCharacterProfile:
      return planProposeCharacterProfile(
        run,
        parsed.data as AssistantOperatorCharacterProfileDraft,
      )
    case TOOL.proposeCharacterImages:
      return planProposeCharacterImages(
        run,
        parsed.data as AssistantOperatorCharacterImagesDraft,
      )
    // 新内核改库（第 4b 步）自己落、自己出步骤，⛔ 不经这里。
    case TOOL.libraryWrite:
    /**
     * 旧内核才有的那几条（11-10 删掉实现）：新内核一处都不会把它们传进来（`kernel.ts`、`bench.ts`、
     * `library.ts` 与 v3 各服务里都没写到），前端只靠这些名字画历史里的过程行，所以名字留着。
     */
    case TOOL.addProjectRule:
    case TOOL.analyzeReferences:
    case TOOL.canvasLookAt:
    case TOOL.canvasPlanRerun:
    case TOOL.checkCharacterLook:
    case TOOL.critiqueResult:
    case TOOL.inspectAssetFolder:
    case TOOL.listAssetFolders:
    case TOOL.listContextCards:
    case TOOL.primeGenerate:
    case TOOL.proposeContextCard:
    case TOOL.readContextCard:
    case TOOL.recallEvidence:
      return reject(REJECT.noSuchControl, `${tool} is not planned here.`)
    default:
      return assertNever(tool)
  }
}

/** 新内核任何台都能用的素材库那几条（准入按 userId 查库，与台无关）。 */
const NEXT_KERNEL_LIBRARY_TOOLS: ReadonlySet<AssistantOperatorTool> = new Set([
  TOOL.tagAsset,
  TOOL.favoriteAsset,
  TOOL.createFolder,
  TOOL.addToFolder,
  TOOL.setReviewState,
])

function assertNever(value: never): never {
  throw new Error(`Unhandled assistant operator tool: ${String(value)}`)
}
