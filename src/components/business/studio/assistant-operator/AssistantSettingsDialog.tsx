'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from '@/components/icons'

import {
  ASSISTANT_AVATAR_PRESET_IDS,
  ASSISTANT_PERSONA_ARCHETYPES,
  ASSISTANT_PERSONA_ARCHETYPE_PRESETS,
  ASSISTANT_PERSONA_LANGUAGES,
  ASSISTANT_PERSONA_LIMITS,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_TONES,
  ASSISTANT_PERSONA_VERBOSITIES,
  matchAssistantPersonaArchetype,
  type AssistantPersonaLanguage,
  type AssistantPersonaTone,
  type AssistantPersonaVerbosity,
} from '@/constants/assistant-persona'
import {
  PROJECT_RULE_KINDS,
  PROJECT_RULE_KIND_IDS,
  ASSISTANT_PROJECT_RULE_LIMITS,
  type ProjectRuleKindId,
} from '@/constants/assistant-operator'
import { PROFILE } from '@/constants/config'
import { CONTEXT_CARD_STATUS_IDS } from '@/constants/context-cards'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useContextCards } from '@/hooks/use-context-cards'
import { useProjectRules } from '@/hooks/use-project-rules'
import { cn } from '@/lib/utils'
import type { UpdateAssistantPersonaRequest } from '@/types/assistant-persona'
import type { ContextCard } from '@/types/context-cards'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { AssistantAvatarGlyph } from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'
import { AssistantPersonaPreview } from '@/components/business/studio/assistant-operator/AssistantPersonaPreview'
import { ContextCardDialog } from '@/components/business/studio/assistant-operator/ContextCardDialog'

/**
 * 助手设置（`docs/references/pages/assistant-shell.md` §8.1–8.2）。
 *
 * ── 2026-09-06 改版（owner：「太丑了需要优化」）──────────────────────
 * 旧版是一列到底：每档一个 `text-sm` 大标题 + 一排 40px 圆胶囊，六张头像各占
 * 44px 挤成一行，弹层实测 806px 高而视口只有 757px —— 头尾一起被裁。现在按
 * `ui-defaults.md` 的脊柱重做：
 *
 *  ① **头固定 / 身滚动 / 脚固定**，容器高度封在视口内（见下面 `maxHeight` 那行
 *     注释）—— ⛔ 不再让整颗弹层长过视口。
 *  ② **两栏**（`lg:` 起）：左「身份」= 64px 大预览 + 六款预设 + 传/撤 + 名字；
 *     右「说话方式」= 语气 / 长度 / 默认行为 / 语言 四组分段控件。
 *     ⚠ 这一条**推翻** §8.1 写的「`max-w-lg` 单列，⛔ 不分栏」——owner 2026-09-06
 *     当面定的两栏优先于文档，改文档是另一件事。
 *  ③ 每组 = `text-2sm tracking-nav` 小标题 + `h-8` 分段控件（`ToggleGroup` 原语），
 *     选中 `bg-primary text-primary-foreground`。⛔ 不再有 40px 圆胶囊。
 *  ④ 两页（助手 / 项目规则）走 `Tabs` 原语，⛔ 不是两颗大圆按钮。
 *  ⑤ **保存失败就地说话**（`role="alert"`）—— 旧版 `save()` 返回 false 就什么都
 *     不发生，用户只看到弹层不关（2026-09-06 真机抓到的 bug 1）。
 *
 * ⚠ **一个用户一份，四域共用**：头部那句 description 就是在说这件事（不写的话
 * 用户会以为改的只是当前工作台）。旧版 body 末尾那句 `scopeNote` 与它逐字重复，
 * 本轮删掉 —— 辅助说明只留一句。
 *
 * 🔬 contrast-check（2026-09-06，浅色档全过 AA 4.5）：分段控件未选
 * `text-muted-foreground`(#696969) 对槽底 `bg-muted`(#f5f5f5) **5.04**；选中
 * `text-primary-foreground` 对 `bg-primary` **21.00**；组标题 muted 对卡背
 * **5.49**；正文 `text-foreground` 对卡背 **19.80**；页签未选 `text-foreground/60`
 * 合成 #686868 对 `bg-muted` **5.11**，选中态 19.80；失败提示 `text-status-risk`
 * (#b3261e) 对卡背 **6.54** / 对 `bg-muted` **6.00**；规则原文对 `bg-muted` 18.16。
 *
 * ⚠ 头像那两条腿（传 / 撤）走的是**另一条路由**，不跟着「保存」走 ——
 * 它们改的是 R2 上的对象，攒着等保存等于让「取消」变成一句谎话。
 *
 * ── 2026-09-11 v2 §11 改版（画板 BSettings）────────────────────────
 * 助手页从「身份 + 四组分段控件」改成**三层**：
 *
 *  ① **三张人设卡**（§11.1）占第一屏 —— 用户要决定的其实只有「它该问我多少」，
 *     而旧版把这件事拆成四个专业名词（语气 / 长度 / 默认行为 / 语言）让他自己拼。
 *     选一张卡 = 整份填好（`ASSISTANT_PERSONA_ARCHETYPE_PRESETS`）。
 *  ② **身份区**：头像 + 名字 + 怎么称呼你，一行装完。
 *  ③ **「高级」折叠区**：语气 / 回复长度 / 语言 / 下一步建议 / 用我的词。
 *     ⛔ **默认收起** —— 三张卡才是第一屏，展开的一列专业名词会把它们顶下去。
 *     ⛔ 「默认行为」那一组分段控件**整块删掉**：它现在由卡那一层决定
 *     （谨慎 = 每轮先出计划），再摆一颗就是两个地方改同一件事。
 *  ④ 右侧 **实时示例**（§11.5，`AssistantPersonaPreview`）：本地模板，⛔ 不调 LLM。
 *
 * ⚠ **「哪张卡亮着」是算出来的，⛔ 不是存着的一个 flag**：
 * `matchAssistantPersonaArchetype(draft)` 按五格逐格比对。这样「改了高级项就变
 * 自定义」不需要在每一个 `patch` 里手动清一次（漏一处就会有一张亮着的假卡），
 * 而服务端落库用的是**同一个函数**，两边永远给同一个答案。
 * ⚠ 因此**语言与默认模型不影响这一档**：它们不在 §11.1 那张映射表里，
 * 卡上写的三行副文案也没有一行在说语言。
 */

