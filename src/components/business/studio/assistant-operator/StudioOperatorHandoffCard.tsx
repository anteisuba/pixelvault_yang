'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import { CANVAS_NEW_PROJECT_QUERY_VALUE } from '@/constants/routes'
import type { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'
import { useRecentCanvases } from '@/hooks/node/use-recent-canvases'

/**
 * **把这件事交到另一处去**的卡 —— 一句要带过去的话 + 一行「会发生什么」+ 两颗键。
 *
 * 两种用法共用这一张（同一个形状，⛔ 不各画一套）：
 *  · 交给图片助手（卡片助手 C3，画板 S11；owner 09-27 选「跳过去，话填好你来发」）；
 *  · 换到另一台图片工作台（自然语言台 ↔ 标签台，owner 2026-10-04）。
 * 点下去都是**跳过去、把话填进那边的输入框，由用户按发送**。⛔ 不报价、不替用户发。
 * ⚠ 已决之后整卡收成一行「态 · 时间」（确认卡不离场）。
 */

interface StudioOperatorHandoffCardProps {
  /** `data-testid` 前缀：卡是 `${testId}-card`，主键是 `${testId}-accept`。 */
  testId: string
  status: StudioOperatorConfirmPrompt['status']
  decidedAt?: string
  header: string
  /** 要带过去的那句话；没有就不画那一格。 */
  request?: string
  hint: string
  /** 两颗键上面的那一格（交到画布时选哪块画布）。 */
  children?: ReactNode
  acceptLabel: string
  dismissLabel: string
  acceptedLabel(time: string): string
  /** 收起后那一行的主语（角色名 / 模型名）。 */
  subject: string
  onAccept(): void
  onDismiss(): void
  formatTime(iso: string): string
}

function StudioOperatorHandoffCard({
  testId,
  status,
  decidedAt,
  header,
  request,
  hint,
  children,
  acceptLabel,
  dismissLabel,
  acceptedLabel,
  subject,
  onAccept,
  onDismiss,
  formatTime,
}: StudioOperatorHandoffCardProps) {
  const t = useTranslations('StudioOperator')

  if (
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
  ) {
    const time = decidedAt ? formatTime(decidedAt) : ''
    return (
      <section
        data-testid={`${testId}-card`}
        data-status={status}
        className="overflow-hidden rounded-xl bg-card"
      >
        <p className="flex items-center gap-2 px-3 py-2 text-2sm text-muted-foreground">
          <span className="shrink-0 font-semibold">
            {status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
              ? acceptedLabel(time)
              : t('confirm.state.cancelled', { time })}
          </span>
          <span className="min-w-0 flex-1 truncate">{subject}</span>
        </p>
      </section>
    )
  }

  return (
    <section
      data-testid={`${testId}-card`}
      data-status={status}
      className="overflow-hidden rounded-xl bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-2xs uppercase tracking-nav text-muted-foreground">
          {header}
        </span>
      </div>
      <div className="flex flex-col gap-2.5 p-3">
        {request ? (
          <p className="whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">
            {request}
          </p>
        ) : null}
        <p className="text-2xs text-muted-foreground">{hint}</p>
        {children}
        <div className="flex items-center justify-end gap-1.5 border-t border-border pt-2.5">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-border bg-card px-3 py-1 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {dismissLabel}
          </button>
          <button
            type="button"
            data-testid={`${testId}-accept`}
            onClick={onAccept}
            className="rounded-md bg-primary px-3 py-1 text-2sm text-primary-foreground transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </section>
  )
}

type ImageHandoffPrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.imageHandoff }
>

export interface StudioOperatorImageHandoffCardProps {
  prompt: ImageHandoffPrompt
  characterName: string
  assistantName: string
  onAccept(): void
  onDismiss(): void
  formatTime(iso: string): string
}

