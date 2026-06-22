'use client'

import {
  Clapperboard,
  Mountain,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeWorkflowStatus,
} from '@/constants/node-types'
import { createDefaultNodeData } from '@/hooks/node/use-node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeShell } from './NodeShell'

/**
 * Empty-state for a freshly added unified image node (option B) whose role is
 * not yet set — LibTV-style per-node guidance. Picking a role stamps the node
 * with that role plus the role's default data (reusing `createDefaultNodeData`
 * so the single source of truth doesn't drift), after which `ImageNode`
 * delegates to the matching per-role card.
 */
const ROLE_OPTIONS: ReadonlyArray<{ role: NodeImageRole; Icon: LucideIcon }> = [
  { role: NODE_IMAGE_ROLE_IDS.character, Icon: UserRound },
  { role: NODE_IMAGE_ROLE_IDS.background, Icon: Mountain },
  { role: NODE_IMAGE_ROLE_IDS.shot, Icon: Clapperboard },
]

interface ImageRolePickerProps {
  nodeId: string
  selected?: boolean
  status: NodeWorkflowStatus
}

export function ImageRolePicker({
  nodeId,
  selected,
  status,
}: ImageRolePickerProps) {
  const t = useTranslations('StudioNode.imageRolePicker')
  const { updateNodeData } = useNodeWorkflowActions()

  return (
    <NodeShell
      nodeId={nodeId}
      type={NODE_TYPE_IDS.image}
      selected={selected}
      status={status}
      showSourceHandle={false}
      showTargetHandle={false}
    >
      <NodeShell.Header type={NODE_TYPE_IDS.image} status={status} />
      <NodeShell.Body className="space-y-3">
        <p className="text-xs font-medium text-node-muted">{t('title')}</p>
        <div className="space-y-2">
          {ROLE_OPTIONS.map(({ role, Icon }) => (
            <button
              key={role}
              type="button"
              onClick={() =>
                updateNodeData(nodeId, {
                  ...createDefaultNodeData(
                    NODE_IMAGE_ROLE_TO_LEGACY_TYPE[role],
                  ),
                  role,
                })
              }
              className="nodrag flex w-full items-center gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-left text-sm text-node-foreground transition-colors hover:border-node-muted/70 hover:bg-node-panel-inner"
            >
              <Icon className="size-4 text-node-muted" />
              {t(role)}
            </button>
          ))}
        </div>
      </NodeShell.Body>
    </NodeShell>
  )
}