/**
 * 弹层里的两页（§8.1 + §10）。
 *
 * ⚠ **不是「tab 只是装饰」**：规则薄卡上那颗「查看规则」要直接落到规则页
 * （§10「查看规则」），所以开哪一页必须是入参而不是内部 state。
 * ⚠ 规则页此前是**只读列表 + 删除**，理由是「规则的价值在于它从真实工作里长
 * 出来」——那条理由**对普通规则仍然成立**（它们照旧由助手在对话里记）。
 * ⭐ v2 §9.3 加了新增那一行，判据是来源名单不一样：「只信官方设定集」是用户
 * 自己的决定，没有哪句对话会让助手替他做，而它又必须是一条能一直生效的规则。
 * ⛔ 新增那一行**必须带类型**：三种规则的后果完全不同。
 */
export const ASSISTANT_SETTINGS_SECTIONS = {
  persona: 'persona',
  rules: 'rules',
  /**
   * 上下文卡（第三期 K1 的入口，切片 Y 接线）—— **列表 + 建/改 + 常挂开关**。
   *
   * ⚠ 与规则页的分工写在两处头注里：规则是「从真实工作里长出来的」，所以那一页
   * 只读；卡是**用户自己写的资料**，所以这一页有新建与编辑。⛔ 别把两页做成
   * 一样的形状。
   */
  cards: 'cards',
} as const

export type AssistantSettingsSection =
  (typeof ASSISTANT_SETTINGS_SECTIONS)[keyof typeof ASSISTANT_SETTINGS_SECTIONS]

interface AssistantSettingsDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** 开在哪一页（§10 的「查看规则」直接落到 `rules`）。缺省是设置页。 */
  section?: AssistantSettingsSection
  /**
   * 当前工作台的域 id ——「常挂在这台工作台」那颗开关认它。
   * ⚠ 缺席时**不画那颗开关**（没有「这里」可挂），⛔ 不摆一颗点了没反应的。
   */
  scope?: string
}

type PersonaDraft = UpdateAssistantPersonaRequest

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('READ_FAILED'))
    reader.readAsDataURL(file)
  })
}

/**
 * 「高级」折叠区里的一行：**左标题 + 右分段控件**（画板 BSettings 的高级区）。
 *
 * ⚠ 走**现有** `ToggleGroup` 原语（radix roving focus + `aria-pressed` 都在里面），
 * ⛔ 不自己写一套按钮组：那样键盘可达性得重新证一遍。
 * ⚠ `onValueChange` 收到空串 = radix 的「再点一次取消选中」——这几档都是必选，
 * 空串直接丢掉（⛔ 别让用户点出一个「什么都没选」的语气）。
 * ⚠ 窄档（<640）退回上下两行：92px 的标题栏在 375 上会把三颗 chip 挤成竖条；
 * 四档那一组（语气）在窄档再退成 **2×2 等分**，`sm:` 起回到桌面要求的一行四档
 * （画板 BSettings 高级区）——375 上四等分只有 ~80px，`自定义` / `Professional`
 * 一定折行。
 */
