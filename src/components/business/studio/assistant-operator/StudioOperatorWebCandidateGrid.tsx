'use client'

/**
 * **联网候选网格**（`pages/assistant-shell.md` §11.4「候选网格」· 拍板 21 · 切片 3b）。
 *
 * ── 拍板 21：看与选是两件事 ──────────────────────────────────────
 *  · 点缩略图 = 开灯箱看**原图**，零网络零入库；
 *  · 点「选用」= 才导入进素材库并挂上（取消选用会把它一并清掉）。
 * 🔬 owner 2026-08-31 真机打回的就是这两件事合成一个手势：**浏览即采购**。
 *
 * ── 一格上的三行元信息（切片 3b，owner 定）────────────────────────
 * 用户在按「选用」之前要答三个问题，所以格子下面就写三行：
 *  ① **域名**——可点，新窗打开原页；⛔ 点它不算选用（与缩略图同一条纪律）。
 *  ② **发布者**——站点显示名；取不到就写「未知」，⛔ 不拿域名冒充（那两个是不同
 *     的答案，见 `AssistantOperatorWebImageSchema.publisher` 头注）。
 *  ③ **能不能当生成输入**——判据在 `constants/web-image-sources.ts`，**是启发式
 *     不是法律判断**。`false` 的那格「选用」禁用并**就地**说明为什么，⛔ 不是把
 *     格子藏起来：用户照样可以点开原页去看，只是这一步我们不替他按。
 *
 * ── 为什么它从 `StudioOperatorLogItem` 里搬了出来（切片 3b）──────────
 * 那颗组件此刻管着「一条日志的脸」（图标 / 撤销 / 详情 / 参考图 / 文件夹证据 /
 * 候选网格 / 来源列表）。候选网格是其中唯一一块**有自己的交互与自己的状态机**的
 * 东西（选中 / 在飞 / 失败 / 不可用 × 每格一份），继续挤在里面的代价是那颗组件的
 * 每一次改动都要重读三百行不相干的分支。⚠ 搬家**不改行为**：testid、灯箱语义、
 * 「已选 n/m」的算法与文案键全部照旧。
 *
 * 🔬 contrast-check（切片 3b，日志条底 = `bg-background`；最小 10px 也按正文
 * 4.5:1 判）：`status-applied`「可作输入」浅 **5.42** / 深 **9.68** ·
 * `status-risk`「仅参考」浅 **6.54** / 深 **6.13** · `muted-foreground`（域名与
 * 发布者两行）浅 **5.49** / 深 **7.66** · 域名 hover 的 `primary` 浅 **21.00** /
 * 深 **19.80**。⚠ 日志条在跑时底换成 `primary/5`，两枚状态色在那上面仍是
 * 浅 4.84 / 5.84、深 8.84 / 5.60 —— 全部过线。
 */

import { Check, ExternalLink, TriangleAlert } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS } from '@/constants/studio-assistant-operator'
import {
  WEB_IMAGE_SOURCE_NOT_USABLE_MESSAGE_KEYS,
  WEB_IMAGE_SOURCE_VERDICT_IDS,
} from '@/constants/web-image-sources'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { AssistantOperatorWebImage } from '@/types/assistant-operator'
import type {
  StudioOperatorWebImportPick,
  StudioOperatorWebImportState,
} from '@/hooks/use-studio-operator-web-import'

/** 一张都没选时共用这一份，⛔ 别写成行内 `[]`（每次 render 换引用）。 */
const NO_PICKS: readonly StudioOperatorWebImportPick[] = []

interface StudioOperatorWebCandidateGridProps {
  /** ⚠ 撤销 / 选用认的都是**线程里这一条的 id**，不是 `step.id`。 */
  entryId: string
  images: readonly AssistantOperatorWebImage[]
  /** 这一条日志上的选用态。`undefined` = 一张都还没选。 */
  webImport: StudioOperatorWebImportState | undefined
  /** 一行最多能选几张（工作台参考位上限）——「已选 n/m」里的 m。 */
  limit: number
  onToggle(entryId: string, image: AssistantOperatorWebImage): void
}

