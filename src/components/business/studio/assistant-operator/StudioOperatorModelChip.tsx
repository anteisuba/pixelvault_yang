'use client'

/**
 * 输入区**文本模型 chip**（v2 §4.5 · 画板 BCards「文本模型选择器展开」）。
 *
 * ⭐ **「自动」是真选项**：排第一、默认值、带副标「按任务挑模型」，选中时打勾。
 * ⛔ 不是「没选时的占位文案」—— 旧的 `CanvasAssistantRouteSelector` 就是那样，
 * 于是「我明确要自动」这件事根本没有表达手段。
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
import { Check, ChevronUp } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_ROUTE_MODEL_AUTO,
  getAssistantRouteModelEntry,
  type AssistantRouteModel,
} from '@/constants/assistant-persona'
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
}

export interface StudioOperatorModelChipProps {
  /** `auto` 或路由表里的一个 modelId —— 真值来自 `persona.routeModel`。 */
  value: AssistantRouteModel
  /**
   * 选中即写 persona。返回 `false` 表示没存上 —— chip 会把乐观显示的那一档撤回，
   * ⛔ 不留一个「看起来选上了、实际没存」的假状态。
   */
  onChange(next: AssistantRouteModel): void | boolean | Promise<boolean>
}

export function StudioOperatorModelChip({
  value,
  onChange,
}: StudioOperatorModelChipProps) {
  const t = useTranslations('StudioOperator.modelChip')
  const [open, setOpen] = useState(false)
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
  const { savedRoutes } = useLLMRoutePicker('assistant')
  const boundModelIds = useMemo(
    () => new Set(savedRoutes.map((route) => route.modelId)),
    [savedRoutes],
  )
  const selected = pending && pending.base === value ? pending.next : value

  const commit = useCallback(
    async (next: AssistantRouteModel) => {
      setOpen(false)
      setPending({ next, base: value })
      const ok = await onChange(next)
      // 没存上就撤回，⛔ 不留一个「看起来选上了、实际没存」的假状态。
      if (ok === false) setPending(null)
    },
    [onChange, value],
  )

  const handlePick = useCallback(
    (model: RouteModel) => {
      if (!boundModelIds.has(model.modelId)) {
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
    [boundModelIds, commit],
  )

  const selectedLabel =
    selected === ASSISTANT_ROUTE_MODEL_AUTO
      ? t('auto')
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
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="max-w-32 truncate">{selectedLabel}</span>
            <ChevronUp className="size-3.5 shrink-0" aria-hidden />
          </button>
        </ResponsivePopoverTrigger>
        {/* 固定高度 + 自己滚（画板：列表区 320px 可滚动）——⛔ 不让它顶着面板长高。 */}
        <ResponsivePopoverContent
          side="top"
          align="start"
          label={t('label')}
          className="w-72 p-0"
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
              onClick={() => void commit(ASSISTANT_ROUTE_MODEL_AUTO)}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected === ASSISTANT_ROUTE_MODEL_AUTO && 'bg-muted',
              )}
            >
              <span className="flex flex-col gap-px">
                <span className="text-2sm font-medium text-foreground">
                  {t('auto')}
                </span>
                <span className="text-2xs text-muted-foreground">
                  {t('autoHint')}
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
                  const needsKey = !boundModelIds.has(model.modelId)
                  return (
                    <button
                      key={model.modelId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      data-testid={`operator-model-option-${model.modelId}`}
                      onClick={() => handlePick(model)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-2sm text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isSelected && 'bg-muted font-medium',
                      )}
                    >
                      <span className="truncate">{model.label}</span>
                      {isSelected ? (
                        <Check
                          className="size-3.5 shrink-0 text-foreground"
                          aria-hidden
                        />
                      ) : needsKey ? (
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
            // 词表外的 id 不该落进 persona —— 对表之后再存（同一张路由表）。
            const entry = getAssistantRouteModelEntry(modelId)
            if (entry) void commit(entry.modelId)
          }}
        />
      ) : null}
    </>
  )
}
