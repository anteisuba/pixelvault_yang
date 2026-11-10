import 'server-only'

import type {
  AssistantLoraParameters,
  AssistantOperatorLoraSetupConfirm,
  AssistantOperatorLoraCandidate,
  AssistantOperatorLoraMountCandidate,
} from '@/types/assistant-operator'
import {
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  ASSISTANT_OPERATOR_PENDING_LORA_PREFIX,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  resolveLibraryBaseModel,
  searchLoraLibraryCandidates,
  normalizeLoraNameKey,
} from '@/features/lora/server'
import {
  isLoraBaseModelMountCompatible,
  resolveLoraStackWeightBudget,
  getDefaultBase,
  getCompatibleBases,
  getBaseOnlyGenerationBases,
  hasVerifiedLoraTrigger,
} from '@/features/lora/core'
import { appendPromptFragments } from '@/lib/prompt-text-append'
import type { LoraCandidate } from '@/types/lora-candidate'
import {
  clamp,
  type OperatorRun,
  type ToolPlan,
  reject,
} from '@/features/assistant/services/assistant-operator-run.service'
import { checkLoraParameters } from '@/features/assistant/services/assistant-operator-planning.service'

/**
 * 助手执行器里的 **LoRA 装配台**：检索、挂上 / 卸下、调权重、一键配好、亮出候选。
 * 11-10 从 `assistant-operator.service.ts` 原样搬出（M4），行为不变。
 * ⚠ 执行器的文件都叫 `assistant-operator-*.service.ts`：钱闸测试按这个前缀收源码。
 */

// ─── LoRA 装配台（P4-C）─────────────────────────────────────────────

/**
 * 「这把 LoRA 装得上当前底模吗」。
 *
 * ⭐ 判据**必须与界面上那条警示行同源**（`summarizeLoraStackCompatibility` 用的
 * 就是这个谓词）：分叉的表现是助手说「这把没问题」而装配台上正亮着一行橙字。
 * ⚠ 底模还没定出来时不下判断（返回 true）—— 与界面一致（`selectedBaseFamily`
 * 为 null 时那条警示行整块不渲染）。状态块里会写明底模未定，助手因此知道
 * 「这句兼容性此刻没有依据」，⛔ 而不是读到一个假的「兼容」。
 */
function isLoraCompatibleWithBase(
  loraFamily: string | null,
  baseFamily: string | null,
): boolean {
  if (!baseFamily) return true
  if (!loraFamily) return false
  return isLoraBaseModelMountCompatible(loraFamily, baseFamily)
}

/**
 * `LoraCandidate` → 协议投影（见 `AssistantOperatorLoraCandidateSchema` 的头注）。
 *
 * ⛔ **`importPayload` 不进这里**：它只在真的要挂那一把时才需要。让每条候选都驮着
 * 它，等于把一串权重文件地址塞进日志、塞进上下文、再塞进历史。
 * ⚠ 搭配卡那一帧是唯一的例外，而且**由 `planLoraSetup` 自己补上那一格**（§12）
 * —— 它是「真的要挂那几把」的前一刻。⛔ 别因此把它挪进这个函数：这里的另一个
 * 调用方正是 `search_loras` 的步结果。
 */
function toLoraCandidateProjection(
  candidate: LoraCandidate,
  baseFamily: string | null,
): unknown {
  const thumbnailUrl = candidate.sampleImageUrls.find((url) =>
    url.startsWith('http'),
  )
  return {
    candidateId: candidate.candidateId,
    source: candidate.source,
    name: clamp(candidate.name, LIMITS.maxLabelChars),
    author: candidate.author
      ? clamp(candidate.author, LIMITS.maxLabelChars)
      : null,
    family: candidate.baseModelFamily,
    triggerWords: candidate.triggerWords
      .slice(0, LIMITS.maxSpecOptions)
      .map((word) => clamp(word, LIMITS.maxLabelChars)),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(candidate.pageUrl.startsWith('http')
      ? { pageUrl: candidate.pageUrl }
      : {}),
    downloads: candidate.downloads,
    licenseLabel: candidate.license.label
      ? clamp(candidate.license.label, LIMITS.maxLabelChars)
      : null,
    licenseKnown: candidate.license.known,
    commercialUse: candidate.license.commercialUse
      ? candidate.license.commercialUse.map((entry) =>
          clamp(entry, LIMITS.maxLabelChars),
        )
      : null,
    importable: candidate.importable,
    ...(candidate.notImportableReason
      ? { notImportableReason: candidate.notImportableReason }
      : {}),
    compatible: isLoraCompatibleWithBase(candidate.baseModelFamily, baseFamily),
    alreadyMounted: candidate.alreadyMounted,
    alreadyImported: candidate.alreadyImported,
    /**
     * 这一把该用多大权重 —— 与搭配卡取权重那一行**同一份回落**（作者推荐 → 1.0）。
     * ⛔ 别在界面上另算一次：两处分叉的表现是「卡上写 0.8、挂上去变成 1.0」。
     */
    defaultWeight: candidate.recommendedWeight ?? 1,
  }
}