export function StudioOperatorWebCandidateGrid({
  entryId,
  images,
  webImport,
  limit,
  onToggle,
}: StudioOperatorWebCandidateGridProps) {
  const t = useTranslations('StudioOperator')

  const picks = webImport?.picks ?? NO_PICKS
  const failedPicks = picks.filter((pick) => pick.status === 'error')
  const usedCount = picks.length - failedPicks.length

  /**
   * 「把能用的都挂上」那颗按钮要挂的**具体那几张**（2026-09-06）。
   *
   * ── 为什么这份名额算在这里，而不是在 hook 里 ─────────────────────
   * `toggleCandidate` 每次调用都读一份**同一帧内还没更新**的选中态，所以循环调
   * 它时每一张都以为自己是第一张 —— 名额判定会全部按旧值走。这在这里恰好是
   * 安全的（都走「没选过 → 导入」那一支），但**只有在调用方自己把数量卡在剩余
   * 名额之内**时才成立。所以这份筛选是这颗按钮的一部分，⛔ 不能省成
   * 「把 images 全丢给 onToggle」。
   *
   * 三条闸，与格子上那颗「选用」逐条同源：
   *  · `usableAsInput=false` 的**不在名单里**（用户点的是「能用的」，那几张本来
   *    就不属于「能用的」——⛔ 不该因此弹一句拒绝理由）；
   *  · 已经选过的跳过（⛔ 再点一次会变成取消选用，那正好是反效果）；
   *  · 名额满了 = 一张都不动（⛔ 不挤掉用户自己挑好的那些）。
   */
  const remaining = limit - usedCount
  const pendingUsable = images.filter(
    (image) =>
      image.usableAsInput &&
      !picks.some((pick) => pick.imageUrl === image.imageUrl),
  )
  const batch = remaining > 0 ? pendingUsable.slice(0, remaining) : []

  if (images.length === 0) return null

  return (
    <div className="@container mt-2" data-testid="operator-web-candidates">
      <p className="mb-1 text-2sm text-muted-foreground">
        {t('web.candidates')}
      </p>
      {/* ⚠ 列数看**容器**不看视口（同 `StudioOperatorResultRow`）：面板宽度是用户
          拖出来的，视口断点在这里说不了话。700 与 `STUDIO_OPERATOR_SHELL.wideAtPx`
          是同一个数。 */}
      <div className="grid grid-cols-2 gap-2 @sm:grid-cols-3 @2xl:grid-cols-4">
        {images.map((image) => {
          const pick = picks.find((item) => item.imageUrl === image.imageUrl)
          const importing = pick?.status === 'importing'
          const failed = pick?.status === 'error'
          const imported = pick?.status === 'imported'
          // ⚠ 每格算自己的态：一行里可以同时有「已选用」「在飞」「取不到」
          //    三种格子，把整行的状态印到每一格会让没出事的那些也标红。
          const tileState = importing
            ? 'importing'
            : failed
              ? 'error'
              : imported
                ? 'imported'
                : 'idle'
          const caption =
            image.title ?? image.domain ?? (image.pageUrl || image.imageUrl)
          const unknownLicense =
            image.sourceVerdict === WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense

          return (
            <div key={image.imageUrl} className="flex min-w-0 flex-col gap-1">
              {/* 看 —— ⛔ 这一颗不发任何网络请求，它只开灯箱。
                  ⚠ 灯箱吃的是**原图直链**（看大图的意义就在这儿）；缩略图
                    只画在格子里。取不到的那三成会在灯箱里显形，而那正是
                    用户在按「选用」之前该知道的事。 */}
              <button
                type="button"
                data-testid="operator-web-candidate"
                data-selected={pick ? 'true' : 'false'}
                data-state={tileState}
                data-verdict={image.sourceVerdict}
                onClick={() => openOperatorLightbox(image.imageUrl, caption)}
                title={caption}
                aria-label={t('web.viewLarge')}
                className={cn(
                  'relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg border border-border/70 bg-muted transition-colors duration-(--duration-fast) ease-standard hover:border-primary/50',
                  imported && 'border-primary ring-1 ring-primary',
                  failed && 'border-destructive ring-1 ring-destructive',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 任意第三方图床，进不了 next.config 的 remotePatterns 白名单；而且画的是 gstatic 缩略图（原图直链约三成 403）。 */}
                <img
                  src={image.thumbnailUrl ?? image.imageUrl}
                  alt={image.title ?? image.domain ?? ''}
                  width={STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS}
                  height={STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS}
                  loading="lazy"
                  className="size-full object-cover"
                />
                {importing ? (
                  <span className="absolute inset-0 grid place-items-center bg-background/70">
                    <Spinner className="size-4 text-primary" />
                  </span>
                ) : null}
                {imported ? (
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-primary/90 py-px text-xs text-primary-foreground">
                    <Check className="size-2.5" aria-hidden />
                    {t('web.imported')}
                  </span>
                ) : null}
                {/* ⚠ 失败角标底色用 `bg-background` 而不是实心 destructive：
                    本仓没有 `--color-destructive-foreground` 这枚 token，实心
                    红上没有配得上的字色（暗档会变成深红压深底）。 */}
                {failed ? (
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-background/90 py-px text-xs text-destructive">
                    <TriangleAlert className="size-2.5" aria-hidden />
                    {t('web.importFailedShort')}
                  </span>
                ) : null}
              </button>

              {/* ① 域名 —— 可点开原页。⚠ `stopPropagation` 不需要（它不在格子里），
                  但 `rel="noopener noreferrer"` 需要：目标是任意第三方站。
                  ⛔ 没有 `pageUrl` 时**不渲染成链接**（一颗点不开的链接比没有坏）。 */}
              {image.pageUrl ? (
                <a
                  href={image.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="operator-web-candidate-source"
                  title={t('web.openPage')}
                  className="flex min-w-0 items-center gap-0.5 font-mono text-xs tracking-nav text-muted-foreground underline-offset-2 transition-colors duration-(--duration-fast) ease-standard hover:text-primary hover:underline"
                >
                  <span className="truncate">
                    {image.domain ?? image.title}
                  </span>
                  <ExternalLink className="size-2.5 shrink-0" aria-hidden />
                </a>
              ) : (
                <span className="truncate font-mono text-xs tracking-nav text-muted-foreground">
                  {image.domain ?? t('web.publisherUnknown')}
                </span>
              )}

              {/* ② 发布者 —— 取不到就写「未知」，⛔ 不拿域名冒充。 */}
              <span
                data-testid="operator-web-candidate-publisher"
                className="truncate text-2sm text-muted-foreground"
              >
                {image.publisher ?? t('web.publisherUnknown')}
              </span>

              {/* ③ 能不能当输入 —— applied / risk 两档（§11.4）。 */}
              <span
                data-testid="operator-web-candidate-usable"
                className={cn(
                  'truncate text-2sm',
                  image.usableAsInput
                    ? 'text-status-applied'
                    : 'text-status-risk',
                )}
              >
                {image.usableAsInput
                  ? unknownLicense
                    ? t('web.usableUnknownLicense')
                    : t('web.usable')
                  : t('web.referenceOnly')}
              </span>

              {/* 选 —— 这一颗才花钱（花的是存储与一次下载）。
                  ⚠ 不可作输入时**禁用而不是移除**：位置留着，理由就地写在下面
                  一行，⛔ 不让用户去别处找「为什么这张点不了」。 */}
              <button
                type="button"
                data-testid="operator-web-candidate-use"
                data-state={tileState}
                aria-pressed={imported}
                disabled={!image.usableAsInput}
                onClick={() => onToggle(entryId, image)}
                className={cn(
                  'rounded-md border px-1 py-0.5 text-xs transition-colors duration-(--duration-fast) ease-standard',
                  imported
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/70 text-muted-foreground hover:border-primary/50 hover:text-primary',
                  failed && 'border-destructive/50 text-destructive',
                  !image.usableAsInput &&
                    'cursor-not-allowed border-border/70 text-muted-foreground hover:border-border/70 hover:text-muted-foreground',
                )}
              >
                {!image.usableAsInput
                  ? t('web.cannotUse')
                  : imported
                    ? t('web.used')
                    : failed
                      ? t('web.retry')
                      : t('web.use')}
              </button>
              {!image.usableAsInput ? (
                <span
                  data-testid="operator-web-candidate-blocked"
                  className="text-xs text-muted-foreground"
                >
                  {t(
                    WEB_IMAGE_SOURCE_NOT_USABLE_MESSAGE_KEYS[
                      image.sourceVerdict
                    ],
                  )}
                </span>
              ) : null}
              {/* ⛔ 失败原因写在**这一格**下面（2026-09-07 真机）：此前整行只写
                  第一条失败的原因，而一行里可以同时有「403 拒了」和「不是图片
                  格式」两种失败 —— 用户读到的原因与他正看的那一格对不上。 */}
              {failed ? (
                <span
                  data-testid="operator-web-candidate-error"
                  className="text-xs text-destructive"
                >
                  {pick?.error ?? t('web.importFailed')}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>

      {webImport?.refusalError ? (
        <p
          data-testid="operator-web-refusal-error"
          className="mt-1 text-2sm text-status-risk"
        >
          {webImport.refusalError}
        </p>
      ) : null}
      {webImport?.cleanupError ? (
        <p
          data-testid="operator-web-cleanup-error"
          className="mt-1 text-2sm text-destructive"
        >
          {webImport.cleanupError}
        </p>
      ) : null}
      {/* 「把能用的都挂上」（2026-09-06）—— owner 用例的收尾动作：助手搜到一行
          官方设定图之后，用户要的是「都挂上」，而不是点四次「选用」。
          ⚠ 名额为 0 或没有可挂的时**禁用而不是移除**（与格子上那颗同一条纪律）：
            位置留着，旁边那行「已选 n/m」就是理由。
          ⚠ 数量写在按钮上（「挂上 3 张」）——⛔ 不写一句无数字的「全部挂上」：
            用户按之前要知道这一下会花掉几个参考位。 */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
        <p className="text-2sm text-muted-foreground">
          {usedCount > 0
            ? t('web.selectedHint', { count: usedCount, limit })
            : t('web.pickHint')}
        </p>
        <button
          type="button"
          data-testid="operator-web-use-all"
          disabled={batch.length === 0}
          onClick={() => {
            for (const image of batch) onToggle(entryId, image)
          }}
          className={cn(
            'shrink-0 rounded-md border px-1.5 py-0.5 text-xs transition-colors duration-(--duration-fast) ease-standard',
            batch.length === 0
              ? 'cursor-not-allowed border-border/70 text-muted-foreground/60'
              : 'border-border/70 text-muted-foreground hover:border-primary/50 hover:text-primary',
          )}
        >
          {t('web.useAll', { count: batch.length })}
        </button>
      </div>
    </div>
  )
}
