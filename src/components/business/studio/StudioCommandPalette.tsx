'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from 'cmdk'
import {
  ImageIcon,
  Film,
  Wand2,
  Layers,
  Settings2,
  Search,
  Cpu,
} from 'lucide-react'

import { useStudioForm, type PanelName } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { getProviderLabel } from '@/constants/providers'
import { LoraTrainingDialog } from '@/components/business/LoraTrainingDialog'
import { useTranslations } from 'next-intl'

/**
 * StudioCommandPalette — Cmd+K command palette for quick actions.
 * Switch models, change modes, toggle panels, and search history.
 */
export const StudioCommandPalette = memo(function StudioCommandPalette() {
  const [open, setOpen] = useState(false)
  const [loraOpen, setLoraOpen] = useState(false)
  const { state, dispatch } = useStudioForm()
  const { modelOptions } = useImageModelOptions()
  const tModels = useTranslations('Models')

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const selectModel = useCallback(
    (optionId: string) => {
      dispatch({ type: 'SET_OPTION_ID', payload: optionId })
      setOpen(false)
    },
    [dispatch],
  )

  const switchMode = useCallback(
    (mode: 'image' | 'video') => {
      dispatch({ type: 'SET_OUTPUT_TYPE', payload: mode })
      setOpen(false)
    },
    [dispatch],
  )

  const switchWorkflow = useCallback(
    (mode: 'quick' | 'card') => {
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: mode })
      setOpen(false)
    },
    [dispatch],
  )

  const togglePanel = useCallback(
    (panel: PanelName) => {
      dispatch({ type: 'TOGGLE_PANEL', payload: panel })
      setOpen(false)
    },
    [dispatch],
  )

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        label="Studio command palette"
        className="studio-command-dialog"
      >
        <CommandInput placeholder="Search models, actions..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Mode switching */}
          <CommandGroup heading="Mode">
            <CommandItem
              onSelect={() => switchMode('image')}
              className="studio-command-item"
            >
              <ImageIcon className="size-4 text-muted-foreground" />
              <span>Image Mode</span>
              {state.outputType === 'image' && (
                <span className="ml-auto text-xs text-primary">Active</span>
              )}
            </CommandItem>
            <CommandItem
              onSelect={() => switchMode('video')}
              className="studio-command-item"
            >
              <Film className="size-4 text-muted-foreground" />
              <span>Video Mode</span>
              {state.outputType === 'video' && (
                <span className="ml-auto text-xs text-primary">Active</span>
              )}
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Workflow */}
          <CommandGroup heading="Workflow">
            <CommandItem
              onSelect={() => switchWorkflow('quick')}
              className="studio-command-item"
            >
              <Wand2 className="size-4 text-muted-foreground" />
              <span>Quick Generate</span>
              {state.workflowMode === 'quick' && (
                <span className="ml-auto text-xs text-primary">Active</span>
              )}
            </CommandItem>
            <CommandItem
              onSelect={() => switchWorkflow('card')}
              className="studio-command-item"
            >
              <Layers className="size-4 text-muted-foreground" />
              <span>Card Generate</span>
              {state.workflowMode === 'card' && (
                <span className="ml-auto text-xs text-primary">Active</span>
              )}
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Models */}
          {modelOptions.length > 0 && (
            <CommandGroup heading="Models">
              {modelOptions.map((opt) => {
                const label =
                  opt.keyLabel ?? getTranslatedModelLabel(tModels, opt.modelId)
                const provider = getProviderLabel(opt.providerConfig)
                const isActive = opt.optionId === state.selectedOptionId
                return (
                  <CommandItem
                    key={opt.optionId}
                    value={`${label} ${provider}`}
                    onSelect={() => selectModel(opt.optionId)}
                    className="studio-command-item"
                  >
                    <Search className="size-4 text-muted-foreground" />
                    <span>{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {provider}
                    </span>
                    {isActive && (
                      <span className="ml-auto text-xs text-primary">
                        Active
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}

          <CommandSeparator />

          {/* Panels */}
          <CommandGroup heading="Panels">
            <CommandItem
              onSelect={() => togglePanel('advanced')}
              className="studio-command-item"
            >
              <Settings2 className="size-4 text-muted-foreground" />
              <span>Toggle Advanced Settings</span>
            </CommandItem>
            <CommandItem
              onSelect={() => togglePanel('refImage')}
              className="studio-command-item"
            >
              <ImageIcon className="size-4 text-muted-foreground" />
              <span>Toggle Reference Image</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Tools */}
          <CommandGroup heading="Tools">
            <CommandItem
              onSelect={() => {
                setOpen(false)
                setLoraOpen(true)
              }}
              className="studio-command-item"
            >
              <Cpu className="size-4 text-muted-foreground" />
              <span>Train LoRA</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* LoRA Training Dialog — opened via command palette */}
      {/* LoRA Training Dialog — opened via command palette */}
      <LoraTrainingDialog open={loraOpen} onOpenChange={setLoraOpen} />
    </>
  )
})