/**
 * 一条候选讲给模型听的样子。
 *
 * ⭐ **三条判据必须一起出现**（拍板：「装不上的要么不推、要么明确标注原因」）：
 * 许可 · 底模兼容性 · 能不能导入。少任何一条，模型都会推荐一把用户挂不上的 LoRA，
 * 而那一下的代价不是「答错了」—— 是用户点了确认之后拿到 404 或者一张糊图。
 * ⚠ 许可 `unknown` **不软化**（与 `buildAssistantLoraCandidateDirective` 同一条）。
 */
function describeLoraCandidateForModel(
  candidate: LoraCandidate,
  baseFamily: string | null,
  index: number,
): string {
  const bits: string[] = [
    `candidateId=${candidate.candidateId}`,
    `"${clamp(candidate.name, LIMITS.maxLabelChars)}"`,
    candidate.author ? `by ${candidate.author}` : 'author unknown',
    `base ${candidate.baseModelFamily ?? 'UNRESOLVED'}`,
    candidate.license.known
      ? `licence ${candidate.license.label ?? (candidate.license.commercialUse?.join('/') || 'stated')}`
      : 'licence UNKNOWN (say so — do not call it fine)',
  ]
  if (!candidate.importable) {
    bits.push(
      `CANNOT BE IMPORTED (${candidate.notImportableReason ?? 'unknown reason'}) — recommendable only as "open it on its source page"`,
    )
  } else if (!isLoraCompatibleWithBase(candidate.baseModelFamily, baseFamily)) {
    bits.push(
      `WILL NOT LOAD on the selected base (${baseFamily}) — a different architecture; switching base is the only way to use it`,
    )
  }
  if (candidate.alreadyMounted) {
    bits.push('ALREADY ON THE BENCH — do not offer it as new')
  }
  if (candidate.triggerWords.length > 0) {
    bits.push(`triggers: ${candidate.triggerWords.join(', ')}`)
  }
  return `  ${index + 1}. ${bits.join(' · ')}`
}

