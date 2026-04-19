import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { VideoScriptStatus } from '@/lib/generated/prisma/enums'
import type { VideoScriptRecord } from '@/types/video-script'

import { ScriptEditor } from './ScriptEditor'

const messages = {
  VideoScript: {
    statusDraft: 'Draft',
    statusScriptReady: 'Ready',
    sceneIndex: 'Scene {n}',
    sceneFieldCameraShot: 'Camera',
    sceneFieldAction: 'Action',
    sceneFieldDialogue: 'Dialogue',
    sceneFieldDuration: 'Duration',
    cameraShotCloseUp: 'Close-up',
    cameraShotMedium: 'Medium',
    cameraShotWide: 'Wide',
    cameraShotEstablishing: 'Establishing',
    cameraShotOverTheShoulder: 'Over-the-shoulder',
    totalDurationMismatch: 'Sum {sum}s vs target {target}s',
    regenerateButton: 'Regenerate',
    saveDraftButton: 'Save draft',
    savingButton: 'Saving…',
    confirmButton: 'Confirm script',
    confirmingButton: 'Confirming…',
    deleteButton: 'Delete',
    deleteConfirmTitle: 'Delete this script?',
    deleteConfirmBody: 'Gallery items stay.',
  },
}

function buildScript(
  overrides: Partial<VideoScriptRecord> = {},
): VideoScriptRecord {
  return {
    id: 'script-1',
    userId: 'user-1',
    topic: 'cat flight',
    targetDuration: 30,
    totalScenes: 5,
    status: VideoScriptStatus.DRAFT,
    consistencyMode: 'first_frame_ref',
    characterCardId: null,
    styleCardId: null,
    videoModelId: 'seedance-2-fast',
    finalVideoUrl: null,
    scenes: Array.from({ length: 5 }).map((_, i) => ({
      id: `scene-${i}`,
      scriptId: 'script-1',
      orderIndex: i,
      duration: 6,
      cameraShot: 'wide' as const,
      action: `action ${i}`,
      dialogue: null,
      transition: 'cut' as const,
      frameGenerationId: null,
      clipGenerationId: null,
      status: 'PENDING' as const,
      errorMessage: null,
    })),
    createdAt: new Date('2026-04-19').toISOString(),
    updatedAt: new Date('2026-04-19').toISOString(),
    ...overrides,
  }
}

type EditorProps = Parameters<typeof ScriptEditor>[0]

function renderEditor(
  overrides: Partial<{
    script: VideoScriptRecord
    isBusy: boolean
    error: string | null
    onSave: EditorProps['onSave']
    onConfirm: EditorProps['onConfirm']
    onDelete: EditorProps['onDelete']
    onRegenerate: EditorProps['onRegenerate']
  }> = {},
) {
  const onSave = overrides.onSave ?? vi.fn(async () => true)
  const onConfirm = overrides.onConfirm ?? vi.fn(async () => true)
  const onDelete = overrides.onDelete ?? vi.fn(async () => true)
  const onRegenerate = overrides.onRegenerate ?? vi.fn()
  const script = overrides.script ?? buildScript()

  const utils = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ScriptEditor
        script={script}
        isBusy={overrides.isBusy ?? false}
        error={overrides.error ?? null}
        onSave={onSave}
        onConfirm={onConfirm}
        onDelete={onDelete}
        onRegenerate={onRegenerate}
      />
    </NextIntlClientProvider>,
  )
  return { script, onSave, onConfirm, onDelete, onRegenerate, ...utils }
}

describe('ScriptEditor', () => {
  it('renders all 5 scenes with field labels', () => {
    renderEditor()
    expect(screen.getByText('Scene 1')).toBeInTheDocument()
    expect(screen.getByText('Scene 5')).toBeInTheDocument()
    expect(screen.getAllByText('Action')).toHaveLength(5)
  })

  it('shows Draft status and 30/30s when scenes match target', () => {
    renderEditor()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('30s / 30s')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('surfaces mismatch warning when durations do not sum to target', () => {
    const script = buildScript()
    // Edit first scene duration to 7 — sum becomes 31
    const { container } = renderEditor({ script })
    const durationInput = container.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement
    fireEvent.change(durationInput, { target: { value: '7' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Sum 31s vs target 30s')
  })

  it('disables confirm when any scene action is empty', () => {
    const script = buildScript({
      scenes: buildScript().scenes.map((s, i) =>
        i === 0 ? { ...s, action: '' } : s,
      ),
    })
    renderEditor({ script })
    expect(
      screen.getByRole('button', { name: 'Confirm script' }),
    ).toBeDisabled()
  })

  it('disables confirm when durations mismatch', () => {
    const { container } = renderEditor()
    const durationInput = container.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement
    fireEvent.change(durationInput, { target: { value: '8' } })
    expect(
      screen.getByRole('button', { name: 'Confirm script' }),
    ).toBeDisabled()
  })

  it('disables confirm when already SCRIPT_READY', () => {
    renderEditor({
      script: buildScript({ status: VideoScriptStatus.SCRIPT_READY }),
    })
    expect(
      screen.getByRole('button', { name: 'Confirm script' }),
    ).toBeDisabled()
  })

  it('calls onSave with current scenes when Save draft clicked', () => {
    const { onSave } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(onSave).toHaveBeenCalledOnce()
    const passed = vi.mocked(onSave).mock.calls[0]![0] as Array<{
      orderIndex: number
    }>
    expect(passed).toHaveLength(5)
    expect(passed[0]?.orderIndex).toBe(0)
  })

  it('calls onConfirm when confirm button clicked with valid state', () => {
    const { onConfirm } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm script' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onRegenerate when Regenerate clicked', () => {
    const { onRegenerate } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    expect(onRegenerate).toHaveBeenCalledOnce()
  })

  it('opens delete confirmation dialog before firing onDelete', () => {
    const { onDelete } = renderEditor()

    // First Delete click opens dialog but does not call onDelete
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()

    // Click confirm inside dialog
    const dialog = screen.getByRole('alertdialog')
    const confirmBtn = within(dialog).getAllByRole('button', {
      name: 'Delete',
    })[1]!
    fireEvent.click(confirmBtn)
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