/** 交给图片助手（卡片助手 C3）。 */
export function StudioOperatorImageHandoffCard({
  prompt,
  characterName,
  assistantName,
  onAccept,
  onDismiss,
  formatTime,
}: StudioOperatorImageHandoffCardProps) {
  const t = useTranslations('StudioOperator')
  return (
    <StudioOperatorHandoffCard
      testId="operator-image-handoff"
      status={prompt.status}
      decidedAt={prompt.decidedAt}
      header={t('confirm.imageHandoff.header', { name: assistantName })}
      request={prompt.handoff.request}
      hint={t('confirm.imageHandoff.hint', { name: characterName })}
      acceptLabel={t('confirm.imageHandoff.accept')}
      dismissLabel={t('confirm.imageHandoff.dismiss')}
      acceptedLabel={(time) => t('confirm.imageHandoff.accepted', { time })}
      subject={characterName}
      onAccept={onAccept}
      onDismiss={onDismiss}
      formatTime={formatTime}
    />
  )
}

type WorkbenchHandoffPrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.workbenchHandoff }
>

export interface StudioOperatorWorkbenchHandoffCardProps {
  prompt: WorkbenchHandoffPrompt
  onAccept(): void
  onDismiss(): void
  formatTime(iso: string): string
}

/** 换到另一台图片工作台（自然语言台 ↔ 标签台）。 */
export function StudioOperatorWorkbenchHandoffCard({
  prompt,
  onAccept,
  onDismiss,
  formatTime,
}: StudioOperatorWorkbenchHandoffCardProps) {
  const t = useTranslations('StudioOperator')
  const bench = t(
    prompt.handoff.workspace === 'image-tags'
      ? 'confirm.workbenchHandoff.tags'
      : 'confirm.workbenchHandoff.natural',
  )
  return (
    <StudioOperatorHandoffCard
      testId="operator-workbench-handoff"
      status={prompt.status}
      decidedAt={prompt.decidedAt}
      header={t('confirm.workbenchHandoff.header', {
        bench,
        model: prompt.handoff.label,
      })}
      request={prompt.handoff.request}
      hint={t('confirm.workbenchHandoff.hint', { bench })}
      acceptLabel={t('confirm.workbenchHandoff.accept')}
      dismissLabel={t('confirm.workbenchHandoff.dismiss')}
      acceptedLabel={(time) =>
        t('confirm.workbenchHandoff.accepted', { bench, time })
      }
      subject={prompt.handoff.label}
      onAccept={onAccept}
      onDismiss={onDismiss}
      formatTime={formatTime}
    />
  )
}

type UpscalePrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.upscale }
>

export interface StudioOperatorUpscaleCardProps {
  prompt: UpscalePrompt
  onAccept(): void
  onDismiss(): void
  formatTime(iso: string): string
}

/**
 * 画布上放大几张卡（P6，owner 2026-10-16「修到 4K」走放大）。同一张卡的形状：要放大的那几张
 * + 一行「会发生什么」（新版本、原图留着、你的 fal key、不扣积分）+ 两颗键。
 */
export function StudioOperatorUpscaleCard({
  prompt,
  onAccept,
  onDismiss,
  formatTime,
}: StudioOperatorUpscaleCardProps) {
  const t = useTranslations('StudioOperator')
  const names = prompt.request.nodes.map((node) => `「${node.name}」`).join('')
  return (
    <StudioOperatorHandoffCard
      testId="operator-upscale"
      status={prompt.status}
      decidedAt={prompt.decidedAt}
      header={t('confirm.upscale.header', {
        count: prompt.request.nodes.length,
      })}
      request={names}
      hint={t('confirm.upscale.hint')}
      acceptLabel={t('confirm.upscale.accept')}
      dismissLabel={t('confirm.upscale.dismiss')}
      acceptedLabel={(time) =>
        t(
          prompt.auto
            ? 'confirm.upscale.autoAccepted'
            : 'confirm.upscale.accepted',
          {
            time,
          },
        )
      }
      subject={names}
      onAccept={onAccept}
      onDismiss={onDismiss}
      formatTime={formatTime}
    />
  )
}

type MoveWorkPrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.moveWork }
>