export function planSearchLoras(
  run: OperatorRun,
  args: { query: string; limit?: number },
  userId: string,
): ToolPlan {
  if (!run.state.hasLoraControl) return reject(REJECT.noSuchControl)

  const limit = Math.min(
    args.limit ?? LIMITS.maxLoraResults,
    LIMITS.maxLoraResults,
  )
  const baseFamily = run.state.loraBaseFamily

  // 库页的底模筛选跟着设成这个值（客户端照载荷设，⛔ 自己再算一遍）。
  const libraryBaseModel = resolveLibraryBaseModel(baseFamily)

  return {
    kind: 'read',
    payload: {
      query: args.query,
      limit,
      ...(libraryBaseModel ? { baseModel: libraryBaseModel } : {}),
    },
    run: async () => {
      /**
       * ⭐ **照库页的条件搜**（lora-assistant §13.1）：客户端在这一步完成时把库页
       * 打开、按同一组条件搜给创作者看 —— 参数逐字相同，网格第一段就是这里拿到的
       * 这一组。`searchLoraLibraryCandidates` **永不抛**（单源失败翻成回执）。
       * ⚠ 底模按当前底模家族下推（库页的底模筛选跟着改），其余筛选用库页现在的。
       */
      const found = await searchLoraLibraryCandidates({
        userId,
        query: args.query,
        ...(baseFamily ? { baseModelFamily: baseFamily } : {}),
        ...(run.state.loraLibraryFilters
          ? { filters: run.state.loraLibraryFilters }
          : {}),
        limit,
        mountedNames: run.state.loras.map((item) => item.name),
      })
      run.loraSearchQuery = found.query || args.query

      const candidates = found.candidates.slice(0, limit)
      for (const candidate of candidates) {
        run.loraIndex.set(candidate.candidateId, candidate)
      }

      /**
       * ⚠ **空不是挂**：两个源里有一个挂了、还是两个都好好的但没命中，是两句不同
       * 的话。检索层本来就分得出来（每源一条回执），⛔ 别把它压成一句「没找到」。
       */
      const failed = found.sources.filter(
        (source) => source.status === 'failed',
      )
      const observation =
        candidates.length === 0
          ? failed.length > 0
            ? `search_loras("${args.query}") came back empty, and ${failed
                .map((source) => source.source)
                .join(
                  ' + ',
                )} actually FAILED this time — so "nothing exists" is not a safe conclusion. Say the search had trouble rather than telling the creator there is no such LoRA.`
            : `search_loras("${args.query}") found NOTHING on the library page (the creator sees the empty grid with its "relax one filter" buttons). Do not invent a candidateId. Try a different word, or ask which filter to relax.`
          : `search_loras("${args.query}") on the library page → ${candidates.length} candidate(s), the first cards of the grid the creator is looking at:\n${candidates
              .map((candidate, index) =>
                describeLoraCandidateForModel(candidate, baseFamily, index),
              )
              .join(
                '\n',
              )}\nRing up to three that load on this base with ${TOOL.showLoraPicks}; the creator mounts by clicking. Never recommend one marked CANNOT BE IMPORTED or WILL NOT LOAD without saying why in the same breath.`

      return {
        result: {
          totalFound: found.candidates.length,
          candidates: candidates.map((candidate) =>
            toLoraCandidateProjection(candidate, baseFamily),
          ),
          sources: found.sources.map((source) => ({
            source: source.source,
            status: source.status,
            count: source.count,
          })),
        },
        observation,
      }
    },
  }
}

/**
 * 栈总权重护栏（§5.2）：**只提醒，不动手**。
 *
 * 总权重 = **启用中**（`enabled !== false`）的挂载权重之和，含本次操作后的值 ——
 * 与 `handleGenerate` 的过滤口径逐字一致：静音的那把不进出图，也就不进预算。
 * 阈值取当前底模那一条的 `distilled` 档；底模未定时**不判**（没有底模就没有预算，
 * 同 `isLoraCompatibleWithBase` 在底模未定时不下判断）。
 *
 * ⛔ 不自动归一、⛔ 不改任何权重、⛔ 不拒这一步 —— 超预算是一句提醒，不是一道闸。
 */
function loraStackBudgetNote(
  run: OperatorRun,
  pending: { id: string; weight: number },
): string {
  const budget = resolveLoraStackWeightBudget(
    run.state.loraBaseFamily ? getDefaultBase(run.state.loraBaseFamily) : null,
  )
  if (budget === null) return ''

  let total = 0
  let counted = false
  for (const item of run.state.loras) {
    if (item.enabled === false) continue
    if (item.id === pending.id) {
      counted = true
      total += pending.weight
      continue
    }
    total += item.weight
  }
  // 挂载那一支此刻还不在栈上（`apply()` 在观察之后才跑）。
  if (!counted && !run.state.loras.some((item) => item.id === pending.id)) {
    total += pending.weight
  }

  const rounded = Math.round(total * 100) / 100
  if (rounded <= budget) return ''
  return ` The enabled LoRAs now add up to ${rounded}, over this base's budget of ${budget} — stacking past it tends to smear the image or bleed styles into each other. I did not touch any weight; tell me which one to dial back if you want it lower.`
}