function PersonaSegment({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  value: string | undefined
  onChange(next: string): void
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-2sm font-semibold uppercase tracking-nav text-muted-foreground sm:w-24 sm:shrink-0">
        {label}
      </span>
      <ToggleGroup
        type="single"
        value={value ?? ''}
        onValueChange={(next) => {
          if (next) onChange(next)
        }}
        aria-label={label}
        className={cn(
          'grid w-full gap-1.5 rounded-lg border-transparent bg-muted p-1 sm:flex-1',
          options.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3',
        )}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            /* 画板 BSettings 高级区：chip 是 12px / 28-32px 高。`text-xs` 而不是
               `text-sm` 是这一行四档能并排的前提（`Professional` 在 14px 下就
               撑破格子）。`min-h-8` 而不是 `h-8`：ja 的长档名（`プロフェッショ
               ナル`）宁可让格子长高一行，也不裁字。 */
            className="flex min-h-8 items-center justify-center rounded-md px-2 py-1 text-center text-xs leading-tight text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/**
 * 高级区里的一颗开关行（下一步建议 / 用我的词）——与 `PersonaSegment` 同一套
 * 左标题栏宽度，⛔ 别让同一列里的两种行各自对齐到不同的位置。
 */
function PersonaSwitchRow({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string
  hint: string
  checked: boolean
  onChange(next: boolean): void
  testId: string
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="text-2sm font-semibold uppercase tracking-nav text-muted-foreground sm:w-24 sm:shrink-0">
        {label}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="min-w-0 text-md text-muted-foreground">{hint}</span>
        <Switch
          data-testid={testId}
          checked={checked}
          onCheckedChange={onChange}
        />
      </span>
    </label>
  )
}

export function AssistantSettingsDialog({
  open,
  onOpenChange,
  section = ASSISTANT_SETTINGS_SECTIONS.persona,
  scope,
}: AssistantSettingsDialogProps) {
  const t = useTranslations('StudioOperator.persona')
  const tTimeline = useTranslations('StudioOperator.timeline')
  const tRule = useTranslations('StudioOperator.rule')
  /** 卡的档名（角色 / 风格 / 品牌）与编辑器共用一份词表，⛔ 不抄第二份。 */
  const tCards = useTranslations('ContextCards')
  const { persona, isSaving, save, uploadAvatar, removeAvatar } =
    useAssistantPersona({ enabled: open })
  /**
   * ⚠ 只在规则页拉：设置页开得远比规则页多，每次都顺手拉一遍规则是白花的一次
   * 往返。`enabled` 是这颗 hook 本来就有的口子（同 persona 那条）。
   */
  /**
   * 当前这一页 = **入参 + 用户在弹层里点过的那一次**（同下面 `touched` 的叠加
   * 写法）。⛔ 不是 `useState(section)` 的副本：弹层关着时也挂在树上，那份副本
   * 只在首次挂载时抄一次 —— 表现是「点规则薄卡的『查看规则』，开出来的是设置页」。
   */
  const [tabOverride, setTabOverride] =
    useState<AssistantSettingsSection | null>(null)
  const tab = tabOverride ?? section
  /** 新增那一行的两格状态（§9.3）。⚠ 类型默认普通规则 —— 最常见的那一种。 */
  const [ruleDraft, setRuleDraft] = useState('')
  const [ruleKind, setRuleKind] = useState<ProjectRuleKindId>(
    PROJECT_RULE_KIND_IDS.note,
  )
  const rules = useProjectRules({
    enabled: open && tab === ASSISTANT_SETTINGS_SECTIONS.rules,
  })
  /**
   * 同类相邻，组内仍是「最新的在前」（服务端那份排序）。
   * ⚠ 稳定排序：`PROJECT_RULE_KINDS` 的次序就是显示次序，⛔ 不按字母排 ——
   * 「普通规则」必须排第一，它是绝大多数用户唯一有的那一类。
   */
  const sortedRules = useMemo(
    () =>
      [...rules.rules].sort(
        (a, b) =>
          PROJECT_RULE_KINDS.indexOf(a.kind) -
          PROJECT_RULE_KINDS.indexOf(b.kind),
      ),
    [rules.rules],
  )
  /**
   * ⚠ 判据与规则页逐字同源：只在这一页开着时才拉一遍卡表。
   */
  const cards = useContextCards({
    enabled: open && tab === ASSISTANT_SETTINGS_SECTIONS.cards,
  })
  /**
   * **助手提议、还没点头的那几张**（v2 §8.1 待确认区）。
   *
   * ⭐ 单独一次查询而不是从上面那份里过滤：上面那份**看不见**待确认的卡 ——
   * 服务端默认只回已确认的（`list_context_cards` 与系统提示注入走的是同一条
   * 默认），⛔ 别为了这一个区块把默认放开。
   * ⚠ 空的时候整块不渲染（下面那个 `length > 0`）：一个常年空着的区块只会把
   * 真正的卡表往下挤。
   */
  const proposedCards = useContextCards({
    enabled: open && tab === ASSISTANT_SETTINGS_SECTIONS.cards,
    status: CONTEXT_CARD_STATUS_IDS.proposed,
  })
  /**
   * 编辑器开在哪张卡上 —— `'new'` 是新建，`null` 是没开。
   * ⚠ ⛔ 不用两个布尔（「开着吗」+「编的是哪张」）：两个变量必然出现
   * 「开着但没有卡」的组合，而那一帧里编辑器不知道自己在编什么。
   */
  const [cardEditing, setCardEditing] = useState<ContextCard | 'new' | null>(
    null,
  )

  /**
   * 草稿 = **服务端那一份 + 用户这一次动过的几格**，⛔ 不是一份 `useEffect` 里
   * 抄过来的副本：抄一份就得回答「拉到数据时用户已经改了两格怎么办」，
   * 而叠加天然有答案（用户动过的赢）。顺带也没有了那条
   * `react-hooks/set-state-in-effect`。
   */
  const [touched, setTouched] = useState<Partial<PersonaDraft>>({})
  /** 客户端就地能判的两条（体积 / 格式）—— 传上去再被拒是白等一次往返。 */
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [showToneCustomError, setShowToneCustomError] = useState(false)
  /**
   * **bug 1**：`save()` 失败时旧版一个字都不说，用户只看到弹层不关。
   * ⚠ 这里存的是「这一次保存没成」这条事实而不是 hook 上那个 `error` —— 那个
   * 也会被读取失败写上，摆在「保存」旁边会变成一句张冠李戴的话。
   */
  const [saveFailed, setSaveFailed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * 「高级」折叠区的开合（§11.2）。⛔ **默认收起**：第一屏该是三张人设卡，
   * 一展开那五行专业名词就把卡顶出视口 —— 而卡才是绝大多数用户要动的东西。
   */
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const draft: PersonaDraft = useMemo(() => {
    const merged = {
      name: persona.name,
      avatarPreset: persona.avatarPreset,
      tone: persona.tone,
      toneCustom: persona.toneCustom,
      verbosity: persona.verbosity,
      planMode: persona.planMode,
      language: persona.language,
      /**
       * ⚠ 这一格**没有控件**：模型选在输入区那颗 chip 上（§4.5）。带上它是因为
       * `PUT` 收的是完整形状 —— 不带的话在设置里点一次保存就会把用户选的模型
       * 悄悄打回「自动」。
       */
      routeModel: persona.routeModel,
      /** v2 §11.3 的三项 —— 控件在「说话方式」那一列的末尾。 */
      nextStepHint: persona.nextStepHint,
      useMyWords: persona.useMyWords,
      addressUserAs: persona.addressUserAs,
      /**
       * ⚠ 占位而已，下面那一行会把它盖掉 —— `PersonaDraft` 要求这一格在场，
       * 而它的真值永远是**算出来的**（见下）。
       */
      archetype: persona.archetype,
      ...touched,
    }
    /**
     * 「哪张卡亮着」= 五格逐格比对的结果（§11.1），⛔ 不是 `touched` 里存的一个
     * flag：存 flag 就要在每一个动高级项的地方手动清一次，漏一处就会留下一张
     * 亮着的假卡。服务端落库走的是**同一个函数**，所以保存前后不会跳。
     */
    return { ...merged, archetype: matchAssistantPersonaArchetype(merged) }
  }, [persona, touched])

  const patch = useCallback((next: Partial<PersonaDraft>) => {
    // 动过一格就把上一次的失败提示收掉 —— 那条红字说的是上一次那个草稿。
    setSaveFailed(false)
    setTouched((current) => ({ ...current, ...next }))
  }, [])

  /**
   * 关掉就把没保存的几格丢掉 —— Esc / 点外面 / 「取消」三条路都走这一个回调，
   * ⛔ 别只在「取消」那颗按钮上清（那样 Esc 关掉再打开会看到上次的半成品）。
   */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setTouched({})
        setAvatarError(null)
        setShowToneCustomError(false)
        setSaveFailed(false)
        // ⚠ 关掉时把覆盖清掉：下一次调用方说开哪页就开哪页。
        setTabOverride(null)
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  const handleSave = useCallback(async () => {
    if (
      draft.tone === ASSISTANT_PERSONA_TONE_IDS.custom &&
      !draft.toneCustom?.trim()
    ) {
      setShowToneCustomError(true)
      return
    }
    setShowToneCustomError(false)
    setSaveFailed(false)
    const ok = await save(draft)
    if (ok) {
      handleOpenChange(false)
      return
    }
    // bug 1：失败**留在原地**并说明白，⛔ 不关弹层（关了草稿就没了）。
    setSaveFailed(true)
  }, [draft, handleOpenChange, save])

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      setAvatarError(null)
      if (!PROFILE.SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        setAvatarError(t('avatarUnsupported'))
        return
      }
      if (file.size > PROFILE.AVATAR_MAX_SIZE_BYTES) {
        setAvatarError(t('avatarTooLarge'))
        return
      }
      const dataUrl = await readFileAsDataUrl(file)
      const ok = await uploadAvatar(dataUrl)
      // 传失败同样就地说话（同 bug 1，只是换了一条腿）。
      if (!ok) setAvatarError(t('saveFailed'))
    },
    [t, uploadAvatar],
  )

  const toneOptions = ASSISTANT_PERSONA_TONES.map((tone) => ({
    value: tone,
    label: t(`tone.${tone}`),
  }))
  const verbosityOptions = ASSISTANT_PERSONA_VERBOSITIES.map((verbosity) => ({
    value: verbosity,
    label: t(`verbosity.${verbosity}`),
  }))
  const languageOptions = ASSISTANT_PERSONA_LANGUAGES.map((language) => ({
    value: language,
    label: t(`language.${language}`),
  }))

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent
        /**
         * **bug 3**：桌面档 `DialogContent` 本身没有高度上限，弹层长到 806px 就
         * 在 757px 的视口上被上下裁掉。这里把它封进视口内，滚动交给身体那一格。
         * ⚠ `lg:max-w-4xl` 而不是 `sm:` —— `ResponsiveDialog` 在 <1024 走的是
         * vaul 抽屉（`fixed inset-x-0`），给它一个 `max-w` 会把抽屉挤成左对齐
         * 的一条。`lg` 正好是抽屉/弹层的分界。
         * ⚠ 2026-09-12 由 `2xl`(672) 抬到 `4xl`(896)：画板 BSettings 的桌面档
         * 是 960 宽的两栏（左 618 / 右 342），672 上左栏只剩 ~365px，语气那四档
         * 必折行。`DialogContent` 自带 `max-w-[calc(100%-2rem)]`，窄视口不会溢出。
         */
        /* 画板 BSettings：弹层圆角与面板同一档（18px，§12.3 上限）。 */
        className="flex flex-col gap-0 overflow-hidden p-0 lg:max-w-4xl lg:rounded-2xl"
        style={{
          /**
           * 三项取最小：
           *  · `95svh` 与 `100svh - --keyboard-inset` 是移动抽屉本来的两条
           *    （`ResponsiveDialogContent` 的默认值 —— 这里覆盖了 `style`，
           *    ⛔ 不能把它们丢掉，否则手机软键盘弹起时抽屉会被顶穿）；
           *  · `100dvh - 2rem` 是桌面档新加的那条（`ui-defaults.md §6`：全高走
           *    `dvh`，⛔ 不用 `100vh`）。
           */
          maxHeight:
            'min(95svh, calc(100dvh - 2rem), calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))',
        }}
        mobileBodyClassName="px-0 pt-0"
      >
        <ResponsiveDialogHeader className="shrink-0 gap-1.5 px-4 pb-3 pr-12 pt-4 text-left lg:px-6 lg:pt-6">
          <ResponsiveDialogTitle className="text-base">
            {t('title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-md">
            {t('description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {/* ── 两页（§8.1 设置 / §10 规则）────────────────────────────
            ⚠ `Tabs` 原语放在头部，⛔ 不再是两颗与下面四组分段控件长得一样的
              大圆胶囊 —— 「换一页」和「选一档」不是同一类动作，长相不该一样。 */}
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setTabOverride(value as AssistantSettingsSection)
          }
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="shrink-0 px-4 pb-3 lg:px-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value={ASSISTANT_SETTINGS_SECTIONS.persona}>
                {t('tabPersona')}
              </TabsTrigger>
              <TabsTrigger value={ASSISTANT_SETTINGS_SECTIONS.rules}>
                {t('tabRules')}
              </TabsTrigger>
              <TabsTrigger value={ASSISTANT_SETTINGS_SECTIONS.cards}>
                {t('tabCards')}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 lg:px-6">
            <TabsContent value={ASSISTANT_SETTINGS_SECTIONS.persona}>
              {/* 三行两栏（`lg:` 起）：左上「人设卡 + 身份」· 左下「高级」·
                  右侧实时示例跨两行。⚠ 手机档单列，**DOM 次序就是阅读次序**：
                  卡 → 身份 → 示例 → 高级。示例排在折叠区之前，因为它解释的正是
                  上面那三张卡的后果；折叠着的东西不该挡在解释前面。 */}
              <div className="grid gap-4 lg:grid-cols-5">
                {/* ── 左上：三张人设卡 + 身份区 ─────────────────── */}
                <section className="flex flex-col gap-3 lg:col-span-3 lg:col-start-1 lg:row-start-1">
                  {/* ⚠ 375 档一列到底：三张卡各带三行副文案，横排在窄屏上会把
                      每行压成两个字。 */}
                  <div
                    data-testid="assistant-archetype-cards"
                    className="grid gap-2 sm:grid-cols-3"
                  >
                    {ASSISTANT_PERSONA_ARCHETYPES.map((archetype) => {
                      const selected = draft.archetype === archetype
                      return (
                        <button
                          key={archetype}
                          type="button"
                          data-testid={`assistant-archetype-${archetype}`}
                          aria-pressed={selected}
                          onClick={() =>
                            patch(
                              ASSISTANT_PERSONA_ARCHETYPE_PRESETS[archetype],
                            )
                          }
                          className={cn(
                            'flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-[border-color,background-color,transform] duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95 motion-reduce:transition-none',
                            selected
                              ? 'border-foreground bg-muted'
                              : 'border-border bg-card hover:border-assistant-line-strong',
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-foreground">
                              {t(`archetype.${archetype}.name`)}
                            </span>
                            {/* ⚠ 选中**不只靠边框**：一颗勾是文本/图形冗余表达
                                （forbidden：⛔ 只靠颜色表达状态）。 */}
                            {selected ? (
                              <Check
                                className="ml-auto size-3.5 text-foreground"
                                aria-hidden
                              />
                            ) : null}
                          </span>
                          <span className="flex flex-col gap-0.5 text-md leading-relaxed text-muted-foreground">
                            <span>{t(`archetype.${archetype}.askLine`)}</span>
                            <span>
                              {t(`archetype.${archetype}.confirmLine`)}
                            </span>
                            <span>
                              {t(`archetype.${archetype}.lengthLine`)}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {/* 一张卡都没亮 = 用户在高级区改出了自己的一份。⛔ 不做成第四张
                      卡：它不是一个能点的选项，而是「你已经不在这三档里」这条事实。 */}
                  {draft.archetype === null ? (
                    <p
                      data-testid="assistant-archetype-custom"
                      className="text-md text-muted-foreground"
                    >
                      <span className="mr-1.5 rounded-md bg-muted px-1.5 py-0.5 text-2sm font-semibold uppercase tracking-nav text-foreground">
                        {t('archetypeCustom')}
                      </span>
                      {t('archetypeCustomHint')}
                    </p>
                  ) : null}

                  {/* ── 身份区（§11.4）：头像 + 名字 + 怎么称呼你 ──── */}
                  <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center gap-3">
                      {/* 52px 预览 —— 旧版根本没有预览，用户选完只能靠小图猜。 */}
                      <span
                        data-testid="assistant-avatar-preview"
                        className="grid size-13 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted"
                      >
                        {persona.avatarUrl ? (
                          <Image
                            src={persona.avatarUrl}
                            alt={t('avatarLabel')}
                            width={128}
                            height={128}
                            unoptimized
                            className="size-full object-cover"
                          />
                        ) : (
                          <AssistantAvatarGlyph
                            presetId={draft.avatarPreset}
                            name={
                              draft.name?.trim() ||
                              tTimeline('assistantFallback')
                            }
                            className="size-full"
                          />
                        )}
                      </span>

                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <Label
                            htmlFor="assistant-persona-name"
                            className="text-2sm font-semibold uppercase tracking-nav text-muted-foreground"
                          >
                            {t('nameLabel')}
                          </Label>
                          <Input
                            id="assistant-persona-name"
                            value={draft.name ?? ''}
                            maxLength={ASSISTANT_PERSONA_LIMITS.maxNameChars}
                            placeholder={t('namePlaceholder')}
                            onChange={(event) =>
                              patch({
                                name: event.target.value.trim()
                                  ? event.target.value
                                  : null,
                              })
                            }
                          />
                        </div>
                        {/* 「怎么称呼你」（§11.3）搬进身份区 —— 它与「它叫什么」
                            是同一个问题的两半，⛔ 别再摆回说话方式那一列。 */}
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <Label
                            htmlFor="assistant-address-user-as"
                            className="text-2sm font-semibold uppercase tracking-nav text-muted-foreground"
                          >
                            {t('addressUserAsLabel')}
                          </Label>
                          <Input
                            id="assistant-address-user-as"
                            data-testid="assistant-address-user-as"
                            value={draft.addressUserAs ?? ''}
                            maxLength={
                              ASSISTANT_PERSONA_LIMITS.maxAddressUserAsChars
                            }
                            placeholder={t('addressUserAsPlaceholder')}
                            onChange={(event) =>
                              patch({
                                addressUserAs: event.target.value.trim()
                                  ? event.target.value
                                  : null,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* 两款预设 + 传 / 撤，一行装完。⚠ 每颗 `h-11`（44px 触屏
                        命中区，`ui-defaults.md §5`）。
                        🔬 contrast-check（2026-09-07，浅 / 暗）：品牌标
                        `text-foreground` 对卡背 19.80 / 17.18，未选 `text-muted-
                        foreground` 5.49 / 6.94，选中 `text-primary` 21.00 / 17.93。
                        ⚠ `ring-ring` 对卡背只有 2.58（浅档）—— 所以选中态**同时**
                        换 `border-primary`（21.00），⛔ 别把「选中了没有」单独押
                        在那圈 ring 上。 */}
                    <div className="flex flex-wrap items-center gap-2">
                      {ASSISTANT_AVATAR_PRESET_IDS.map((presetId) => {
                        const selected =
                          !persona.avatarUrl && draft.avatarPreset === presetId
                        return (
                          <button
                            key={presetId}
                            type="button"
                            aria-pressed={selected}
                            aria-label={t(`avatarPreset.${presetId}`)}
                            title={t(`avatarPreset.${presetId}`)}
                            onClick={() => patch({ avatarPreset: presetId })}
                            className={cn(
                              'grid h-11 w-14 place-items-center rounded-md border p-2 transition-[border-color,color,transform] duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 motion-reduce:transition-none',
                              selected
                                ? 'border-primary text-primary ring-2 ring-ring'
                                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                            )}
                          >
                            <AssistantAvatarGlyph
                              presetId={presetId}
                              name={
                                draft.name?.trim() ||
                                tTimeline('assistantFallback')
                              }
                              className="size-7"
                            />
                          </button>
                        )
                      })}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSaving}
                      >
                        <Upload />
                        {t('avatarUpload')}
                      </Button>
                      {persona.avatarUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-11"
                          onClick={() => void removeAvatar()}
                          disabled={isSaving}
                        >
                          <X />
                          {t('avatarRemove')}
                        </Button>
                      ) : null}
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={PROFILE.SUPPORTED_IMAGE_TYPES.join(',')}
                      className="hidden"
                      onChange={(event) => {
                        void handleFile(event.target.files?.[0])
                        // 同一张图连传两次也要触发 change —— ⛔ 别忘了清值。
                        event.target.value = ''
                      }}
                    />

                    {isSaving ? (
                      <p className="flex items-center gap-1.5 text-md text-muted-foreground">
                        <Spinner size="sm" />
                        {t('avatarUploading')}
                      </p>
                    ) : null}
                    {avatarError ? (
                      <p
                        role="alert"
                        className="flex items-center gap-1.5 text-md text-status-risk"
                      >
                        <AlertCircle
                          className="size-3.5 shrink-0"
                          aria-hidden
                        />
                        {avatarError}
                      </p>
                    ) : null}
                  </div>
                </section>

                {/* ── 右：实时示例（§11.5，本地模板，⛔ 不调 LLM）──────
                    ⚠ 跨满左栏两行（人设卡 + 身份 / 高级），栅格默认 `stretch`，
                    示例卡自己 `h-full` 把这一格填满 —— 高级展开后右边不再空出
                    一大块（画板 BSettings：右栏是一整条与左栏等高的浅底）。 */}
                <div className="lg:col-span-2 lg:col-start-4 lg:row-span-2 lg:row-start-1">
                  <AssistantPersonaPreview
                    name={draft.name?.trim() || tTimeline('assistantFallback')}
                    avatarPreset={draft.avatarPreset}
                    avatarUrl={persona.avatarUrl}
                    tone={draft.tone}
                    verbosity={draft.verbosity}
                    nextStepHint={draft.nextStepHint}
                    addressUserAs={draft.addressUserAs}
                  />
                </div>

                {/* ── 左下：「高级」折叠区（§11.2 + §11.3）──────────── */}
                <section className="flex flex-col gap-3 lg:col-span-3 lg:col-start-1 lg:row-start-2">
                  <button
                    type="button"
                    data-testid="assistant-advanced-toggle"
                    aria-expanded={advancedOpen}
                    aria-controls="assistant-advanced"
                    onClick={() => setAdvancedOpen((current) => !current)}
                    className="flex items-center gap-2 rounded-md text-md text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <ChevronDown
                      className={cn(
                        'size-3.5 shrink-0 transition-transform duration-fast ease-standard motion-reduce:transition-none',
                        advancedOpen && 'rotate-180',
                      )}
                      aria-hidden
                    />
                    <span>{t('advancedLabel')}</span>
                    <span className="h-px flex-1 bg-border" aria-hidden />
                  </button>

                  {advancedOpen ? (
                    <div
                      id="assistant-advanced"
                      data-testid="assistant-advanced"
                      className="flex flex-col gap-3"
                    >
                      <PersonaSegment
                        label={t('toneLabel')}
                        options={toneOptions}
                        value={draft.tone}
                        onChange={(value) =>
                          patch({ tone: value as AssistantPersonaTone })
                        }
                      />
                      {/* 自定义那一句**只在选中 custom 时**长出来 —— 常驻一个空框
                          会让另外三档看起来也缺了点什么。 */}
                      {draft.tone === ASSISTANT_PERSONA_TONE_IDS.custom ? (
                        <div className="flex flex-col gap-1.5 sm:pl-27">
                          <Input
                            value={draft.toneCustom ?? ''}
                            maxLength={
                              ASSISTANT_PERSONA_LIMITS.maxToneCustomChars
                            }
                            placeholder={t('toneCustomPlaceholder')}
                            aria-invalid={showToneCustomError}
                            onChange={(event) =>
                              patch({
                                toneCustom: event.target.value.trim()
                                  ? event.target.value
                                  : null,
                              })
                            }
                          />
                          {showToneCustomError ? (
                            <p
                              role="alert"
                              className="flex items-center gap-1.5 text-md text-status-risk"
                            >
                              <AlertCircle
                                className="size-3.5 shrink-0"
                                aria-hidden
                              />
                              {t('toneCustomRequired')}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <PersonaSegment
                        label={t('verbosityLabel')}
                        options={verbosityOptions}
                        value={draft.verbosity}
                        onChange={(value) =>
                          patch({
                            verbosity: value as AssistantPersonaVerbosity,
                          })
                        }
                      />

                      <PersonaSegment
                        label={t('languageLabel')}
                        options={languageOptions}
                        value={draft.language}
                        onChange={(value) =>
                          patch({ language: value as AssistantPersonaLanguage })
                        }
                      />

                      {/* §11.3 的两个开关 —— 它们同样改**说话方式**，所以与语气
                          长度同列，⛔ 不自成一块（同一件事分两处摆要找两遍）。 */}
                      <PersonaSwitchRow
                        label={t('nextStepHintLabel')}
                        hint={t('nextStepHintHint')}
                        checked={draft.nextStepHint}
                        onChange={(next) => patch({ nextStepHint: next })}
                        testId="assistant-next-step-hint"
                      />
                      <PersonaSwitchRow
                        label={t('useMyWordsLabel')}
                        hint={t('useMyWordsHint')}
                        checked={draft.useMyWords}
                        onChange={(next) => patch({ useMyWords: next })}
                        testId="assistant-use-my-words"
                      />
                    </div>
                  ) : null}
                </section>
              </div>
            </TabsContent>

            <TabsContent value={ASSISTANT_SETTINGS_SECTIONS.rules}>
              <div
                data-testid="assistant-rules"
                className="flex flex-col gap-2"
              >
                <p className="text-md text-muted-foreground">
                  {t('rulesHint')}
                </p>
                {/*
                  ⭐ **新增一条**（v2 §9.3）：这一页此前是只读的，因为普通规则从
                    工作里长出来（助手记）。来源名单不一样 —— 「只信官方设定集」
                    是用户自己的决定，没有哪句对话会让助手替他做。所以新增在这里，
                    且**必须选类型**：三种规则的后果完全不同。
                */}
                <form
                  data-testid="assistant-rule-add"
                  className="flex flex-col gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const text = ruleDraft.trim()
                    if (!text) return
                    void rules.add({ text, kind: ruleKind }).then((ok) => {
                      if (ok) setRuleDraft('')
                    })
                  }}
                >
                  <ToggleGroup
                    type="single"
                    value={ruleKind}
                    onValueChange={(value) => {
                      if (value) setRuleKind(value as ProjectRuleKindId)
                    }}
                    className="justify-start"
                  >
                    {PROJECT_RULE_KINDS.map((kind) => (
                      <ToggleGroupItem
                        key={kind}
                        value={kind}
                        data-testid={`assistant-rule-kind-${kind}`}
                        aria-label={t(`ruleKind.${kind}`)}
                        className="text-md"
                      >
                        {t(`ruleKind.${kind}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={ruleDraft}
                      data-testid="assistant-rule-input"
                      aria-label={t('ruleAddLabel')}
                      maxLength={ASSISTANT_PROJECT_RULE_LIMITS.maxTextChars}
                      placeholder={
                        ruleKind === PROJECT_RULE_KIND_IDS.note
                          ? t('rulePlaceholderNote')
                          : t('rulePlaceholderSource')
                      }
                      onChange={(event) => setRuleDraft(event.target.value)}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      data-testid="assistant-rule-add-submit"
                      disabled={!ruleDraft.trim()}
                    >
                      {t('ruleAdd')}
                    </Button>
                  </div>
                </form>
                {rules.isLoading ? (
                  <p className="flex items-center gap-1.5 text-md text-muted-foreground">
                    <Spinner size="sm" />
                    {t('rulesLoading')}
                  </p>
                ) : null}
                {!rules.isLoading && rules.rules.length === 0 ? (
                  <p className="text-md text-muted-foreground">
                    {t('rulesEmpty')}
                  </p>
                ) : null}
                {/*
                  ⚠ **同类相邻 + 每条带类型标签**（§9.3）：三种规则的后果完全不同
                    （一句话的约束 / 只打这几个源 / 永远不打这个源），乱序混成一列
                    的表现是用户看不出自己到底设了一个多硬的闸。⛔ 不做成三段折叠：
                    绝大多数用户只有普通规则那一段，两段空标题比乱序更吵。
                */}
                {sortedRules.map((rule) => (
                  <div
                    key={rule.id}
                    data-testid="assistant-rule-item"
                    data-rule-kind={rule.kind}
                    className="flex items-start gap-2 rounded-r-md border-l-2 border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-sm leading-snug text-foreground">
                        {rule.text}
                      </p>
                      <p className="text-md text-muted-foreground">
                        {rule.kind === PROJECT_RULE_KIND_IDS.note
                          ? tRule('recordedOn', {
                              date: rule.createdAt.slice(0, 10),
                            })
                          : `${t(`ruleKind.${rule.kind}`)} · ${tRule(
                              'recordedOn',
                              {
                                date: rule.createdAt.slice(0, 10),
                              },
                            )}`}
                      </p>
                    </div>
                    {/* ⛔ 没有「编辑」：改一条规则 = 删掉再让助手记一条新的。
                        就地编辑会让「记于…」那一行立刻变成假话。 */}
                    <button
                      type="button"
                      data-testid="assistant-rule-delete"
                      aria-label={t('ruleDelete')}
                      title={t('ruleDelete')}
                      onClick={() => void rules.remove(rule.id)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-fast ease-standard hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
                {rules.error ? (
                  <p role="alert" className="text-md text-status-risk">
                    {rules.error}
                  </p>
                ) : null}
              </div>
            </TabsContent>

            {/* ── 上下文卡（第三期 K1 的入口）────────────────────────
                ⚠ 这一页与规则页**不是同一种页**：卡是用户自己写的资料，所以有
                  新建与编辑；规则是从工作里长出来的，所以那一页只读。 */}
            <TabsContent value={ASSISTANT_SETTINGS_SECTIONS.cards}>
              <div
                data-testid="assistant-context-cards"
                className="flex flex-col gap-2"
              >
                {/* ── 待确认区（v2 §8.1）：助手提议的卡在**卡表之上** ──────
                    ⚠ 它排在最前是因为它是**待办**：卡表是已经成立的东西，
                      而这几张在等一个决定。⛔ 没有提议时整块不画。 */}
                {proposedCards.cards.length > 0 ? (
                  <section
                    data-testid="assistant-context-cards-proposed"
                    className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2.5"
                  >
                    <p className="text-2sm font-semibold uppercase tracking-nav text-muted-foreground">
                      {t('cardsProposedTitle', {
                        count: proposedCards.cards.length,
                      })}
                    </p>
                    <p className="text-md text-muted-foreground">
                      {t('cardsProposedHint')}
                    </p>
                    {proposedCards.cards.map((card) => (
                      <div
                        key={card.id}
                        data-testid="assistant-context-card-proposed-item"
                        className="flex items-start gap-2 rounded-md bg-card px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p className="truncate text-sm leading-snug text-foreground">
                            <span className="font-mono text-2xs uppercase tracking-nav text-muted-foreground">
                              {tCards(`kind.${card.kind}`)}
                            </span>{' '}
                            {card.name}
                          </p>
                          {card.summary ? (
                            <p className="truncate text-md text-muted-foreground">
                              {card.summary}
                            </p>
                          ) : null}
                        </div>
                        {/* ⚠ 「存下」= 翻面成已确认（⛔ 不再建一行：这一行已经
                            在库里了），「删掉」= 真删。两件事各自一颗按钮。 */}
                        <button
                          type="button"
                          data-testid="assistant-context-card-confirm"
                          aria-label={t('cardConfirm', { name: card.name })}
                          title={t('cardConfirm', { name: card.name })}
                          onClick={() =>
                            void proposedCards
                              .update(card.id, {
                                status: CONTEXT_CARD_STATUS_IDS.confirmed,
                              })
                              .then((saved) => {
                                if (!saved) return
                                // 翻面之后它属于卡表那一份，两份各自重拉。
                                void proposedCards.reload()
                                void cards.reload()
                              })
                          }
                          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Check className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          data-testid="assistant-context-card-reject"
                          aria-label={t('cardReject', { name: card.name })}
                          title={t('cardReject', { name: card.name })}
                          onClick={() => void proposedCards.remove(card.id)}
                          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-fast ease-standard hover:text-status-risk focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    ))}
                    {proposedCards.error ? (
                      <p role="alert" className="text-md text-status-risk">
                        {proposedCards.error}
                      </p>
                    ) : null}
                  </section>
                ) : null}
                <p className="text-md text-muted-foreground">
                  {t('cardsHint')}
                </p>
                {cards.isLoading ? (
                  <p className="flex items-center gap-1.5 text-md text-muted-foreground">
                    <Spinner size="sm" />
                    {t('cardsLoading')}
                  </p>
                ) : null}
                {!cards.isLoading && cards.cards.length === 0 ? (
                  <p className="text-md text-muted-foreground">
                    {t('cardsEmpty')}
                  </p>
                ) : null}
                {cards.cards.map((card) => (
                  <div
                    key={card.id}
                    data-testid="assistant-context-card-item"
                    className="flex items-start gap-2 rounded-r-md border-l-2 border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="truncate text-sm leading-snug text-foreground">
                        <span className="font-mono text-2xs uppercase tracking-nav text-muted-foreground">
                          {tCards(`kind.${card.kind}`)}
                        </span>{' '}
                        {card.name}
                      </p>
                      {card.summary ? (
                        <p className="truncate text-md text-muted-foreground">
                          {card.summary}
                        </p>
                      ) : null}
                      {/* ⭐ 常挂开关就地放（⛔ 不要求先打开编辑器）：「这一台上
                          带不带它」是随手切的判断，进一层弹层就没人切了。
                          ⚠ 没有 scope 时不画它 —— 没有「这里」可挂。 */}
                      {scope ? (
                        <label className="mt-0.5 flex items-center gap-1.5 text-md text-muted-foreground">
                          <Switch
                            data-testid="assistant-context-card-pin"
                            checked={card.pinnedScopes.includes(scope)}
                            onCheckedChange={(next) =>
                              void cards.setPinned(card.id, scope, next)
                            }
                          />
                          {t('cardPinnedHere')}
                        </label>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      data-testid="assistant-context-card-edit"
                      aria-label={t('cardEdit', { name: card.name })}
                      title={t('cardEdit', { name: card.name })}
                      onClick={() => setCardEditing(card)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
                {cards.error ? (
                  <p role="alert" className="text-md text-status-risk">
                    {cards.error}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  data-testid="assistant-context-card-new"
                  className="h-9 self-start"
                  onClick={() => setCardEditing('new')}
                >
                  <Plus className="size-3.5" aria-hidden />
                  {t('cardNew')}
                </Button>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* ⚠ 编辑器**挂在设置弹层里**而不是它的兄弟：关掉设置就该把它一起带走，
            ⛔ 别留一个飘在页面上的孤儿弹层。
            ⚠ 存完重拉一遍列表（`reload`）：新建那张不出现在列表里的表现是
              「保存了但什么都没发生」。 */}
        {cardEditing ? (
          <ContextCardDialog
            open
            onOpenChange={(next) => {
              if (!next) setCardEditing(null)
            }}
            card={cardEditing === 'new' ? null : cardEditing}
            {...(scope ? { scope } : {})}
            onSaved={() => {
              setCardEditing(null)
              void cards.reload()
            }}
          />
        ) : null}

        <ResponsiveDialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 lg:px-6">
          {/* **bug 1** 的落点：失败就地说话，⛔ 不是一条会自己走掉的 toast ——
              用户此刻的注意力在这颗弹层里。
              ⚠ 这颗 `role="alert"` **常驻**（失败前是空的）：live region 得在
              内容变化之前就挂在树上，读屏才会念出来；等失败那一刻才插一个新
              节点，很多读屏根本不播。 */}
          <p
            role="alert"
            data-testid="assistant-persona-save-error"
            className="mr-auto flex min-w-0 items-center gap-1.5 text-md text-status-risk"
          >
            {saveFailed ? (
              <>
                <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                {t('saveFailed')}
              </>
            ) : null}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-9"
              onClick={() => handleOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            {/* ⚠ 规则页与卡片页**都没有保存**：删除 / 常挂是即时的（它们改的是库里
                那一行），而建卡改卡有自己那颗保存。摆一颗在这儿只会让人以为
                不点就没生效。 */}
            {tab === ASSISTANT_SETTINGS_SECTIONS.persona ? (
              <Button
                type="button"
                className="h-9"
                disabled={isSaving}
                onClick={() => void handleSave()}
              >
                {/* 常驻一个 14px 的槽 —— spinner 进出时按钮宽度不跳
                    （`ui-defaults.md §5` loading 态）。 */}
                <span className="grid size-3.5 place-items-center">
                  {isSaving ? <Spinner size="sm" /> : null}
                </span>
                {t('save')}
              </Button>
            ) : null}
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
