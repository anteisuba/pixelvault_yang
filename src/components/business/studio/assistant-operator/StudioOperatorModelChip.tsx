'use client'

/**
 * 输入区**文本模型 chip**（v2 §4.5 · 画板 BCards「文本模型选择器展开」）。
 *
 * ⭐ **「自动」是真选项**：排第一、默认值，选中时打勾。
 * ⛔ 不是「没选时的占位文案」—— 旧的 `CanvasAssistantRouteSelector` 就是那样，
 * 于是「我明确要自动」这件事根本没有表达手段。
 *
 * ⭐ **「自动」挑的是哪一家就写在 chip 上**（owner 2026-10-15「全跟助手」）：
 * 「自动 · DeepSeek V4.1 Flash」。挑法与服务端是**同一个函数**
 * （`pickAutoAssistantRouteModel`：`ASSISTANT_PROVIDER_ORDER` 里第一家配了 key 的默认档），
 * 所以 chip 上写的就是这一轮、以及标签台翻译 / 试读 / 「满意」评估那几样小功能真的会打的那个。
 * 一把 key 都没有时点「自动」就地开 `QuickSetupDialog`（顺序里的第一家，Gemini 有免费档），
 * 配好才选上。
 *
 * ⭐ **选择持久化在 `AssistantPersona.routeModel`**（用户级一份）：模型偏好是
 * 「我喜欢用哪个脑子」，属于人设而不是某一次对话 —— 存会话意味着每开一个新会话
 * 都要重选一次，而新会话恰恰是最不想做设置的时刻。⛔ 面板不再有任何内存态。
 *
 * ⭐ **助手自己的一颗**：⛔ 不复用 `components/business/node/` 的画布选择器 ——
 * 那是画布的，两边的「自动」语义本来就不是一回事（画布有 gateway 分支，studio
 * 没有）。共用一颗组件的下场是「界面显示 GPT、实际打 Gemini」（2026-08-19 生产
 * 事故）。
 *
 * ⚠ 缺 key 的模型**照列不禁用**（Hard Rule 8）：点它进 `QuickSetupDialog` 就地
 * 配，配完即选中。⛔ 不做灰掉的死选项。
 */

import { useCallback, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_ROUTE_MODEL_AUTO,
  getAssistantRouteModelEntry,
  pickAutoAssistantRouteModel,
  type AssistantRouteModel,
} from '@/constants/assistant-persona'
import { ASSISTANT_PROVIDER_ORDER } from '@/constants/assistant'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import {
  getDefaultProviderConfig,
  getProviderLabel,
  type AI_ADAPTER_TYPES,
} from '@/constants/providers'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { useLLMRoutePicker } from '@/hooks/use-llm-route-picker'
import { cn } from '@/lib/utils'

type RouteModel = (typeof NODE_STUDIO_ASSISTANT_ROUTE_MODELS)[number]

interface RouteModelGroup {
  adapterType: AI_ADAPTER_TYPES
  providerLabel: string
  models: RouteModel[]
}

/**
 * 路由表 → 按厂商分组，**保持表里的出场顺序**（第一条就是那个厂商的默认档，
 * 与服务端 `resolveAssistantModelId` 认的是同一条）。⛔ 不排序、⛔ 不筛选：
 * 「列全部模型」是 §4.5 写死的规则。
 */
function groupRouteModels(): RouteModelGroup[] {
  const groups: RouteModelGroup[] = []
  for (const model of NODE_STUDIO_ASSISTANT_ROUTE_MODELS) {
    const existing = groups.find((g) => g.adapterType === model.adapterType)
    if (existing) {
      existing.models.push(model)
      continue
    }
    groups.push({
      adapterType: model.adapterType,
      providerLabel: getProviderLabel(
        getDefaultProviderConfig(model.adapterType),
      ),
      models: [model],
    })
  }
  return groups
}

/** 路由表是编译期常量 —— 分组只算一次，⛔ 不进 `useMemo`（那是给 props 用的）。 */
const ROUTE_MODEL_GROUPS = groupRouteModels()

interface QuickSetupState {
  open: boolean
  modelId: string
  modelLabel: string
  adapterType: AI_ADAPTER_TYPES
  /** 配好之后选上的是「自动」（一把 key 都没有时点了「自动」），而不是这一档。 */
  commitAuto?: boolean
}

/** 一把 key 都没有时点「自动」要配的那一档：顺序里第一家的默认档（Gemini 有免费档）。 */
const AUTO_SETUP_MODEL = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
  (model) => model.adapterType === ASSISTANT_PROVIDER_ORDER[0],
)