/**
 * 挂载栈变了 → **重算「现在能切到哪些底模」**（2026-09-12 真机 bug）。
 *
 * LoRA 域的 `availableModels` 是「与挂载栈兼容的底模」，开跑时从快照取一次；同一轮
 * `unmount_lora` 之后它还停在旧栈上 —— 用户说「卸掉这把 LoRA，底模换回 Anima Base」，
 * 助手卸完却回「可用的底模仅有 Pony Diffusion V6」。
 *
 * ⭐ 判据与装配台底模选择器**逐字同源**（`LoraWorkbench.tsx` 的 `compatibleBases`）：
 * 栈非空按**第一把**的 baseModel 取 `getCompatibleBases`，栈空退回
 * `getBaseOnlyGenerationBases()`。⛔ 不另写一套（界面上点不到的选项不该出现在这里，
 * 反之亦然）。⛔ 也不按 `available` 再筛一道 —— 宿主送来的那份就没筛，筛了等于同一
 * 轮里列表换了语义。
 * ⚠ 标签优先沿用快照里那一份（界面上那一行，可能是 i18n 过的），目录名只兜底。
 */
function recomputeLoraAvailableBases(run: OperatorRun): void {
  if (run.request.domain !== ASSISTANT_PROTOCOL_DOMAIN_IDS.lora) return
  if (!run.state.hasModelControl) return

  const loraFamily = run.state.loras[0]?.family ?? null
  const bases = loraFamily
    ? getCompatibleBases(loraFamily)
    : getBaseOnlyGenerationBases()
  const labelById = new Map(
    run.state.availableModels.map((model) => [model.id, model.label]),
  )
  run.state.availableModels = bases.map((base) => ({
    id: base.id,
    label: labelById.get(base.id) ?? base.displayName,
  }))
}

/**
 * **把助手自己搭好的一套摆给创作者**（lora-assistant §12，owner 2026-09-28「一张卡
 * 全包」）：新挂几把 · 卸下哪几把 · 权重 a→b · 参数 a→b，一张卡、一颗「应用」。
 *
 * ⭐ 行都在这里按**快照**算好（名字、原值、装不装得上），⛔ 不让模型写；只列真的
 * 会变的那几处（与现状相同的权重 / 参数剥掉），剥完一处都不剩就拒 —— 一张什么都
 * 不会发生的卡只会让人白点一下。
 * ⚠ 助手那只手的闸与挂载同一套：装不上当前底模的（§4.2）、导不进库的，拒并说清
 *   出路；这张是「我替你搭好了」，搭进去一把装不上的就是搭错了。
 * ⚠ 已经挂着的候选不再「新挂」一遍：要调它的权重走 `weights`。
 */
