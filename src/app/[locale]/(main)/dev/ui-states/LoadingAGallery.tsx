'use client'

import { useEffect, useState, type ReactNode } from 'react'

import {
  NodeCardShell,
  NodeFrameProgress,
} from '@/components/business/node/nodes/v4/chrome'
import { StudioGeneratingProgress } from '@/components/business/studio-shared/primitives/StudioGeneratingProgress'
import { Button } from '@/components/ui/button'

/**
 * 加载态 A「边即进度」样板间（owner 2026-09-27 · 设计画布「加载态 A · 全部状态」）。
 *
 * 真计时驱动同一份 `StudioGeneratingProgress`，把四处宿主的形状（舞台图框、画布卡、
 * 对比图墙大格 / 小格、音频矮卡）摆在一屏里；「出图」「失败」「重新开始」走的是
 * 组件真实的收尾路径，不是截图。
 */
type Phase = 'running' | 'completing' | 'done' | 'failed'

export function LoadingAGallery() {
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState<Phase>('running')
  const [round, setRound] = useState(0)
  const [selected, setSelected] = useState(true)
  // 画布卡：线合拢、停一拍之后才把卡边还给卡壳（与节点宿主同一个时机）。
  const [edgeReleased, setEdgeReleased] = useState(false)

  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(id)
  }, [phase])

  const restart = () => {
    setElapsed(0)
    setPhase('running')
    setRound((value) => value + 1)
    setEdgeReleased(false)
  }
  const failure =
    phase === 'failed'
      ? {
          message: '没出图 · 服务商的审核拦下了这一张',
          shortMessage: '没出图',
          retryLabel: '重试',
          onRetry: restart,
        }
      : null
  const running = phase === 'running' || phase === 'completing'
  const stageLabel = stageWord(elapsed)

  const progress = (variant: 'full' | 'compact', params?: string) =>
    running || phase === 'failed' ? (
      <StudioGeneratingProgress
        key={`${variant}-${round}`}
        elapsedSeconds={elapsed}
        stageLabel={stageLabel}
        variant={variant}
        {...(params ? { paramsLine: params } : {})}
        isCompleting={phase === 'completing'}
        onCompleteAnimationDone={() => setPhase('done')}
        failure={failure}
      />
    ) : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={restart}>重新开始</Button>
        <Button
          variant="outline"
          disabled={phase !== 'running'}
          onClick={() => setPhase('completing')}
        >
          出图
        </Button>
        <Button
          variant="outline"
          disabled={phase !== 'running'}
          onClick={() => setPhase('failed')}
        >
          失败
        </Button>
        <Button
          variant="outline"
          aria-pressed={selected}
          onClick={() => setSelected((value) => !value)}
        >
          画布卡{selected ? '选中' : '没选中'}
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {elapsed}s · {phase}
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Frame caption="工作台舞台 · full（带参数行）">
          <div className="relative size-135 rounded-xl bg-card">
            {phase === 'done' ? <Art rounded="rounded-xl" /> : null}
            {progress('full', `${elapsed}s · FLUX 2 Flash · 1:1`)}
          </div>
        </Frame>

        <div className="flex flex-col gap-6">
          <Frame caption="画布卡 · 真卡壳（选中环 / 细灰边交给进度线）">
            <NodeCardShell
              name="角色三视图"
              renameAriaLabel="改名"
              onRename={() => true}
              selected={selected}
              edgeBusy={(running || phase === 'failed') && !edgeReleased}
              edgeOverlay={
                running || phase === 'failed' ? (
                  <NodeFrameProgress
                    key={`node-${round}`}
                    elapsedSeconds={elapsed}
                    stageLabel={stageLabel}
                    isCompleting={phase === 'completing'}
                    onEdgeRelease={() => setEdgeReleased(true)}
                    failure={failure}
                  />
                ) : undefined
              }
              width={400}
              surfaceClassName="overflow-hidden"
            >
              <div className="relative h-56">
                {phase === 'done' ? <Art rounded="" /> : null}
              </div>
            </NodeCardShell>
          </Frame>
          <Frame caption="音频矮卡 · 一条线">
            <div className="relative h-18 w-100 rounded-node bg-card corner-squircle">
              {running ? (
                <NodeFrameProgress
                  variant="line"
                  elapsedSeconds={elapsed}
                  stageLabel={stageLabel}
                />
              ) : null}
            </div>
          </Frame>
        </div>

        <div className="flex flex-col gap-6">
          <Frame caption="对比图墙大格 · 300（compact）">
            <div className="relative size-75 rounded-xl bg-card">
              {phase === 'done' ? <Art rounded="rounded-xl" /> : null}
              {progress('compact')}
            </div>
          </Frame>
          <Frame caption="小格 · 136（窄于 160 只写百分比）">
            <div className="relative size-34 rounded-xl bg-card">
              {phase === 'done' ? <Art rounded="rounded-xl" /> : null}
              {progress('compact')}
            </div>
          </Frame>
        </div>
      </div>
    </div>
  )
}

function stageWord(elapsed: number): string {
  if (elapsed < 2) return '正在准备提示词'
  if (elapsed < 8) return '正在连接模型'
  if (elapsed < 45) return '正在生成图像'
  return '仍在生成，请稍候'
}

function Frame({
  caption,
  children,
}: {
  caption: string
  children: ReactNode
}) {
  return (
    <figure className="flex flex-col gap-2">
      {children}
      <figcaption className="text-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  )
}

/**
 * 出图后的一张假「图」：纯色块淡入（宿主各自的出图动效另说）。圆角由调用方给 ——
 * 外框不能 `overflow-hidden`，否则压在边外半个线宽的那条线会被裁掉。
 */
function Art({ rounded }: { rounded: string }) {
  return (
    <div
      className={`absolute inset-0 animate-in bg-surface-fill-track fade-in-0 duration-slow ease-standard ${rounded}`}
    />
  )
}
