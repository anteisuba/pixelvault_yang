'use client'

/** ⚠ **S11 删** —— 见同目录 `page.tsx` 的文件头注。 */

import { useState } from 'react'
import {
  Clapperboard,
  Download,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react'

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  ChipPopover,
  MentionChip,
  NodeCardShell,
  NodeFrame,
  NodeFrameProgress,
  NodePromptBar,
  NodeToolbar,
  QuickLook,
  VersionDots,
  parseMentions,
} from '@/components/business/node/nodes/v4/chrome'
import { NODE_V4_CHROME } from '@/constants/node-studio'

const MENTION_NAMES = ['莫宁', 'S02 站台图']

function Caption({ children }: { children: string }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

export function ChromePreviewBoard() {
  const [prompt, setPrompt] = useState('站台，中景，冷白光')
  const [longPrompt, setLongPrompt] = useState(
    '站台，夜，中景推近，冷白光，@莫宁 靠在长椅边，行李箱立在脚边，电子屏显示末班车倒计时，风从隧道口涌出带起衣角。画面偏冷，胶片颗粒，浅景深，主体在三分线左侧，背景霓虹灯牌虚化成色块。禁止出现文字，禁止多余人物。',
  )
  const [version, setVersion] = useState(1)
  const [ratio, setRatio] = useState('16:9')
  const [quickLook, setQuickLook] = useState(false)
  const [frame, setFrame] = useState(false)

  const toolbarGroups = [
    [
      {
        id: 'shot',
        label: '生镜头',
        icon: Clapperboard,
        onSelect: () => {},
      },
      {
        id: 'edit',
        label: '编辑',
        icon: Pencil,
        onSelect: () => {},
        menu: (
          <>
            <DropdownMenuItem>局部重绘</DropdownMenuItem>
            <DropdownMenuItem>扩图</DropdownMenuItem>
            <DropdownMenuItem>抠图 / 去背景</DropdownMenuItem>
            <DropdownMenuItem>换背景</DropdownMenuItem>
          </>
        ),
      },
    ],
    [{ id: 'download', label: '下载', icon: Download, onSelect: () => {} }],
    [
      {
        id: 'more',
        label: '更多',
        icon: MoreHorizontal,
        onSelect: () => {},
        menu: (
          <>
            <DropdownMenuItem>改名</DropdownMenuItem>
            <DropdownMenuItem>复制</DropdownMenuItem>
            <DropdownMenuItem>拆出当前版本</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">删除</DropdownMenuItem>
          </>
        ),
      },
      {
        id: 'delete',
        label: '删除',
        icon: Trash2,
        onSelect: () => {},
        danger: true,
      },
    ],
  ]

  return (
    <div className="relative min-h-svh bg-muted p-10">
      <div className="flex flex-wrap items-start gap-14">
        <section className="flex flex-col items-center gap-3">
          <Caption>1 · 工具条（34px 纯图标格 + 分组竖线 + 危险项红）</Caption>
          <NodeToolbar ariaLabel="节点工具条" groups={toolbarGroups} />
        </section>

        <section className="flex w-80 shrink-0 flex-col gap-3">
          <Caption>2 · 卡：名字在卡外、卡面不透明、选中 1.5px 环</Caption>
          <NodeCardShell
            name="S02 · 站台独白"
            renameAriaLabel="改名"
            onRename={() => true}
            selected
            ports={
              <span
                data-preview-port
                className="absolute top-1/2 -right-1.5 size-2.5 -translate-y-1/2 rounded-full border border-foreground bg-background"
              />
            }
          >
            <p className="p-5 text-md leading-relaxed tracking-node-body">
              夜色里的车站站台空无一人。她把行李箱靠在长椅边，抬头看电子屏——末班车还有十一分钟。
            </p>
          </NodeCardShell>
          <Caption>空卡：虚线框 + 一句提示 + 加号圆钮</Caption>
          <NodeCardShell
            name="镜头图 2"
            renameAriaLabel="改名"
            onRename={() => true}
            emptyHint="上传 · 粘贴 · 或写提示词"
            emptyAddAriaLabel="添加"
            emptyHeight={180}
            onEmptyAdd={() => {}}
          />
        </section>

        <section className="flex w-90 shrink-0 flex-col items-center gap-3">
          <Caption>3 · 提示词栏（44px 胶囊 · chip 上限 3 · 发送）</Caption>
          <NodePromptBar
            value={prompt}
            onValueChange={setPrompt}
            onSubmit={() => {}}
            placeholder="写点什么…"
            ariaLabel="提示词"
            className="w-full"
            addMenu={
              <>
                <DropdownMenuItem>上传</DropdownMenuItem>
                <DropdownMenuItem>从素材库</DropdownMenuItem>
              </>
            }
            chips={[
              <ChipPopover
                key="frame"
                ariaLabel="画面"
                width={300}
                trigger={
                  <button
                    type="button"
                    className="rounded-md border px-1.5 py-px text-2xs text-muted-foreground"
                  >
                    {ratio} · 2K
                  </button>
                }
              >
                <div className="flex flex-col gap-1.5">
                  <p className="text-2xs text-muted-foreground">比例</p>
                  <ToggleGroup
                    type="single"
                    variant="segmented"
                    value={ratio}
                    onValueChange={(next) => next && setRatio(next)}
                  >
                    {['1:1', '16:9', '9:16', '4:3'].map((item) => (
                      <ToggleGroupItem key={item} value={item}>
                        {item}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="text-xs text-muted-foreground">
                    2048×1152 · 约 ¥0.04/张
                  </p>
                </div>
              </ChipPopover>,
              <button
                key="model"
                type="button"
                className="rounded-md border px-1.5 py-px text-2xs text-muted-foreground"
              >
                Seedream
              </button>,
              <button
                key="third"
                type="button"
                className="rounded-md border px-1.5 py-px text-2xs text-muted-foreground"
              >
                有声
              </button>,
              <button
                key="dropped"
                type="button"
                data-should-not-render
                className="rounded-md border px-1.5 py-px text-2xs"
              >
                第四颗（应被丢弃）
              </button>,
            ]}
          />
          <Caption>长提示词：长高到 4 行、chip 与 + 挪底行、超出滚动</Caption>
          <NodePromptBar
            value={longPrompt}
            onValueChange={setLongPrompt}
            onSubmit={() => {}}
            placeholder="写点什么…"
            ariaLabel="长提示词"
            className="w-full"
            addMenu={<DropdownMenuItem>上传</DropdownMenuItem>}
            chips={[
              <button
                key="a"
                type="button"
                className="rounded-md border px-1.5 py-px text-2xs text-muted-foreground"
              >
                1:1
              </button>,
            ]}
          />
          <Caption>生成中：变灰 + 取消</Caption>
          <NodePromptBar
            value="生成中的提示词"
            onValueChange={() => {}}
            onSubmit={() => {}}
            onCancel={() => {}}
            generating
            placeholder="写点什么…"
            ariaLabel="生成中提示词"
            className="w-full"
          />
        </section>

        <section className="flex flex-col gap-3">
          <Caption>4 · @ chip 与解析（灰底 · 16px 缩略 · 波形小标）</Caption>
          <p className="w-80 text-md leading-relaxed">
            {parseMentions(
              '从 @首帧 S02 站台图 起，@莫宁 转身走向站台尽头，配 @语音 莫宁 的独白。',
              { names: MENTION_NAMES },
            ).map((segment, index) =>
              segment.type === 'text' ? (
                <span key={index}>{segment.value}</span>
              ) : (
                <MentionChip
                  key={index}
                  name={segment.name}
                  role={segment.role}
                  showRole={segment.explicitRole}
                  media={{
                    kind: segment.role === 'voice' ? 'audio' : 'image',
                  }}
                />
              ),
            )}
          </p>
          <Caption>5 · 版本小点（当前拉长，←→ 切换）</Caption>
          <VersionDots
            count={3}
            current={version}
            onSelect={setVersion}
            ariaLabel="版本"
            labelOf={(index) => `第 ${index + 1} 版，共 3 版`}
          />
        </section>

        <section className="flex flex-col gap-3">
          <Caption>6 · 裱框显影（环 + 百分比 + 阶段文案）</Caption>
          <div className="relative size-56 rounded-node corner-squircle border bg-card">
            <NodeFrameProgress
              elapsedSeconds={12}
              realProgress={64}
              stageLabel="正在生成图像"
            />
          </div>
          <Caption>矮卡：进度线 + 百分比</Caption>
          <div className="relative h-18 w-72 rounded-node corner-squircle border bg-card">
            <NodeFrameProgress
              elapsedSeconds={4}
              realProgress={40}
              stageLabel="正在合成语音"
              variant="line"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              data-preview-open-quick-look
              onClick={() => setQuickLook(true)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              7 · 打开快速看
            </button>
            <button
              type="button"
              data-preview-open-frame
              onClick={() => setFrame(true)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              8 · 打开画中框
            </button>
          </div>
        </section>
      </div>

      <QuickLook
        open={quickLook}
        onClose={() => setQuickLook(false)}
        ariaLabel="快速看"
        readout="2 / 3 · 1792×1024 · Seedream"
        versionCount={3}
        versionIndex={version}
        onVersionChange={setVersion}
        onDownload={() => {}}
      >
        <div className="size-96 rounded-2xl bg-surface-fill-track" />
      </QuickLook>

      <NodeFrame
        open={frame}
        onClose={() => setFrame(false)}
        title="S02 · 站台独白"
        width={NODE_V4_CHROME.frameWidth.text}
        titleExtra={
          <ToggleGroup type="single" variant="segmented" value="script">
            <ToggleGroupItem value="script">剧本</ToggleGroupItem>
            <ToggleGroupItem value="style">风格</ToggleGroupItem>
            <ToggleGroupItem value="character">角色</ToggleGroupItem>
          </ToggleGroup>
        }
        footer={<p className="text-xs text-muted-foreground">182 字 · 3 段</p>}
        assistantBar={
          <NodePromptBar
            value=""
            onValueChange={() => {}}
            onSubmit={() => {}}
            placeholder="让助手写一段…"
            ariaLabel="助手栏"
          />
        }
      >
        <div className="flex flex-col gap-3.5">
          <h3 className="text-xl font-semibold tracking-node-title">
            站台独白
          </h3>
          <p className="text-md leading-relaxed tracking-node-body">
            夜色里的车站站台空无一人。她把行李箱靠在长椅边，抬头看电子屏——末班车还有十一分钟。
          </p>
        </div>
      </NodeFrame>

      <span aria-hidden data-preview-icon-probe className="sr-only">
        <Sparkles className="size-4" />
        <ImageIcon className="size-4" />
      </span>
    </div>
  )
}