export function planLoraSetup(
  run: OperatorRun,
  args: {
    question: string
    mounts?: { candidateId: string; weight?: number }[]
    unmounts?: { loraId: string }[]
    weights?: { loraId: string; weight: number }[]
    parameters?: AssistantLoraParameters
  },
): ToolPlan {
  if (!run.state.hasLoraControl) return reject(REJECT.noSuchControl)

  const baseFamily = run.state.loraBaseFamily
  const min = run.state.loraMinWeight
  const max = run.state.loraMaxWeight
  const rangeReject = () =>
    reject(REJECT.unknownValue, `Weight must be between ${min} and ${max}.`)
  const inRange = (weight: number) =>
    Number.isFinite(weight) && weight >= min && weight <= max
  const round = (weight: number) => Math.round(weight * 100) / 100
  const benchIds = () =>
    run.state.loras.length === 0
      ? ' Nothing is on the bench right now.'
      : ` On the bench right now (copy the id verbatim): ${run.state.loras
          .map(
            (item) => `${item.id} · ${clamp(item.name, LIMITS.maxLabelChars)}`,
          )
          .join(' | ')}.`

  const mounts: AssistantOperatorLoraSetupConfirm['mounts'] = []
  const seenCandidates = new Set<string>()
  for (const entry of args.mounts ?? []) {
    const candidate = run.loraIndex.get(entry.candidateId)
    if (!candidate) {
      return reject(
        REJECT.unknownLora,
        `"${clamp(entry.candidateId, LIMITS.maxLabelChars)}" is not one of the candidates ${TOOL.searchLoras} returned this turn. Only ids from this turn's search results can go on the card — search again if the one you have in mind is not among them.`,
      )
    }
    if (seenCandidates.has(candidate.candidateId)) continue
    seenCandidates.add(candidate.candidateId)
    const projection = {
      ...(toLoraCandidateProjection(
        candidate,
        baseFamily,
      ) as AssistantOperatorLoraCandidate),
      importPayload: candidate.importPayload,
    } as AssistantOperatorLoraMountCandidate
    const name = clamp(candidate.name, LIMITS.maxLabelChars)
    if (projection.alreadyMounted) continue
    if (!projection.importable || !candidate.importPayload) {
      return reject(
        REJECT.loraNotImportable,
        `"${name}" cannot be filed into the library, so it cannot go on the setup. Leave it out, or point the creator to its source page.`,
      )
    }
    if (!projection.compatible) {
      return reject(
        REJECT.loraIncompatibleBase,
        `"${name}" was built for ${clamp(candidate.baseModelFamily ?? 'another family', LIMITS.maxLabelChars)}, and the selected base is ${baseFamily ?? 'not set'} — it will not load. Search again within that family, or suggest switching the base first.`,
      )
    }
    const weight = entry.weight ?? projection.defaultWeight
    if (!inRange(weight)) return rangeReject()
    mounts.push({ candidate: projection, weight: round(weight) })
  }

  const unmounts: AssistantOperatorLoraSetupConfirm['unmounts'] = []
  const unmountIds = new Set<string>()
  for (const entry of args.unmounts ?? []) {
    const mounted = run.state.loras.find((item) => item.id === entry.loraId)
    if (!mounted) {
      return reject(
        REJECT.loraNotMounted,
        `That LoRA is not on the bench — the ids you can take off are the mounted-item ids in the state block.${benchIds()}`,
      )
    }
    if (unmountIds.has(mounted.id)) continue
    unmountIds.add(mounted.id)
    unmounts.push({
      loraId: mounted.id,
      name: clamp(mounted.name, LIMITS.maxLabelChars),
    })
  }

  const weights: AssistantOperatorLoraSetupConfirm['weights'] = []
  const weightIds = new Set<string>()
  for (const entry of args.weights ?? []) {
    const mounted = run.state.loras.find((item) => item.id === entry.loraId)
    if (!mounted) {
      return reject(
        REJECT.loraNotMounted,
        `That LoRA is not on the bench — the ids you can re-weight are the mounted-item ids in the state block.${benchIds()}`,
      )
    }
    if (unmountIds.has(mounted.id)) {
      return reject(
        REJECT.malformedArgs,
        `"${clamp(mounted.name, LIMITS.maxLabelChars)}" is both taken off and re-weighted on the same card — keep one of the two.`,
      )
    }
    if (!inRange(entry.weight)) return rangeReject()
    if (weightIds.has(mounted.id)) continue
    weightIds.add(mounted.id)
    const to = round(entry.weight)
    if (to === mounted.weight) continue
    weights.push({
      loraId: mounted.id,
      name: clamp(mounted.name, LIMITS.maxLabelChars),
      from: mounted.weight,
      to,
    })
  }

  let parameters: AssistantOperatorLoraSetupConfirm['parameters'] = null
  if (args.parameters && Object.keys(args.parameters).length > 0) {
    const checked = checkLoraParameters(run, args.parameters)
    if (!checked.ok) return checked.plan
    const patch: Record<string, unknown> = {}
    const previous: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(checked.patch)) {
      const before =
        run.state.loraParameters?.[key as keyof AssistantLoraParameters] ?? null
      if ((value ?? null) === before) continue
      patch[key] = value ?? null
      previous[key] = before
    }
    if (Object.keys(patch).length > 0) {
      parameters = {
        patch: patch as AssistantLoraParameters,
        previous: previous as AssistantLoraParameters,
      }
    }
  }

  if (
    mounts.length + unmounts.length + weights.length === 0 &&
    parameters === null
  ) {
    return reject(
      REJECT.malformedArgs,
      'Nothing on this card would change anything — every row already matches the bench. Put only what actually changes, or tell the creator it is fine as it is.',
    )
  }

  /**
   * 卡底那行读数：**应用之后**启用中的总权重 vs 这条底模的阈值（§5）。⚠ 底模未定 →
   * 整块缺席；超了只标红不拦（§5.2）。
   */
  const limit = resolveLoraStackWeightBudget(
    baseFamily ? getDefaultBase(baseFamily) : null,
  )
  const nextWeight = new Map(weights.map((row) => [row.loraId, row.to]))
  const total =
    run.state.loras.reduce(
      (sum, item) =>
        item.enabled === false || unmountIds.has(item.id)
          ? sum
          : sum + (nextWeight.get(item.id) ?? item.weight),
      0,
    ) + mounts.reduce((sum, row) => sum + row.weight, 0)

  return {
    kind: 'confirmLoraSetup',
    setup: {
      question: args.question,
      baseFamilyLabel: baseFamily
        ? clamp(baseFamily, LIMITS.maxLabelChars)
        : null,
      budget:
        limit === null ? null : { total: Math.round(total * 100) / 100, limit },
      mounts,
      unmounts,
      weights,
      parameters,
    },
  }
}

