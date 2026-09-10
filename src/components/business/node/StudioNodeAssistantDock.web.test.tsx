/**
 * @vitest-environment jsdom
 *
 * dock 的**便条消费**（S7.5 §1）：画布上的文本助手栏投一张便条，dock 必须把它
 * 拼成一句带 `[[node:id]]` 的普通消息走同一条会话发出去。
 *
 * ⚠ 只证「投了会发什么」——助手栏怎么长、提案卡怎么落各有各的测试。
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${values.name}:${values.prompt}` : key,
}))

const send = vi.fn<
  (content: string, context: Record<string, unknown>) => Promise<void>
>(async () => {})

vi.mock('@/hooks/use-assistant-conversation', () => ({
  useAssistantConversation: () => ({
    messages: [],
    isLoading: false,
    isHydrating: false,
    error: null,
    sessionId: null,
    sessions: [],
    send,
    retry: vi.fn(),
    reset: vi.fn(),
    clear: vi.fn(),
    load: vi.fn(),
    selectSession: vi.fn(),
    refreshSessions: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-llm-route-picker', () => ({
  useLLMRoutePicker: () => ({
    savedRoutes: [],
    lockedRoutes: [],
    allRoutes: [
      {
        optionId: 'llm-route:assistant:key:key_1:model_1',
        apiKeyId: 'key_1',
        adapterType: 'openai',
        modelId: 'model_1',
        label: 'Model 1',
        providerLabel: 'OpenAI',
        isSaved: true,
      },
    ],
    healthMap: {},
  }),
}))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/hooks/node/use-canvas-assistant-drag', () => ({
  useCanvasAssistantDrag: () => ({ handleProps: {} }),
}))
vi.mock('@/hooks/node/use-node-selection', () => ({
  useNodeSelection: () => ({ nodes: [], selectedNodeIds: [] }),
}))
vi.mock('./nodes/v4/NodeV4ActionsBridge', () => ({
  useNodeCanvasActions: () => ({
    placeDerivedImages: vi.fn(),
    focusNode: vi.fn(),
    runAssistantOps: vi.fn(),
    undo: vi.fn(),
  }),
}))
vi.mock('./AssistantConversation', () => ({
  AssistantConversation: () => <div data-testid="conversation" />,
}))
vi.mock('./CanvasAssistantHistory', () => ({
  CanvasAssistantHistory: () => null,
  CanvasAssistantHistoryPanel: () => null,
}))
vi.mock('./CanvasAssistantRouteSelector', () => ({
  CanvasAssistantRouteSelector: ({
    value,
  }: {
    value: { optionId: string }
  }) => <div data-testid="route" data-option-id={value.optionId} />,
  getAssistantRouteKeyOptionId: (keyId: string, modelId?: string) =>
    `node-studio-assistant:key:${keyId}:${modelId}`,
}))
vi.mock('./ScriptDocWorkspace', () => ({ ScriptDocWorkspace: () => null }))

import { requestCanvasTextAssist } from './nodes/v4/text/text-assist-request'
import { StudioNodeAssistantDock } from './StudioNodeAssistantDock'

const textNode = {
  id: 't_1',
  type: 'text',
  position: { x: 0, y: 0 },
  data: {
    kind: 'text' as const,
    subtype: 'script' as const,
    name: '开场白',
    body: '一段正文',
    status: 'idle' as const,
  },
}

function renderDock(onOpenChange = vi.fn()) {
  render(
    <StudioNodeAssistantDock
      open
      expanded={false}
      projectId="p_1"
      projectName="项目"
      nodes={[textNode] as never}
      edges={[]}
      scriptDoc={undefined}
      locale="zh"
      onOpenChange={onOpenChange}
      onExpandedChange={vi.fn()}
      onFocusNode={vi.fn()}
    />,
  )
  return onOpenChange
}

describe('StudioNodeAssistantDock · 文本助手栏便条', () => {
  it('把便条拼成一句带 [[node:id]] 的消息发出去，并打开 dock', async () => {
    send.mockClear()
    const onOpenChange = renderDock()

    act(() => {
      requestCanvasTextAssist({
        nodeId: 't_1',
        action: 'continue',
        prompt: '续写一句',
      })
    })

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0]?.[0]).toBe(
      'continue:开场白:续写一句 [[node:t_1]]',
    )
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('没点 chip 时用 plain 那句', async () => {
    send.mockClear()
    renderDock()

    act(() => {
      requestCanvasTextAssist({ nodeId: 't_1', prompt: '再写点' })
    })

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0]?.[0]).toBe('plain:开场白:再写点 [[node:t_1]]')
  })

  it('chip 选的写作模型透传给这一次发送，并落到 route 选择器上', async () => {
    send.mockClear()
    renderDock()

    act(() => {
      requestCanvasTextAssist({
        nodeId: 't_1',
        action: 'rewrite',
        prompt: '改一改',
        modelOptionId: 'llm-route:assistant:key:key_1:model_1',
      })
    })

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    const context = send.mock.calls[0]?.[1]
    expect(context?.apiKeyId).toBe('key_1')
    expect(context?.llmModelId).toBe('model_1')
    await waitFor(() =>
      expect(screen.getByTestId('route')).toHaveAttribute(
        'data-option-id',
        'node-studio-assistant:key:key_1:model_1',
      ),
    )
  })

  it('便条取走即消费：重挂 dock 不会把同一句再发一遍', async () => {
    send.mockClear()
    renderDock()

    act(() => {
      requestCanvasTextAssist({ nodeId: 't_1', prompt: '只发一次' })
    })
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))

    renderDock()
    expect(send).toHaveBeenCalledTimes(1)
  })

  // 助手从没开过时 dock 根本没挂，那一刻投的便条没有订阅者听得见。
  it('dock 在便条投出之后才挂上来，也照样把它发出去', async () => {
    send.mockClear()

    act(() => {
      requestCanvasTextAssist({
        nodeId: 't_1',
        action: 'rewrite',
        prompt: '迟到的便条',
      })
    })
    expect(send).not.toHaveBeenCalled()

    renderDock()
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0]?.[0]).toBe(
      'rewrite:开场白:迟到的便条 [[node:t_1]]',
    )
  })

  it('便条指向已被删掉的节点时什么也不发', async () => {
    send.mockClear()
    renderDock()

    act(() => {
      requestCanvasTextAssist({ nodeId: 't_gone', prompt: '写点什么' })
    })

    expect(send).not.toHaveBeenCalled()
  })
})
