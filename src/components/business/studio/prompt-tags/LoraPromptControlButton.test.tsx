import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { describe, expect, it, vi } from 'vitest'

import { LoraPromptControlButton } from './LoraPromptControlButton'

const mockDispatch = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    onClick,
    className,
  }: {
    children: ReactNode
    href: string
    onClick?: () => void
    className?: string
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      prompt: '',
      advancedParams: {},
      selectedOptionId: 'image-option',
    },
    dispatch: mockDispatch,
  }),
  useStudioData: () => ({
    civitai: { hasToken: false },
    imageUpload: { setReferenceImage: vi.fn() },
  }),
}))

vi.mock('@/hooks/use-active-lora-stack', () => ({
  LORA_STACK_MAX: 3,
  useActiveLoraStack: () => ({
    items: [],
    mountEvent: null,
    acknowledgeMountEvent: vi.fn(),
    clear: vi.fn(),
    push: vi.fn(),
    remove: vi.fn(),
    setScale: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-prompt-tag-stack', () => ({
  usePromptTagStack: () => ({
    selectedCount: 0,
  }),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({
    modelOptions: [],
    selectedModel: null,
  }),
}))

vi.mock('@/hooks/prompts/use-civitai-mined-prompts', () => ({
  useCivitaiMinedPrompts: () => ({
    isLoading: false,
    recipes: [],
    outfits: [],
  }),
}))

vi.mock('@/lib/api-client', () => ({
  analyzeImageAPI: vi.fn(),
}))

vi.mock('@/lib/api-client/lora-assets', () => ({
  resolveCivitaiLoraAPI: vi.fn(),
}))

vi.mock('./TagLibrary', () => ({
  TagLibrary: () => <div />,
}))

vi.mock('./LoraSourceRecipeStrip', () => ({
  LoraSourceRecipeStrip: () => <div />,
}))

vi.mock('@/components/business/studio-shared/primitives/tool-surface', () => ({
  StudioToolSurface: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  StudioToolSurfaceTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  StudioToolPopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  studioToolTriggerClass: '',
}))

describe('LoraPromptControlButton', () => {
  it('exposes training and Civitai token access inside the LoRA panel', () => {
    render(
      <Toolbar.Root>
        <LoraPromptControlButton />
      </Toolbar.Root>,
    )

    const trainLink = screen.getByRole('link', { name: /trainLoraShort/ })
    expect(trainLink).toHaveAttribute('href', '/studio/lora?section=train')

    fireEvent.click(screen.getByRole('button', { name: /civitaiToken/ }))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'OPEN_PANEL',
      payload: 'civitai',
    })
  })
})