/**
 * 直接挂一把（只给新内核，`run.nextKernel`；owner 2026-10-22「助手可直接挂 LoRA 并挑权重」）。
 * ⚠ 与搭配卡那一行同一套闸：只收本轮搜到过的、装得上当前底模的、能导入的；权重同一份回落与值域。
 * ⚠ 导入与挂上都在浏览器那一侧（`ctx.lora.mount`），服务端只把候选抄进载荷。
 */
export function planMountLora(
  run: OperatorRun,
  args: { candidateId: string; weight?: number },
): ToolPlan {
  if (!run.state.hasLoraControl) return reject(REJECT.noSuchControl)
  const candidate = run.loraIndex.get(args.candidateId)
  if (!candidate)
    return reject(
      REJECT.unknownLora,
      `"${clamp(args.candidateId, LIMITS.maxLabelChars)}" is not one of the LoRAs found this turn.`,
    )
  const baseFamily = run.state.loraBaseFamily
  const projection = toLoraCandidateProjection(
    candidate,
    baseFamily,
  ) as AssistantOperatorLoraCandidate
  const name = clamp(candidate.name, LIMITS.maxLabelChars)
  /**
   * ⚠ 按**这一轮现在的台面**判（与 `search_loras` 标「已挂」同一把尺子），⛔ 不信候选上缓存的
   * `alreadyMounted`：那是搜的那一刻的样子 —— 同轮挂上之后再挂一次它仍是 false，台面多一行、
   * 浏览器那边按版本去重只挂一把，两边对不上（L2c 回放 11-03 发现）；反过来搜完又摘掉的，
   * 缓存说「已挂」会把挂回去拦住。
   */
  const nameKey = normalizeLoraNameKey(candidate.name)
  const mountedNow = run.state.loras.some(
    (item) =>
      item.id ===
        `${ASSISTANT_OPERATOR_PENDING_LORA_PREFIX}${candidate.candidateId}` ||
      normalizeLoraNameKey(item.name) === nameKey,
  )
  if (mountedNow)
    return reject(
      REJECT.repeatedStep,
      `"${name}" is already on the bench; change its weight with lora_weight instead.`,
    )
  if (!projection.importable || !candidate.importPayload)
    return reject(
      REJECT.loraNotImportable,
      `"${name}" cannot be filed into the library, so it cannot be mounted. Point the creator to its source page instead.`,
    )
  if (!projection.compatible)
    return reject(
      REJECT.loraIncompatibleBase,
      `"${name}" was built for ${clamp(candidate.baseModelFamily ?? 'another family', LIMITS.maxLabelChars)}, and the selected base is ${baseFamily ?? 'not set'} — it will not load. Switch the base first, or pick another.`,
    )
  const weight = args.weight ?? projection.defaultWeight
  if (
    !Number.isFinite(weight) ||
    weight < run.state.loraMinWeight ||
    weight > run.state.loraMaxWeight
  )
    return reject(
      REJECT.unknownValue,
      `Weight must be between ${run.state.loraMinWeight} and ${run.state.loraMaxWeight}.`,
    )
  const rounded = Math.round(weight * 100) / 100
  const importPayload = candidate.importPayload
  // ⚠ 与浏览器那条确认链同一个判据（`useLoraCandidateConfirm`）：只有核实过的触发词才写进正文。
  const triggerText = hasVerifiedLoraTrigger(importPayload)
    ? projection.triggerWords.join(', ').trim()
    : ''
  return {
    kind: 'mutate',
    payload: {
      candidateId: candidate.candidateId,
      name,
      weight: rounded,
      triggerWords: projection.triggerWords,
      family: projection.family,
      compatible: true,
      importPayload,
    },
    inverse: { candidateId: candidate.candidateId },
    observation: `Mounting "${name}" at ${rounded}${
      triggerText
        ? `; its trigger words (${triggerText}) are added to the prompt`
        : ''
    }. It is on the board now, marked as loading; it lands on the creator's bench in a few seconds. Do not mount it again.`,
    /**
     * ⭐ 台面同步（11-03 线上）：导入在浏览器那边，但这一轮后面的 look / 板子读的是
     * `run.state` —— 不记下来，模型看到的台面就是空的，以为没挂上，接着再挂（每挂一次多导入一条）。
     * 占位 id 带前缀，权重 / 摘除认得出它还在路上；名字照抄，同轮再搜会标「已挂」。
     */
    apply: () => {
      run.state.loras.push({
        id: `${ASSISTANT_OPERATOR_PENDING_LORA_PREFIX}${candidate.candidateId}`,
        name,
        weight: rounded,
        enabled: true,
        family: projection.family,
        compatible: true,
        triggerWord: projection.triggerWords.join(', ') || null,
        triggerEnabled: true,
        recommendedPrompt: null,
        sourcePrompts: [],
      })
      if (triggerText)
        run.state.prompt = appendPromptFragments(run.state.prompt, triggerText)
    },
  }
}

