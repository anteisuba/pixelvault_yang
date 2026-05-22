'use client'

import React, { useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface TreeNode<TData = unknown> {
  id: string
  label: string
  icon?: React.ReactNode
  children?: TreeNode<TData>[]
  data?: TData
}

export interface TreeNodeRenderState {
  hasChildren: boolean
  isExpanded: boolean
  isSelected: boolean
  level: number
}

export interface TreeViewProps<TData = unknown> {
  data: TreeNode<TData>[]
  className?: string
  onNodeClick?: (node: TreeNode<TData>) => void
  onNodeExpand?: (nodeId: string, expanded: boolean) => void
  defaultExpandedIds?: string[]
  showLines?: boolean
  showIcons?: boolean
  selectable?: boolean
  multiSelect?: boolean
  selectedIds?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
  indent?: number
  animateExpand?: boolean
  renderNodeContent?: (
    node: TreeNode<TData>,
    state: TreeNodeRenderState,
  ) => React.ReactNode
}

export function TreeView<TData = unknown>({
  data,
  className,
  onNodeClick,
  onNodeExpand,
  defaultExpandedIds = [],
  showLines = true,
  showIcons = true,
  selectable = true,
  multiSelect = false,
  selectedIds,
  onSelectionChange,
  indent = 18,
  animateExpand = true,
  renderNodeContent,
}: TreeViewProps<TData>) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(defaultExpandedIds),
  )
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>(
    () => selectedIds ?? [],
  )

  const currentSelectedIds = selectedIds ?? internalSelectedIds

  const toggleExpanded = useCallback(
    (nodeId: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        const isExpanded = next.has(nodeId)
        if (isExpanded) next.delete(nodeId)
        else next.add(nodeId)
        onNodeExpand?.(nodeId, !isExpanded)
        return next
      })
    },
    [onNodeExpand],
  )

  const handleSelection = useCallback(
    (nodeId: string, ctrlKey = false) => {
      if (!selectable) return

      const nextSelection =
        multiSelect && ctrlKey
          ? currentSelectedIds.includes(nodeId)
            ? currentSelectedIds.filter((id) => id !== nodeId)
            : [...currentSelectedIds, nodeId]
          : [nodeId]

      if (onSelectionChange) onSelectionChange(nextSelection)
      else setInternalSelectedIds(nextSelection)
    },
    [currentSelectedIds, multiSelect, onSelectionChange, selectable],
  )

  const activateNode = useCallback(
    (node: TreeNode<TData>, hasChildren: boolean, ctrlKey = false) => {
      if (hasChildren) toggleExpanded(node.id)
      handleSelection(node.id, ctrlKey)
      onNodeClick?.(node)
    },
    [handleSelection, onNodeClick, toggleExpanded],
  )

  const renderNode = (
    node: TreeNode<TData>,
    level = 0,
    isLast = false,
    parentPath: boolean[] = [],
  ): React.ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0
    const isExpanded = expandedIds.has(node.id)
    const isSelected = currentSelectedIds.includes(node.id)
    const currentPath = [...parentPath, isLast]
    const state: TreeNodeRenderState = {
      hasChildren,
      isExpanded,
      isSelected,
      level,
    }
    const defaultIcon = hasChildren ? (
      isExpanded ? (
        <FolderOpen className="size-4" />
      ) : (
        <Folder className="size-4" />
      )
    ) : (
      <File className="size-4" />
    )

    return (
      <div key={node.id} className="select-none">
        <motion.div
          role="treeitem"
          tabIndex={0}
          aria-selected={isSelected}
          aria-expanded={hasChildren ? isExpanded : undefined}
          className={cn(
            'group/tree-node relative mx-1 flex cursor-pointer items-center rounded-lg px-2 py-1.5 text-sm transition-colors',
            'hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            isSelected && 'bg-primary/10 text-primary',
          )}
          style={{ paddingLeft: level * indent + 8 }}
          onClick={(event) => {
            activateNode(node, hasChildren, event.ctrlKey || event.metaKey)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              activateNode(node, hasChildren, event.ctrlKey || event.metaKey)
            }
          }}
          whileTap={{ scale: 0.99, transition: { duration: 0.1 } }}
        >
          {showLines && level > 0 && (
            <div className="pointer-events-none absolute inset-y-0 left-0">
              {currentPath.map((isLastInPath, pathIndex) => (
                <div
                  key={pathIndex}
                  className="absolute inset-y-0 border-l border-border/45"
                  style={{
                    left: pathIndex * indent + 12,
                    display:
                      pathIndex === currentPath.length - 1 && isLastInPath
                        ? 'none'
                        : 'block',
                  }}
                />
              ))}
              <div
                className="absolute top-1/2 border-t border-border/45"
                style={{
                  left: (level - 1) * indent + 12,
                  width: indent - 4,
                  transform: 'translateY(-1px)',
                }}
              />
              {isLast && (
                <div
                  className="absolute top-0 border-l border-border/45"
                  style={{
                    left: (level - 1) * indent + 12,
                    height: '50%',
                  }}
                />
              )}
            </div>
          )}

          <motion.span
            className="mr-1 flex size-4 shrink-0 items-center justify-center"
            animate={{ rotate: hasChildren && isExpanded ? 90 : 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
          >
            {hasChildren && (
              <ChevronRight className="size-3 text-muted-foreground" />
            )}
          </motion.span>

          {showIcons && (
            <span
              className={cn(
                'mr-2 flex size-4 shrink-0 items-center justify-center',
                isSelected ? 'text-primary' : 'text-muted-foreground/75',
              )}
            >
              {node.icon ?? defaultIcon}
            </span>
          )}

          {renderNodeContent ? (
            renderNodeContent(node, state)
          ) : (
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
          )}
        </motion.div>

        <AnimatePresence initial={false}>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                duration: animateExpand ? 0.22 : 0,
                ease: 'easeInOut',
              }}
              className="overflow-hidden"
            >
              {node.children?.map((child, index) =>
                renderNode(
                  child,
                  level + 1,
                  index === (node.children?.length ?? 0) - 1,
                  currentPath,
                ),
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <motion.div
      role="tree"
      className={cn('w-full', className)}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {data.map((node, index) =>
        renderNode(node, 0, index === data.length - 1),
      )}
    </motion.div>
  )
}