export interface StudioOperatorModelChipProps {
  /** `auto` 或路由表里的一个 modelId —— 真值来自 `persona.routeModel`。 */
  value: AssistantRouteModel
  /**
   * 选中即写 persona。返回 `false` 表示没存上 —— chip 会把乐观显示的那一档撤回，
   * ⛔ 不留一个「看起来选上了、实际没存」的假状态。
   */
  onChange(next: AssistantRouteModel): void | boolean | Promise<boolean>
  /**
   * 受控开合（可选）—— 错误条那颗「换个模型」要从外面把这张选单打开
   * （2026-10-14 设计方案 §9.1）。缺席 = 自己管。
   */
  open?: boolean
  onOpenChange?(next: boolean): void
}

export function StudioOperatorModelChip({
  value,
  onChange,
  open: openProp,
  onOpenChange,
}: StudioOperatorModelChipProps) {
  const t = useTranslations('StudioOperator.modelChip')
  const [localOpen, setLocalOpen] = useState(false)
  const open = openProp ?? localOpen
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setLocalOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange, openProp],
  )
  /**
   * 乐观显示：写库那一跳回来之前 chip 上就是用户刚点的那一档。
   *
   * ⚠ 连**点下去时的真值**（`base`）一起记：`value` 一旦离开 base，说明 persona
   * 已经回填，乐观值当场失效。⛔ 不用 effect 去清它 —— 那是一次同步 setState，
   * 会多跑一轮渲染（`react-hooks` 的闸也拦）。
   */
  const [pending, setPending] = useState<{
    next: AssistantRouteModel
    base: AssistantRouteModel
  } | null>(null)
  const [quickSetup, setQuickSetup] = useState<QuickSetupState>({
    open: false,
    modelId: '',
    modelLabel: '',
    adapterType: NODE_STUDIO_ASSISTANT_ROUTE_MODELS[0].adapterType,
  })
  /** 哪些模型已经有 key —— 没有的那些点下去走 `QuickSetupDialog`。 */
  const { savedRoutes, hasLoaded: keysLoaded } = useLLMRoutePicker('assistant')
  const boundModelIds = useMemo(
    () => new Set(savedRoutes.map((route) => route.modelId)),
    [savedRoutes],
  )
  /**
   * **确定**缺 key。⚠ key 名单回来之前 `savedRoutes` 是空的 —— 那是「不知道」，
   * ⛔ 不标「需要 key」、不弹配置，点了照常写 persona。
   */
  const needsKey = useCallback(
    (modelId: string) => keysLoaded && !boundModelIds.has(modelId),
    [boundModelIds, keysLoaded],
  )
  const selected = pending && pending.base === value ? pending.next : value
  /**
   * 「自动」此刻挑的那一档（与服务端 `resolveAssistantRoute` 同一个函数）。
   * ⚠ key 名单回来之前是 `null` —— 那是「不知道」，chip 上只写「自动」。
   */
  const autoPick = useMemo(
    () =>
      keysLoaded
        ? pickAutoAssistantRouteModel(
            savedRoutes.map((route) => route.adapterType),
          )
        : null,
    [keysLoaded, savedRoutes],
  )

  const commit = useCallback(
    async (next: AssistantRouteModel) => {
      setOpen(false)
      setPending({ next, base: value })
      const ok = await onChange(next)
      // 没存上就撤回，⛔ 不留一个「看起来选上了、实际没存」的假状态。
      if (ok === false) setPending(null)
    },
    [onChange, setOpen, value],
  )

  /** 点「自动」：一把 key 都没有就先就地配（Hard Rule 8），配好才选上。 */
  const handlePickAuto = useCallback(() => {
    if (keysLoaded && !autoPick && AUTO_SETUP_MODEL) {
      setOpen(false)
      setQuickSetup({
        open: true,
        modelId: AUTO_SETUP_MODEL.modelId,
        modelLabel: AUTO_SETUP_MODEL.label,
        adapterType: AUTO_SETUP_MODEL.adapterType,
        commitAuto: true,
      })
      return
    }
    void commit(ASSISTANT_ROUTE_MODEL_AUTO)
  }, [autoPick, commit, keysLoaded, setOpen])

  const handlePick = useCallback(
    (model: RouteModel) => {
      if (needsKey(model.modelId)) {
        setOpen(false)
        setQuickSetup({
          open: true,
          modelId: model.modelId,
          modelLabel: model.label,
          adapterType: model.adapterType,
        })
        return
      }
      void commit(model.modelId)
    },
    [commit, needsKey, setOpen],
  )

  const selectedLabel =
    selected === ASSISTANT_ROUTE_MODEL_AUTO
      ? autoPick
        ? t('autoResolved', { model: autoPick.label })
        : t('auto')
      : (NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
          (model) => model.modelId === selected,
        )?.label ?? t('auto'))

  return (
    <>
      <ResponsivePopover open={open} onOpenChange={setOpen}>
        <ResponsivePopoverTrigger asChild>
          <button
            type="button"
            data-testid="operator-model-chip"
            aria-label={t('label')}
            data-open={open || undefined}
            /* D12 T-A：一行**灰字**，不穿框（输入区整块只有一个边框）；hover /
               展开才垫一层浅底。⛔ 不翻成近黑信号位：那一档只给发送键。 */
            className={cn(
              'flex h-8 min-w-0 shrink items-center gap-1 rounded-md px-1.5 text-xs transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
              open ? 'bg-accent text-foreground' : 'text-muted-foreground',
            )}
          >
            <span className="max-w-48 truncate">{selectedLabel}</span>
            {/* 收着朝下、展开朝上（画板 BCards 两态）——箭头方向本身就是那一句
                「它会往上开」。 */}
            {/* 输入条窄时箭头让位给字（思考 chip 同一道门槛）。 */}
            {open ? (
              <ChevronUp
                className="hidden size-3 shrink-0 @assistant-bar:block"
                aria-hidden
              />
            ) : (
              <ChevronDown
                className="hidden size-3 shrink-0 @assistant-bar:block"
                aria-hidden
              />
            )}
          </button>
        </ResponsivePopoverTrigger>
        {/* 固定高度 + 自己滚（画板：列表区 320px 可滚动）——⛔ 不让它顶着面板长高。 */}
        <ResponsivePopoverContent
          side="top"
          align="start"
          label={t('label')}
          /* 三层玻璃③：**浮层**（§12.1）。 */
          className="w-64 rounded-xl border-assistant-line-strong p-0 assistant-glass-overlay shadow-assistant-overlay"
          mobileClassName="px-0"
        >
          <div
            role="menu"
            aria-label={t('label')}
            data-testid="operator-model-chip-menu"
            className="flex h-80 flex-col gap-0.5 overflow-y-auto p-1.5"
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={selected === ASSISTANT_ROUTE_MODEL_AUTO}
              data-testid="operator-model-option-auto"
              onClick={handlePickAuto}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-fast ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected === ASSISTANT_ROUTE_MODEL_AUTO && 'bg-muted',
              )}
            >
              <span className="flex flex-col gap-px">
                <span className="text-2sm font-medium text-foreground">
                  {t('auto')}
                </span>
                <span
                  data-testid="operator-model-option-auto-hint"
                  className="text-2xs text-muted-foreground"
                >
                  {autoPick
                    ? t('autoHintResolved', { model: autoPick.label })
                    : keysLoaded
                      ? t('autoHintNoKey')
                      : t('autoHint')}
                </span>
              </span>
              {selected === ASSISTANT_ROUTE_MODEL_AUTO ? (
                <Check
                  className="size-3.5 shrink-0 text-foreground"
                  aria-hidden
                />
              ) : null}
            </button>
            {ROUTE_MODEL_GROUPS.map((group) => (
              <div key={group.adapterType} className="flex flex-col gap-0.5">
                <p className="mt-0.5 border-t border-border/60 px-2.5 pt-2.5 pb-1 text-3xs tracking-nav text-muted-foreground">
                  {group.providerLabel}
                </p>
                {group.models.map((model) => {
                  const isSelected = selected === model.modelId
                  const missingKey = needsKey(model.modelId)
                  return (
                    <button
                      key={model.modelId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      data-testid={`operator-model-option-${model.modelId}`}
                      onClick={() => handlePick(model)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-2sm text-foreground transition-colors duration-fast ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isSelected && 'bg-muted font-medium',
                      )}
                    >
                      <span className="truncate">{model.label}</span>
                      {isSelected ? (
                        <Check
                          className="size-3.5 shrink-0 text-foreground"
                          aria-hidden
                        />
                      ) : missingKey ? (
                        <span className="shrink-0 text-3xs text-muted-foreground">
                          {t('needsKey')}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </ResponsivePopoverContent>
      </ResponsivePopover>

      {/*
        配完 key 就是用户刚才想选的那一档 —— ⛔ 不让他配完再点一次。
        ⚠ **开着才挂**：这颗弹层要读 API key 上下文，常挂等于让每一个渲染 chip 的
        地方都背上那份依赖，而它一年里只开几次。
      */}
      {quickSetup.open ? (
        <QuickSetupDialog
          open={quickSetup.open}
          onOpenChange={(next) =>
            setQuickSetup((current) => ({ ...current, open: next }))
          }
          modelId={quickSetup.modelId}
          modelLabel={quickSetup.modelLabel}
          adapterType={quickSetup.adapterType}
          optionId={`llm-route:assistant:setup:${quickSetup.modelId}`}
          onVerified={(modelId) => {
            if (quickSetup.commitAuto) {
              void commit(ASSISTANT_ROUTE_MODEL_AUTO)
              return
            }
            // 词表外的 id 不该落进 persona —— 对表之后再存（同一张路由表）。
            const entry = getAssistantRouteModelEntry(modelId)
            if (entry) void commit(entry.modelId)
          }}
        />
      ) : null}
    </>
  )
}