/**
 * 在库页的网格里圈几把（lora-assistant §13，owner 2026-09-29）。
 *
 * ⭐ `search_loras` 已经把库页打开、按同一组条件搜给
 * 创作者看了，这一步只给那几张卡加圈。挂不挂由他在卡上点 —— ⛔ 这里一把都不挂。
 * ⚠ 两道闸与搭配卡同源：只收本轮搜到过的（`unknownLora`），只收装得上当前底模的
 * （`loraIncompatibleBase`，理由里说「装不上的别圈，在回复里说为什么没推」）。
 * ⚠ 改动型：`inverse` = 撤掉圈；服务端没有状态要改（`apply` 空）。
 */
export function planShowLoraPicks(
  run: OperatorRun,
  args: { candidateIds: string[] },
): ToolPlan {
  if (!run.state.hasLoraControl) return reject(REJECT.noSuchControl)

  const picks: { candidateId: string; name: string }[] = []
  for (const candidateId of [...new Set(args.candidateIds)]) {
    const candidate = run.loraIndex.get(candidateId)
    if (!candidate) {
      return reject(
        REJECT.unknownLora,
        `"${clamp(candidateId, LIMITS.maxLabelChars)}" is not one of the candidates ${TOOL.searchLoras} returned this turn. Ring only what the search brought back — search again if the one you have in mind is not among them.`,
      )
    }
    if (
      !isLoraCompatibleWithBase(
        candidate.baseModelFamily,
        run.state.loraBaseFamily,
      )
    ) {
      return reject(
        REJECT.loraIncompatibleBase,
        `"${clamp(candidate.name, LIMITS.maxLabelChars)}" will not load on the selected base (${run.state.loraBaseFamily ?? 'unknown'}). Ring only ones that load, and say in your reply why this one was left out.`,
      )
    }
    picks.push({
      candidateId,
      name: clamp(candidate.name, LIMITS.maxLabelChars),
    })
  }

  const query = clamp(
    run.loraSearchQuery ?? picks[0]?.name ?? 'LoRA',
    LIMITS.maxLoraQueryChars,
  )
  return {
    kind: 'mutate',
    payload: { query, picks },
    inverse: { clear: true },
    observation: `Ringed ${picks.length} on the library page: ${picks
      .map((pick) => `"${pick.name}"`)
      .join(
        ', ',
      )}. Now say in one line each why these, and that they mount with the mount button on the card (don't quote a button label). Do not mount anything yourself.`,
    apply: () => {},
  }
}

