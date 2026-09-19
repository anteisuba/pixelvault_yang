'use client'

/**
 * 剧本卡的卡面（进度表 24，画板 `DesignD7Script.dc.html` ①②③）。
 *
 * 三段：**大纲**（第一个分段标记之前的正文）· **分镜列表**（每行一句话 + 时长，
 * 变了的那一行虚线 + 「已变」）· **底部一颗按钮**（确认 · 投影 / 已投影 / 重投影）。
 *
 * ⚠ 分镜列表是 `body` 的**投影**，不是第二份数据：拆镜每次现算
 * （`lib/node-script-shots.ts`）。⛔ 不在节点上另存一份镜头表 —— 存两份的表现是
 * 用户改了正文而列表没跟上，而那正是这张卡唯一要回答的问题。
 * ⚠ 按钮只**发一条 op**（`project_script`），落地与撤销都归执行器：⛔ 这一层不
 * 建节点、不连线（§11.2 op 表是唯一的语义写入口）。
 */

import { useTranslations } from 'next-intl'

import { NODE_SCRIPT_PROJECTION } from '@/constants/node-script'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'
import type { ScriptShotDraft } from '@/lib/node-script-shots'

export interface ScriptCardBodyProps {
  readonly outline: string
  readonly actCount: number
  readonly shots: readonly ScriptShotDraft[]
  /** 与剧本对不上的那几段（重投影会标「已变」的）。 */
  readonly changedKeys: ReadonlySet<string>
  /** 这张卡已经投出去几面镜。0 = 还没投过。 */
  readonly projectedCount: number
  /** 重投影会动几面镜（新增 + 已变 + 标灰）。0 = 一致，按钮停用。 */
  readonly pendingCount: number
  onProject(): void
}

export function ScriptCardBody({
  outline,
  actCount,
  shots,
  changedKeys,
  projectedCount,
  pendingCount,
  onProject,
}: ScriptCardBodyProps) {
  const t = useTranslations('StudioNode.v4.text.script')
  const visible = shots.slice(0, NODE_SCRIPT_PROJECTION.maxListRows)
  const overflow = shots.length - visible.length
  const projected = projectedCount > 0

  return (
    <div
      data-script-card
      className="nodrag nowheel flex h-full flex-col overflow-y-auto"
    >
      <p
        data-script-meta
        className="px-5 pt-4 text-2xs tracking-nav text-muted-foreground"
      >
        {actCount > 0
          ? t('metaActs', { acts: actCount, shots: shots.length })
          : t('metaShots', { count: shots.length })}
      </p>

      {outline.length > 0 && (
        <div
          data-script-outline
          data-text-rich
          className="px-5 pt-2 text-md leading-relaxed tracking-node-body"
        >
          <Markdown>{outline}</Markdown>
        </div>
      )}

      {shots.length === 0 ? (
        <p className="px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <ul
          data-script-shots
          aria-label={t('listAriaLabel')}
          className="flex flex-col gap-1 px-4 py-3"
        >
          {visible.map((shot) => {
            const changed = changedKeys.has(shot.key)
            return (
              <li
                key={shot.key}
                data-script-shot-row
                data-changed={changed ? 'true' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-sm',
                  // 「已变」：虚线 + 一句话，⛔ 不只靠颜色（forbidden.md 那条）。
                  changed && 'border border-dashed border-status-warning',
                )}
              >
                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                  {shot.no === undefined
                    ? '·'
                    : `S${String(shot.no).padStart(2, '0')}`}
                </span>
                <span className="min-w-0 flex-1 truncate">{shot.title}</span>
                {changed && (
                  <span className="shrink-0 text-2xs text-status-warning">
                    {t('changed')}
                  </span>
                )}
                {shot.durationSec !== undefined && (
                  <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                    {t('seconds', { seconds: shot.durationSec })}
                  </span>
                )}
              </li>
            )
          })}
          {overflow > 0 && (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              {t('more', { count: overflow })}
            </li>
          )}
        </ul>
      )}

      <div className="mt-auto flex justify-end border-t border-border px-4 py-2.5">
        <Button
          type="button"
          size="sm"
          // 还没投 = 主动作（近黑）；投过 = 次级，与画板 ②③ 一致。
          variant={projected ? 'outline' : 'default'}
          disabled={shots.length === 0 || (projected && pendingCount === 0)}
          onClick={onProject}
        >
          {!projected
            ? t('project', { count: shots.length })
            : pendingCount === 0
              ? t('projected', { count: projectedCount })
              : t('reproject', { count: pendingCount })}
        </Button>
      </div>
    </div>
  )
}
