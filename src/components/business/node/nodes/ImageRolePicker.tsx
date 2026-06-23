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
  /** The node's existing role when this is a re-choose (vs a fresh role-less
   *  node). Re-picking it is a no-op so the card's image/data survive. */
  currentRole?: NodeImageRole
  /** Fired once a role is chosen — lets a re-choosing card exit the chooser. */
  onPicked?: () => void
}

/**
 * The role-choosing content (title + 3 role buttons), without any card chrome.
 * Shared by the canvas card (`ImageRolePicker`) and the expand/detail panel so a
 * role-less image node offers the SAME choice whether collapsed or expanded —
 * expanding it must never fall through to a default (shot) editing form.
 */
export function ImageRolePickerBody({
  nodeId,
  currentRole,
  onPicked,
}: {
  nodeId: string
  currentRole?: NodeImageRole
  onPicked?: () => void
}) {
  const t = useTranslations('StudioNode.imageRolePicker')
  const { updateNodeData } = useNodeWorkflowActions()

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-node-muted">{t('title')}</p>
      <div className="space-y-2">
        {ROLE_OPTIONS.map(({ role, Icon }) => (
          <button
            key={role}
            type="button"
            onClick={() => {
              // Re-picking the current role is a no-op — the non-destructive
              // "back" from a re-choose keeps the image/data. A different role
              // (or a fresh role-less node) resets to that role's blank template.
              if (role !== currentRole) {
                updateNodeData(nodeId, {
                  ...createDefaultNodeData(
                    NODE_IMAGE_ROLE_TO_LEGACY_TYPE[role],
                  ),
                  role,
                })
              }
              onPicked?.()
            }}
            className="nodrag flex w-full items-center gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-left text-sm text-node-foreground transition-colors hover:border-node-muted/70 hover:bg-node-panel-inner"
          >
            <Icon className="size-4 text-node-muted" />
            {t(role)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ImageRolePicker({
  nodeId,
  selected,
  status,
  currentRole,
  onPicked,
}: ImageRolePickerProps) {
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
      <NodeShell.Body>
        <ImageRolePickerBody
          nodeId={nodeId}
          currentRole={currentRole}
          onPicked={onPicked}
        />
      </NodeShell.Body>
    </NodeShell>
  )
}