/** 这一轮刚挂、还在导入的那一把：摘 / 调都等它落地（下一轮它有真 id）。 */
function pendingLoraDetail(name: string): string {
  return `"${name}" was mounted this turn and is still loading onto the bench — it has no bench id yet. Its weight is the one you mounted it with; change or remove it on the next turn.`
}

export function planUnmountLora(
  run: OperatorRun,
  args: { loraId: string },
): ToolPlan {
  if (!run.state.hasLoraControl) return reject(REJECT.noSuchControl)

  const index = run.state.loras.findIndex((item) => item.id === args.loraId)
  const mounted = index >= 0 ? run.state.loras[index] : undefined
  if (!mounted) {
    return reject(
      REJECT.loraNotMounted,
      'That LoRA is not on the bench. The ids you can unmount are the mounted-item ids in the state block — search results carry candidateIds, which are a different thing.',
    )
  }
  if (mounted.id.startsWith(ASSISTANT_OPERATOR_PENDING_LORA_PREFIX))
    return reject(REJECT.loraNotMounted, pendingLoraDetail(mounted.name))

  return {
    kind: 'mutate',
    payload: { loraId: mounted.id, name: mounted.name },
    // ⚠ 撤销要把它挂回原来的权重 —— 那条库记录由客户端在摘的一刻扣下来。
    inverse: { loraId: mounted.id, weight: mounted.weight },
    observation: `Took "${mounted.name}" off the bench. ${run.state.loras.length - 1} LoRA(s) left.`,
    apply: () => {
      run.state.loras.splice(index, 1)
      recomputeLoraAvailableBases(run)
    },
  }
}

export function planSetLoraWeight(
  run: OperatorRun,
  args: { loraId: string; weight: number },
): ToolPlan {
  if (!run.state.hasLoraControl) return reject(REJECT.noSuchControl)

  const mounted = run.state.loras.find((item) => item.id === args.loraId)
  if (!mounted) {
    return reject(
      REJECT.loraNotMounted,
      'That LoRA is not on the bench — the ids you can tune are the mounted-item ids in the state block.',
    )
  }
  if (mounted.id.startsWith(ASSISTANT_OPERATOR_PENDING_LORA_PREFIX))
    return reject(REJECT.loraNotMounted, pendingLoraDetail(mounted.name))
  if (
    !Number.isFinite(args.weight) ||
    args.weight < run.state.loraMinWeight ||
    args.weight > run.state.loraMaxWeight
  ) {
    return reject(
      REJECT.unknownValue,
      `Weight must be between ${run.state.loraMinWeight} and ${run.state.loraMaxWeight}.`,
    )
  }

  const previous = mounted.weight
  return {
    kind: 'mutate',
    payload: { loraId: mounted.id, name: mounted.name, weight: args.weight },
    inverse: { loraId: mounted.id, weight: previous },
    observation: `"${mounted.name}" is now at weight ${args.weight} (was ${previous}).${loraStackBudgetNote(
      run,
      { id: mounted.id, weight: args.weight },
    )}`,
    apply: () => {
      mounted.weight = args.weight
    },
  }
}

/**
 * `unmount_lora` / `set_lora_weight` 被 `malformedArgs` 拒时，**把现在挂着的那些列出来**
 * （2026-09-12 真机：两条各首发一次 `loraId: expected string, received undefined`，
 * 模型第二次才带上 id）。一句「loraId: Required」不可教 —— 它缺的不是形状是**那个 id**。
 * ⛔ 只给这两条工具：别的工具的参数与挂载栈无关。
 */
export function loraMountedIdsHint(
  run: OperatorRun,
  tool: AssistantOperatorTool,
): string {
  if (tool !== TOOL.unmountLora && tool !== TOOL.setLoraWeight) return ''
  if (run.state.loras.length === 0) {
    return ' Nothing is on the bench right now — there is no loraId to pass.'
  }
  return ` On the bench right now (copy the id verbatim): ${run.state.loras
    .map((item) => `${item.id} · ${clamp(item.name, LIMITS.maxLabelChars)}`)
    .join(' | ')}.`
}
