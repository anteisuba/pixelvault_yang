/** 手机画布左栏：真抽屉（真 MobileNodeSheet）、真角色库 hook、真参考轨绑定；只假角色库接口、路由与 Clerk。 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// jsdom 没有 matchMedia，加节点抽屉（vaul）一开就要读它。
beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

import type { NodeV4 } from '@/types/node-workflow'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const push = vi.fn()
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user-a', isLoaded: true, isSignedIn: true }),
}))

// 角色库从接口拉：只假这一条。
vi.mock('@/lib/api-client/cards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/cards')>()),
  listCharacterCardsAPI: vi.fn(async () => ({
    success: true,
    data: [
      {
        id: 'denia',
        name: 'Denia',
        looks: [
          {
            id: 'denia-main',
            isDefault: true,
            tags: [],
            referenceSlots: [
              { id: 's1', url: 'https://cdn.test/denia.png', isPrimary: true },
            ],
          },
        ],
      },
    ],
  })),
}))

const nodes: NodeV4[] = [
  {
    id: 'shot-2',
    type: 'v4',
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: '隧道',
      label: '隧道',
      shotNo: 2,
      durationSec: 5,
    },
  },
  {
    id: 'shot-1',
    type: 'v4',
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: '站台',
      label: '站台',
      shotNo: 1,
    },
  },
  {
    id: 'img-1',
    type: 'v4',
    position: { x: 0, y: 0 },
    data: { kind: 'image', subtype: 'shot', name: '参考图' },
  },
  {
    id: 'char-1',
    type: 'v4',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'character',
      name: '旧名字',
      characterId: 'denia',
    },
  },
] as unknown as NodeV4[]

import { ApiKeysProvider } from '@/contexts/api-keys-context'

import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from '../nodes/v4/NodeV4Context'
import { CanvasMobileRail } from './CanvasMobileRail'

function renderRail(
  overrides: Partial<Parameters<typeof CanvasMobileRail>[0]> = {},
) {
  return render(
    <ApiKeysProvider autoLoad={false}>
      <NodeV4CanvasProvider
        value={
          {
            nodes,
            edges: [],
            modelOptionsByKind: {},
          } as unknown as NodeV4CanvasContextValue
        }
      >
        <CanvasMobileRail
          projectPill={<span data-testid="pill">项目</span>}
          assistant={<div data-testid="assistant" />}
          onAdd={vi.fn()}
          onUploadFiles={vi.fn()}
          onPlaceAsset={vi.fn()}
          {...overrides}
        />
      </NodeV4CanvasProvider>
    </ApiKeysProvider>,
  )
}

describe('CanvasMobileRail', () => {
  it('镜头列表按镜头带序渲染，项目胶囊复用桌面那一颗', () => {
    const { container } = renderRail()
    expect(screen.getByTestId('pill')).toBeInTheDocument()
    const cards = container.querySelectorAll('[data-mobile-shot-card]')
    expect(
      Array.from(cards).map((card) =>
        card.getAttribute('data-mobile-shot-card'),
      ),
    ).toEqual(['shot-1', 'shot-2'])
  })

  it('分段控件切到「图」时列表换成图片行，⛔ 镜头卡不再渲染', () => {
    const { container } = renderRail()
    fireEvent.click(screen.getByRole('tab', { name: 'tab.images' }))
    expect(container.querySelectorAll('[data-mobile-shot-card]')).toHaveLength(
      0,
    )
    expect(
      container.querySelector('[data-mobile-media-row="img-1"]'),
    ).toBeInTheDocument()
  })

  it('点卡把这张卡递给抽屉（一开始没有任何弹层盖住列表）', () => {
    const { container } = renderRail()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(container.querySelector('[data-mobile-shot-open]')!)
    expect(screen.getByRole('dialog')).toHaveTextContent('站台')
  })

  it('画布上的角色卡：名字和图现读角色库，点了去角色页，⛔ 不开出图抽屉', async () => {
    const { container } = renderRail()
    fireEvent.click(screen.getByRole('tab', { name: 'tab.images' }))
    const row = container.querySelector('[data-mobile-media-row="char-1"]')!
    // 角色库那一跳回来之前，行上是节点自己存的旧名字。
    await waitFor(() => expect(row).toHaveTextContent('Denia'))
    expect(row.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/denia.png',
    )
    fireEvent.click(row)
    expect(push).toHaveBeenCalledWith('/library/cards?character=denia')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('助手一直挂（收起态头像在壳顶栏右端），列表里 ⛔ 再放一颗自己的入口', () => {
    renderRail()
    expect(screen.getByTestId('assistant')).toBeInTheDocument()
    expect(screen.queryByTestId('canvas-mobile-assistant')).toBeNull()
    expect(screen.queryByRole('banner')).toBeNull()
  })

  it('FAB 拉起底部抽屉，里面是桌面同一份加节点菜单：四组十项 + 上传 · 素材库 · 镜头表', () => {
    renderRail()
    expect(screen.queryByTestId('canvas-mobile-add-sheet')).toBeNull()
    fireEvent.click(screen.getByTestId('canvas-mobile-fab'))
    const sheet = screen.getByTestId('canvas-mobile-add-sheet')
    const menu = sheet.querySelector('[data-testid="canvas-add-menu"]')!
    expect(menu).toBeInTheDocument()
    expect(
      menu.querySelectorAll(
        '[data-testid^="canvas-add-group-"] [role="menuitem"]',
      ),
    ).toHaveLength(10)
    for (const id of [
      'canvas-add-upload',
      'canvas-add-library',
      'canvas-add-shot-table',
    ]) {
      expect(sheet.querySelector(`[data-testid="${id}"]`)).toBeInTheDocument()
    }
  })

  it('抽屉里点一项交给宿主落卡，并切到装它的那一列', () => {
    const onAdd = vi.fn()
    const { container } = renderRail({ onAdd })
    fireEvent.click(screen.getByTestId('canvas-mobile-fab'))
    fireEvent.click(
      screen
        .getByTestId('canvas-mobile-add-sheet')
        .querySelector('[data-testid="canvas-add-text.script"]')!,
    )
    expect(onAdd).toHaveBeenCalledWith('text.script')
    expect(container.querySelectorAll('[data-mobile-shot-card]')).toHaveLength(
      0,
    )
  })

  it('抽屉里的「上传」点的是常驻的隐藏 input（抽屉关了 change 仍有人接）', () => {
    const onUploadFiles = vi.fn()
    renderRail({ onUploadFiles })
    const input = screen.getByTestId(
      'canvas-mobile-upload-input',
    ) as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByTestId('canvas-mobile-fab'))
    fireEvent.click(screen.getByTestId('canvas-add-upload'))
    expect(click).toHaveBeenCalled()
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(onUploadFiles).toHaveBeenCalledWith([file])
  })

  it('项目胶囊挪到左下，和 FAB 同一条底线', () => {
    renderRail()
    expect(screen.getByTestId('canvas-mobile-project')).toContainElement(
      screen.getByTestId('pill'),
    )
  })
})
