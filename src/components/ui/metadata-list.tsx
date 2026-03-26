interface MetadataItem {
  label: string
  value: string
  key: string
  icon?: React.ReactNode
}

interface MetadataListProps {
  items: MetadataItem[]
  labelClassName: string
}

/**
 * Key-value metadata display used in gallery cards and detail modals.
 */
export function MetadataList({ items, labelClassName }: MetadataListProps) {
  return (
    <dl className="grid gap-2 border-t border-border/70 pt-3">
      {items.map((item) => (
        <div key={item.key} className="flex items-start justify-between gap-3">
          <dt className={labelClassName}>{item.label}</dt>
          <dd className="flex items-center gap-1.5 text-right text-sm text-foreground">
            {item.icon}
            <span>{item.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
