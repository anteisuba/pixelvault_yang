/**
 * 线程 ↔ 可读历史的**纯函数层**（P4-B）。
 *
 * 三个方向，一个都不许多带东西：
 *  ① `toOperatorHistory`      线程条目 → 可读痕迹（**丢掉一切可操作态**）
 *  ② `toStoredOperatorMessages` / `fromStoredOperatorMessages`  痕迹 ↔ 库里的 messages
 *  ③ `historyToOperatorMessages` / `historyToPriorSteps`  痕迹 → 下一轮请求的语境
 *
 * ⭐ ① 的出口类型（`StudioOperatorHistoryEntry`）在结构上装不下 `inverse` /
 * `payload` / `primed`，所以「可操作态不复活」不是这里的自觉，是编译器的结论。
 * 详见 `types/studio-operator-history.ts` 的头注。
 *
 * ⚠ 写成纯函数而不是 hook 里的内联逻辑：这一层的每一条断言（零 base64、零
 * inverse、`running` 不落库、撤销痕迹留而按钮不留）都要能在单测里逐条钉住。
 */

import type { StudioOperatorCheckpoint } from '@/types/studio-operator-checkpoint'
import type { ReferenceVisualProfile } from '@/types/assistant-reference-analysis'
import {
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOLS,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  type AssistantOperatorDomain,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_HISTORY } from '@/constants/studio-assistant-operator'
import {
  ASSISTANT_CONVERSATION_LIMITS,
  type AssistantConversationMessageStored,
} from '@/types/assistant-conversation'
import type {
  AssistantOperatorMessage,
  AssistantOperatorPriorStep,
  AssistantOperatorStep,
} from '@/types/assistant-operator'
import type { StudioOperatorThreadEntry } from '@/types/studio-assistant-operator'
import {
  StudioOperatorHistoryEntrySchema,
  type StudioOperatorHistoryEntry,
} from '@/types/studio-operator-history'

/**
 * 一条日志展开后的那行详情（查询词 / 命中数 / 写进去的值……）。
 *
 * ⚠ **日志条与历史序列化共用这一份**：抄成两份的下场是刷新前后同一步的详情
 * 不一样，而那种不一致没有任何人会去查。
 */