export interface StudioOperatorMoveWorkCardProps {
  prompt: MoveWorkPrompt
  /** 工作台 → 画布带着选中的那块画布（`new` = 新建一块）。 */
  onAccept(projectId?: string): void
  onDismiss(): void
  formatTime(iso: string): string
}

/** 卡上最多列几块最近的画布（再多就去画布里切）。 */
const MOVE_WORK_RECENT_LIMIT = 4

/**
 * **交到另一台接着做**（P6 台间交接）。同一张卡的形状：下一句话 + 一行「会带过去什么」+ 两颗键。
 * 工作台 → 画布多一格「交到哪块画布」（owner 2026-10-17「卡上让我选，默认最近」）：最近几块 +
 * 新建一块，默认最近那块；一块都没有就默认新建。
 */
export function StudioOperatorMoveWorkCard({
  prompt,
  onAccept,
  onDismiss,
  formatTime,
}: StudioOperatorMoveWorkCardProps) {
  const t = useTranslations('StudioOperator')
  const toCanvas = prompt.request.to === 'canvas'
  const side = toCanvas ? 'canvas' : 'workbench'
  const names = prompt.request.node ? `「${prompt.request.node.name}」` : ''
  const recent = useRecentCanvases()
  const { status: recentStatus, load: loadRecent } = recent
  const idle = prompt.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    if (toCanvas && idle && recentStatus === 'idle') void loadRecent()
  }, [idle, loadRecent, recentStatus, toCanvas])

  const projects = recent.projects.slice(0, MOVE_WORK_RECENT_LIMIT)
  const target =
    picked ??
    (recent.status === 'ready'
      ? (projects[0]?.id ?? CANVAS_NEW_PROJECT_QUERY_VALUE)
      : recent.status === 'failed'
        ? CANVAS_NEW_PROJECT_QUERY_VALUE
        : null)
  const targetName =
    target === CANVAS_NEW_PROJECT_QUERY_VALUE
      ? t('confirm.moveWork.canvas.newProject')
      : (projects.find((project) => project.id === target)?.name ?? '')

  const options = [
    ...projects.map((project) => ({ id: project.id, label: project.name })),
    {
      id: CANVAS_NEW_PROJECT_QUERY_VALUE,
      label: t('confirm.moveWork.canvas.newProject'),
    },
  ]

  return (
    <StudioOperatorHandoffCard
      testId="operator-move-work"
      status={prompt.status}
      decidedAt={prompt.decidedAt}
      header={t(`confirm.moveWork.${side}.header`, { names })}
      request={prompt.request.next}
      hint={t(`confirm.moveWork.${side}.hint`, { names })}
      acceptLabel={t(`confirm.moveWork.${side}.accept`)}
      dismissLabel={t(`confirm.moveWork.${side}.dismiss`)}
      acceptedLabel={(time) => t(`confirm.moveWork.${side}.accepted`, { time })}
      subject={toCanvas ? targetName : names}
      onAccept={() => {
        if (!toCanvas) return onAccept()
        // 列表还没回来时按下 = 还没得选：等它回来。
        if (target) onAccept(target)
      }}
      onDismiss={onDismiss}
      formatTime={formatTime}
    >
      {toCanvas ? (
        <div
          role="radiogroup"
          aria-label={t('confirm.moveWork.canvas.pickLabel')}
          data-testid="operator-move-work-projects"
          className="flex flex-col gap-1"
        >
          <span className="text-2xs text-muted-foreground">
            {t('confirm.moveWork.canvas.pickLabel')}
          </span>
          {recent.status === 'loading' || recent.status === 'idle' ? (
            <p className="px-2 py-1 text-2sm text-muted-foreground">
              {t('confirm.moveWork.canvas.loading')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {options.map((option) => {
                const checked = option.id === target
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => setPicked(option.id)}
                    className={
                      checked
                        ? 'max-w-full truncate rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-2sm text-foreground transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'
                        : 'max-w-full truncate rounded-md border border-border bg-card px-2.5 py-1 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </StudioOperatorHandoffCard>
  )
}