export function describeOperatorStepDetail(
  step: AssistantOperatorStep,
): string | null {
  if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) return null
  switch (step.tool) {
    case ASSISTANT_OPERATOR_TOOL_IDS.readState:
      return step.result?.digest ?? null
    case ASSISTANT_OPERATOR_TOOL_IDS.searchAssets: {
      const hits = step.result?.totalFound
      const listed = step.result?.assets.length ?? 0
      return [
        `"${step.payload.query}"`,
        hits === null || hits === undefined ? null : `· ${hits}`,
        `· ${listed}`,
      ]
        .filter(Boolean)
        .join(' ')
    }
    case ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders: {
      const folders = step.result?.folders ?? []
      return [`"${step.payload.query}"`, `· ${folders.length}`]
        .concat(
          folders.length > 0
            ? [`· ${folders.map((folder) => folder.path).join(', ')}`]
            : [],
        )
        .join(' ')
    }
    case ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder:
      return [
        step.result?.folder.path,
        `· ${step.result?.inspectedImages ?? 0}/${step.result?.totalImages ?? 0}`,
        `· ${step.result?.batchCount ?? 0} batch(es)`,
        step.result?.truncated ? '· partial' : '· complete',
      ]
        .filter(Boolean)
        .join(' ')
    case ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages: {
      // 详情里列**域名**：候选格子上只有图，看不出来自哪儿，而「这是从哪个站
      // 拿的」正是用户决定要不要收下它的依据。
      const domains = [
        ...new Set(
          (step.result?.images ?? []).map((image) => image.domain ?? 'web'),
        ),
      ]
      return [`"${step.payload.query}"`, `· ${step.result?.totalFound ?? 0}`]
        .concat(domains.length > 0 ? [`· ${domains.join(', ')}`] : [])
        .join(' ')
    }
    /**
     * 联网查文字（切片 3b）。详情列**出处**，与搜图那条列域名同一条论据：
     * 折叠行上只有一句「查了 3 条」，而用户要判断的是「它信的是哪几个站」。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.searchWeb: {
      const publishers = [
        ...new Set(
          (step.result?.results ?? []).map((entry) => entry.publisher ?? 'web'),
        ),
      ]
      return [`"${step.payload.query}"`, `· ${step.result?.totalFound ?? 0}`]
        .concat(publishers.length > 0 ? [`· ${publishers.join(', ')}`] : [])
        .join(' ')
    }
    /**
     * 有目标的检索（2026-09-06）。详情列**轮次 + 打了哪几组源 + 出处**：
     * 折叠行上只有一句「查了一次」，而用户要判断的是「它打了哪儿、信了谁」——
     * 与搜图列域名、`search_web` 列出处是同一条论据。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.research: {
      const publishers = [
        ...new Set((step.result?.evidence ?? []).map((item) => item.publisher)),
      ]
      return [
        `"${step.payload.goal}"`,
        `· round ${step.payload.round}`,
        `· ${step.payload.sources.join(', ')}`,
        `· ${step.result?.totalFound ?? 0}`,
      ]
        .concat(publishers.length > 0 ? [`· ${publishers.join(', ')}`] : [])
        .join(' ')
    }
    /**
     * 读正文（2026-09-06）。详情列**地址 + 带着什么问题去读的** ——
     * 「他读了哪一页」与「他找的是什么」是用户复核这一步的两件事。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.readUrl:
      return [
        step.payload.url,
        step.payload.focus ? `· ${step.payload.focus}` : null,
      ]
        .filter(Boolean)
        .join(' ')
    /**
     * 翻证据本（§7.3）—— 那一行写的是**编号**，⛔ 不是正文：正文有上千字，
     * 而日志条上那一行的工作是「他去翻了哪几条」。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence:
      return step.payload.refs.join(' ')
    case ASSISTANT_OPERATOR_TOOL_IDS.setPrompt:
    case ASSISTANT_OPERATOR_TOOL_IDS.setNegative:
      return `${step.payload.mode} · ${step.payload.value}`
    case ASSISTANT_OPERATOR_TOOL_IDS.setModel:
      return step.payload.modelLabel ?? step.payload.modelId
    case ASSISTANT_OPERATOR_TOOL_IDS.setSpecs:
      return `${step.payload.aspectRatio} · ${step.payload.resolution}`
    /**
     * ⚠ 三格里**只印有值的那些**：`null` 的那格是「这个模型不吃这个参数」，
     * 印成 `null · 16:9 · null` 只会让人以为助手把它清掉了。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs:
      return (
        [
          step.payload.durationSeconds === null
            ? null
            : `${step.payload.durationSeconds}s`,
          step.payload.aspectRatio,
          step.payload.resolution,
        ]
          .filter(Boolean)
          .join(' · ') || null
      )
    case ASSISTANT_OPERATOR_TOOL_IDS.setCount:
      return String(step.payload.count)
    case ASSISTANT_OPERATOR_TOOL_IDS.mountReference:
      return step.payload.label ?? step.payload.assetId
    /** 归属写出来 —— `@AudioN` 那个 N 对不上谁，多角色对白就是一锅粥。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference:
      return [
        step.payload.label ?? step.payload.assetId,
        step.payload.ownerName,
      ]
        .filter(Boolean)
        .join(' · ')
    case ASSISTANT_OPERATOR_TOOL_IDS.setSound:
      return step.payload.enabled ? 'on' : 'off'
    case ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate:
      return null
    /**
     * 请求发送（§6 花钱档）—— 详情是**卡上写的那三样**（模型 · N 张 · 规格）。
     * ⚠ 预估金额有意不进这一行：它在硬确认卡上，而那张卡是决定发生的地方；
     * 日志里再写一遍只会让「当时到底确认了多少」出现第二个说法。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration:
      return [
        step.payload.model.label,
        `${step.payload.count}`,
        step.payload.specs.aspectRatio,
        step.payload.specs.resolution,
        step.payload.specs.durationSeconds === null
          ? null
          : `${step.payload.specs.durationSeconds}s`,
      ]
        .filter(Boolean)
        .join(' · ')
    /**
     * ⚠ 看图那一条的详情就是评价本身，而评价长在**评价卡**上（拍板 6）——
     * 日志条只会拿到被拒的那一支，那一支根本走不到这里。
     * 这里返回 `null` 而不是攒一段摘要：攒了就是同一份内容的第二个说法。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult:
      return null
    case ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences:
      return step.result?.brief?.summary ?? null
    /** 详情写**源地址**：那是用户自己粘的那一串，他一眼认得出接的是不是这条。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl:
      return step.payload.url
    /**
     * 找 LoRA（P4-C）。
     *
     * ⭐ 详情里印**每个源各回了几条**，而不是只印一个总数：两个上游里有一个挂了、
     * 还是两个都好好的但没命中，是两句不同的话（「空不是挂」）。总数掩盖掉的正是
     * 用户最该知道的那一半 —— 拍板 18 的「候选与放弃理由」在这一档就长这样。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.searchLoras: {
      const sources = (step.result?.sources ?? []).map(
        (source) => `${source.source} ${source.status}(${source.count})`,
      )
      return [`"${step.payload.query}"`, `· ${step.result?.totalFound ?? 0}`]
        .concat(sources.length > 0 ? [`· ${sources.join(', ')}`] : [])
        .join(' ')
    }
    /**
     * ⚠ 挂载详情**恒印三件事**：底模家族 / 兼容判定 / 默认权重。
     *
     * ⭐ 兼容那一行不是报警，是**留证**：跨族挂载在 `planMountLora` 就被拒了，
     * 走到日志的必然兼容 —— 正因为如此才要印，省掉之后日志里再也分不出
     * 「判过且通过」与「根本没判」。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.mountLora:
      return [
        step.payload.name,
        `· ${step.payload.family ?? 'unknown base'}`,
        `· ${step.payload.compatible ? 'fits' : 'does not fit'}`,
        `· ${step.payload.weight}`,
      ].join(' ')
    case ASSISTANT_OPERATOR_TOOL_IDS.unmountLora:
      return step.payload.name
    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight:
      return `${step.payload.name} · ${step.payload.weight}`
    /** 规则两条（§10）：读的显示条数，记的显示原文 —— 用户认的是那句话。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules:
      return `${step.result?.rules.length ?? 0}`
    case ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule:
      return step.payload.text
    /**
     * 上下文卡两条（K1）：列表显示张数，读全文显示**卡名** —— 用户认的是那个
     * 名字，不是 uuid。卡没找到时那一步的 `result` 是 null，显示空。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.listContextCards:
      return `${step.result?.cards.length ?? 0}`
    case ASSISTANT_OPERATOR_TOOL_IDS.readContextCard:
      return step.result?.name ?? ''
    /**
     * 提议一张卡（§8.1）—— 详情写**卡名**：这一步通常不出 step（它的产出是
     * 确认卡那一帧），但契约上它是一条读类工具，落进历史时该说得出提的是哪张卡。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard:
      return step.payload.name
    /**
     * 摆一张 LoRA 推荐卡（lora-assistant §10.2.2）—— 详情写**摆了几把**：这一步
     * 通常不出 step（产出是确认卡那一帧），落进历史时该说得出摆了多少个候选。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick:
      return `${step.payload.candidateIds.length}`
    /**
     * 标审核态（切片 Y）—— 详情写**理由**，⛔ 不写 assetId：那串 uuid 用户核对
     * 不了，而「为什么否掉」正是他事后要读的那一句。没给理由时不画详情行。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.setReviewState:
      return step.payload.reason ?? null
    /**
     * 素材库四条（§10）—— 详情写**这一步动了什么、动了几件**，⛔ 不写那一串
     * assetId：uuid 用户核对不了，而「它把 12 张收藏了」正是他事后要读的那句。
     * ⚠ 建夹子写**夹子名**（同上一条的理由：用户认的是名字，不是 id）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.tagAsset:
      return `${step.payload.tags.join(', ')} · ${step.payload.assetIds.length}`
    case ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset:
      return `${step.payload.value ? '★' : '☆'} ${step.payload.assetIds.length}`
    case ASSISTANT_OPERATOR_TOOL_IDS.createFolder:
      return step.payload.name
    case ASSISTANT_OPERATOR_TOOL_IDS.moveAssets:
      return `${step.payload.targetFolderName} · ${step.payload.assetIds.length}`
  }
}

/**
 * 问题卡答复那一行的**自包含正文**（v2 §3.4 落账规则，2026-09-12 真机 bug）。
 *
 * ⭐ 题面写在句子里，⛔ 不是「你选了 X」：那句话只有在**紧跟着问题卡**时才读
 * 得懂，而它要去的地方是三轮之后的一段对话 —— 那里没有卡，只有这一句。
 * ⚠ 这是**给模型与库看的那一份**：界面上那一行照旧走 i18n 词表
 * （`StudioOperator.system.questionAnswered`），两边有意不共用一句话。
 */
export function describeQuestionAnswerText(
  question: string,
  label: string,
): string {
  const asked = question.trim()
  const picked = label.trim()
  return asked
    ? `已选择「${picked}」（针对问题「${asked}」）`
    : `已选择「${picked}」`
}

/**
 * 上下文卡确认卡上那一下的**题面**（§3.4 落账规则，2026-09-12 真机 bug）。
 *
 * ⭐ 卡名写在句子里：这句话要去的地方是三轮之后的一段对话，那里没有那张确认卡，
 * 只有这一句 —— 「用户对哪张卡表过态」必须自包含。
 */
export function describeContextCardProposalText(cardName: string): string {
  return `提议记住上下文卡「${cardName.trim()}」`
}

/**
 * 「存这张卡」/「不用」那一行的**自包含正文**。
 *
 * ⭐ 判据与 `describeQuestionAnswerText` 逐字同源：从前那一下只落一行「已存上下
 * 文卡 X」，那一行不进 `messages` —— 于是模型看到的是一条从未被回应的「记一下」，
 * 每开一条流就重提同一张卡（真机：用户问别的事，回回先被拦一张「记住这张卡？」）。
 */
export function describeContextCardDecisionText(
  cardName: string,
  label: string,
): string {
  const named = cardName.trim()
  const picked = label.trim()
  return named
    ? `已选择「${picked}」（针对${describeContextCardProposalText(named)}）`
    : `已选择「${picked}」`
}

/**
 * 这条地址进得了库吗 —— **只有 http(s)**。
 *
 * ⛔ `data:` 与 `blob:` 一律挡掉：前者是 base64 本体（schema 注释明令 messages
 * 里不许有），后者是本地对象地址，存进去下次加载必然是死链。
 * ⚠ 这里挡一道、`types/studio-operator-history.ts` 的 schema 再挡一道 ——
 * 不是重复：这里挡是为了让那张图**安静地不进历史**，schema 挡是为了让写错的
 * 载荷**吵闹地失败**。
 */
function isPersistableUrl(url: string | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}

/**
 * 一条线程条目 → 一条可读痕迹。返回 `null` = 这一条不进历史。
 *
 * 不进历史的两类：
 *  · **`running` 的日志**：没跑完的那一帧不是历史，是当时的一个瞬间。
 *  · **空正文**：空气泡在历史里只是一行留白。
 */
export function toOperatorHistoryEntry(
  entry: StudioOperatorThreadEntry,
): StudioOperatorHistoryEntry | null {
  switch (entry.kind) {
    case 'user': {
      const text = entry.text.trim()
      if (!text) return null
      return {
        kind: 'user',
        id: entry.id,
        text: truncate(text, LIMITS.maxMessageChars),
        // ⚠ 只留还取得到的那些：本地 `blob:` 预览进不了历史（见 `isPersistableUrl`）。
        attachments: entry.attachments
          .filter((attachment) => isPersistableUrl(attachment.url))
          .slice(0, LIMITS.maxSnapshotReferences)
          .map((attachment) => ({
            id: attachment.id,
            label: truncate(attachment.label, LIMITS.maxLabelChars),
            kind: attachment.kind,
            url: attachment.url,
            ...(isPersistableUrl(attachment.thumbnailUrl)
              ? { thumbnailUrl: attachment.thumbnailUrl }
              : {}),
          })),
      }
    }
    case 'message': {
      const text = entry.text.trim()
      if (!text) return null
      return {
        kind: 'message',
        id: entry.id,
        text: truncate(text, LIMITS.maxMessageChars),
      }
    }
    case 'plan': {
      const steps = entry.steps
        .map((step) => step.trim())
        .filter(Boolean)
        .slice(0, LIMITS.maxPlanItems)
        .map((step) => truncate(step, LIMITS.maxPlanItemChars))
      if (steps.length === 0) return null
      return { kind: 'plan', id: entry.id, steps }
    }
    case 'step':
      return toOperatorHistoryStep(
        entry.id,
        entry.step,
        entry.undone,
        entry.checkpoint,
      )
    /**
     * 规则薄卡**不进历史**（切片 3a）。
     *
     * ⭐ 它引的是规则表里那条**活的**记录：用户可以在助手设置里删掉它。把原文抄进
     * 会话历史，刷新之后那张薄卡还挂在那儿说「依据项目规则：××」，而那条规则已经
     * 不存在了 —— 一条会说谎的痕迹比没有痕迹坏。要复看规则去规则列表，那才是它的家。
     */
    case 'rule':
      return null
    /**
     * 结果卡**不进历史**（v2 §6，commit #10）—— 与规则薄卡同一条判据。
     *
     * ⭐ 卡上那两颗按钮（再来一组 / 用它当参考）都是**活的操作**：前者要一份
     * 生成载荷才摆得出确认卡，后者要往此刻这台工作台上挂参考。刷新之后两者都
     * 没有落点，留下来的会是一张两颗钮都点不动的卡。
     * ⚠ 图不会因此丢：它们已经**入库**了，素材库与 `@` 选择器里照旧找得到 ——
     * 这正是「自动入库」这条决策让历史条目变得多余的地方。
     */
    case 'result':
      return null
    /**
     * 结论记录**不进 `messages`**（v2 §7.7，commit #13）—— 它住在同一行的
     * `rounds` 那一列（§7.4）。
     *
     * ⭐ 判据是「一件事只有一个家」：§7.7 的编辑要把改过的那条**原样写回那一列**
     * （下一轮注入读的就是那一列）。抄一份进 `messages` 的下场是改完之后库里有
     * 两个版本，而刷新之后面板读的是没改过的那一份。
     */
    case 'roundSummary':
      return null
    case 'system':
      return {
        kind: 'system',
        id: entry.id,
        code: entry.code,
        ...(entry.subject
          ? { subject: truncate(entry.subject, LIMITS.maxTitleChars) }
          : {}),
        ...(typeof entry.count === 'number' && entry.count >= 0
          ? { count: entry.count }
          : {}),
        /**
         * ⭐ 答题那一行**带着它的自包含正文进库**（§3.4 落账规则）：这一格不在
         * 的话，刷新之后模型又会把用户两轮前答过的题重问一遍。
         */
        ...(entry.userText?.trim()
          ? {
              userText: truncate(entry.userText.trim(), LIMITS.maxMessageChars),
            }
          : {}),
        ...(entry.answered ? { answered: entry.answered } : {}),
      }
    /**
     * ⚠ 线程里的 `domain` 是**自由字符串**（视图模型那边没收窄），而历史 schema
     * 是 enum。不认识的域整条丢掉 —— 存进去也只会在读回来时被 zod 判非法，
     * 区别只是丢在哪一头。
     */
    case 'domainMark':
      if (!isOperatorDomain(entry.domain)) return null
      return { kind: 'domainMark', id: entry.id, domain: entry.domain }
  }
}

function isOperatorDomain(value: string): value is AssistantOperatorDomain {
  return (ASSISTANT_OPERATOR_DOMAINS as readonly string[]).includes(value)
}

const ASSISTANT_OPERATOR_TOOL_SET: ReadonlySet<string> = new Set(
  ASSISTANT_OPERATOR_TOOLS,
)

/**
 * 日志条 → 只读痕迹。
 *
 * ⛔ **这个函数是「不复活」那条约束的落点**：它读 `step.payload` / `step.inverse`
 * 只为了攒一行给人看的字，返回值里一个字节的载荷都没有。
 */
function toOperatorHistoryStep(
  id: string,
  step: AssistantOperatorStep,
  undone: boolean,
  checkpoint?: StudioOperatorCheckpoint,
): StudioOperatorHistoryEntry | null {
  // `running` 不落库 —— 见 `toOperatorHistoryEntry` 头注。
  if (step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.running) return null

  const base = {
    kind: 'step' as const,
    id,
    tool: step.tool,
    title: truncate(step.title, LIMITS.maxTitleChars),
    ...(step.reason
      ? { reason: truncate(step.reason, LIMITS.maxReasonChars) }
      : {}),
    undone,
  }

  if (step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error) {
    return {
      ...base,
      status: 'error',
      rejectReason: step.error.reason,
      ...(step.error.detail
        ? { detail: truncate(step.error.detail, LIMITS.maxReasonChars) }
        : {}),
    }
  }

  /**
   * 评价卡的「文字与图 URL」（拍板 6）—— ⛔ 没有 `runKey`，所以历史里那张卡
   * 画不出「还原这轮」：那颗钮撤的是内存里的登记簿，刷新之后它不存在。
   */
  /**
   * ⚠ 视频档（第二期）的评审**不进历史卡**：它画的是三格帧带 + 一段视频地址，
   * 与这张「一张图 + 几行结论」的卡不是同一个形状；而历史卡的字段一旦放宽成
   * 「图或视频」，`imageUrl` 那一格在渲染时就得再判一次类型。第二期先不落历史
   * （面板里那张实时卡照常有），⛔ 不塞一条视频地址进 `imageUrl` 装作是图。
   */
  const critiquePayload =
    step.tool === ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult &&
    'imageUrl' in step.payload
      ? step.payload
      : null
  const critiqueResult =
    step.tool === ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult &&
    step.result &&
    'findings' in step.result
      ? step.result
      : null
  const critique =
    critiquePayload &&
    critiqueResult &&
    isPersistableUrl(critiquePayload.imageUrl)
      ? {
          imageUrl: critiquePayload.imageUrl,
          ...(isPersistableUrl(critiquePayload.thumbnailUrl)
            ? { thumbnailUrl: critiquePayload.thumbnailUrl }
            : {}),
          ...(critiquePayload.modelLabel
            ? { modelLabel: critiquePayload.modelLabel }
            : {}),
          findings: critiqueResult.findings
            .slice(0, LIMITS.maxCritiqueFindings)
            .map((finding) => ({
              severity: finding.severity,
              text: truncate(finding.text, LIMITS.maxCritiqueFindingChars),
            })),
          ...(critiqueResult.advice
            ? {
                advice: truncate(
                  critiqueResult.advice,
                  LIMITS.maxCritiqueAdviceChars,
                ),
              }
            : {}),
        }
      : null

  const detail = describeOperatorStepDetail(step)

  return {
    ...base,
    status: 'done',
    ...(checkpoint ? { checkpoint } : {}),
    ...(detail ? { detail: truncate(detail, LIMITS.maxPromptChars) } : {}),
    ...(critique ? { critique } : {}),
    ...(step.tool === ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences &&
    step.result
      ? { referenceAnalysis: step.result }
      : {}),
  }
}

export function readOperatorReferenceProfiles(
  entries: readonly StudioOperatorThreadEntry[],
  history: readonly StudioOperatorHistoryEntry[],
): ReferenceVisualProfile[] {
  const profiles = new Map<string, ReferenceVisualProfile>()
  for (const entry of [...history, ...toOperatorHistory(entries)]) {
    if (
      entry.kind !== 'step' ||
      entry.status !== 'done' ||
      !entry.referenceAnalysis
    )
      continue
    for (const profile of entry.referenceAnalysis.profiles) {
      profiles.delete(profile.url)
      profiles.set(profile.url, profile)
    }
  }
  return [...profiles.values()].slice(-LIMITS.maxSnapshotReferences)
}

export function toOperatorHistory(
  entries: readonly StudioOperatorThreadEntry[],
): StudioOperatorHistoryEntry[] {
  const history: StudioOperatorHistoryEntry[] = []
  for (const entry of entries) {
    const converted = toOperatorHistoryEntry(entry)
    if (converted) history.push(converted)
  }
  return history
}

/**
 * 痕迹 → 库里的 messages。
 *
 * ⚠ `content` 是**给不认识操作员协议的读者看的那一份**（分享页 / 旧面板 /
 * 服务端搜索）：日志条写标题，域标记写一行方括号。真正的渲染读的是 `operator`。
 * 写成空串不行 —— schema 要求 `min(1)`，整条会被 `sanitizeMessages` 丢掉。
 */
export function toStoredOperatorMessages(
  history: readonly StudioOperatorHistoryEntry[],
): AssistantConversationMessageStored[] {
  return history
    .slice(-ASSISTANT_CONVERSATION_LIMITS.maxMessages)
    .map((entry) => ({
      id: truncate(entry.id, 160),
      /**
       * ⭐ 答题那一行**落成 `user`**（§3.4 落账规则）：它是用户说的话，而不是
       * 一条 UI 通报。落成 `assistant` 的下场是下一轮读回来时它站在助手那一边，
       * 「用户已经答过」这件事仍然没有人说得出口。
       */
      role:
        entry.kind === 'user' || (entry.kind === 'system' && entry.userText)
          ? ('user' as const)
          : ('assistant' as const),
      content: truncate(
        operatorEntryPlainText(entry),
        ASSISTANT_CONVERSATION_LIMITS.maxContentLength,
      ),
      operator: entry,
    }))
}

function operatorEntryPlainText(entry: StudioOperatorHistoryEntry): string {
  switch (entry.kind) {
    case 'user':
    case 'message':
      return entry.text
    case 'plan':
      return entry.steps.join(' · ')
    case 'step':
      return entry.title
    case 'system':
      // ⚠ 答题那一行的正文就是**那句自包含的话**：分享页 / 旧面板读到的是
      //   「已选择『半身』（针对问题『取多少身？』）」，而不是一个码。
      return (
        entry.userText ??
        `[${entry.code}${entry.subject ? `: ${entry.subject}` : ''}]`
      )
    case 'domainMark':
      return `[domain: ${entry.domain}]`
  }
}

/**
 * 库里的 messages → 痕迹。
 *
 * ⚠ 没有 `operator` 那格的消息**整条跳过**：那是旧助手写的纯对白，把它渲染进
 * 操作员线程只会得到一段没有出处的白文本。（哪条会话属于谁由 `operatorThread`
 * 在列表那一层就分好了，这里是第二道。）
 */
export function fromStoredOperatorMessages(
  messages: readonly AssistantConversationMessageStored[],
): StudioOperatorHistoryEntry[] {
  const history: StudioOperatorHistoryEntry[] = []
  for (const message of messages) {
    if (!message.operator) continue
    const parsed = StudioOperatorHistoryEntrySchema.safeParse(message.operator)
    if (parsed.success) history.push(parsed.data)
  }
  return history
}

/**
 * 载回来的历史里，哪些进**下一轮请求的对白**。
 *
 * ⭐ 不带它的下场是「用户看得见自己三分钟前说的话，助手却完全失忆」—— 刷新之后
 * 第一句话就要重新自我介绍。旧助手线（`use-assistant-conversation`）也是把历史
 * 原样带回上下文的，这里保持一致。
 * ⚠ 只取最后 `replayMessages` 条：显示是全部（用户要读得到），进上下文的每一条
 * 都是账单。
 */
export function historyToOperatorMessages(
  history: readonly StudioOperatorHistoryEntry[],
): AssistantOperatorMessage[] {
  const messages: AssistantOperatorMessage[] = []
  for (const entry of history) {
    if (entry.kind === 'user') {
      const attachmentNote =
        entry.attachments.length > 0
          ? // ⭐ 名字写在最前（切片 N1）：模型要用 `图_012` 指认这一张，而不是
            //   念一串它会抄错、用户也核对不了的地址。地址仍然带着 —— 视觉线
            //   与 `critique_result` 的目标匹配都还认它。
            `\n[attached: ${entry.attachments
              .map(
                (attachment) =>
                  `${attachment.label} (${attachment.kind}) ${attachment.url}`,
              )
              .join(', ')}]`
          : ''
      messages.push({ role: 'user', content: `${entry.text}${attachmentNote}` })
    } else if (entry.kind === 'message') {
      messages.push({ role: 'assistant', content: entry.text })
    } else if (entry.kind === 'system' && entry.userText) {
      /**
       * ⭐ 答过的题**回到对话里**（§3.4 落账规则）—— 与 `buildMessages` 逐字
       * 同一条判据：`planAnswers` 只跟着当次请求走，历史里的答案只有这一条路。
       */
      messages.push({
        role: 'user',
        content: entry.userText,
        ...(entry.answered ? { answered: entry.answered } : {}),
      })
    } else if (entry.kind === 'system' && entry.code === 'checkpointRestored') {
      messages.push({
        role: 'assistant',
        content:
          '[Workspace event: the creator restored a configuration checkpoint. Use the current form snapshot; earlier tool settings are historical.]',
      })
    }
  }
  return messages.slice(-STUDIO_OPERATOR_HISTORY.replayMessages)
}

/**
 * 载回来的历史里，哪些进**下一轮的 `priorSteps`**。
 *
 * ⚠ 与 `use-assistant-operator.ts` 的 `buildPriorSteps` 同一条语义：被撤销的那些
 * 照样带上去且标 `error`，否则助手下一轮会把用户撤掉的改动又做一遍。
 * ⚠ 工具名不在当前词表里的整条丢掉：请求 schema 那边是 enum，混进一个历史遗留
 * 的工具名会让**整个请求**在 400 上失败 —— 一条装饰性的历史不值这个。
 */
export function historyToPriorSteps(
  history: readonly StudioOperatorHistoryEntry[],
): AssistantOperatorPriorStep[] {
  const steps: AssistantOperatorPriorStep[] = []
  for (const entry of history) {
    if (entry.kind === 'system' && entry.code === 'checkpointRestored')
      steps.length = 0
    if (entry.kind !== 'step') continue
    if (!ASSISTANT_OPERATOR_TOOL_SET.has(entry.tool)) continue
    const summary = entry.undone
      ? `The creator UNDID this — do not redo it. (${entry.title})`
      : entry.title
    steps.push({
      tool: entry.tool as AssistantOperatorTool,
      status: entry.undone
        ? ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
        : entry.status,
      summary: truncate(summary, LIMITS.maxPriorStepSummaryChars),
    })
  }
  return steps
}
