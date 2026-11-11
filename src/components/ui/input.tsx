import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * 填字框：和搜索框一家——浅灰底、没边、全圆（ui-spec §9 输入）。
 * `bare` 给嵌在别的框里、自己不该有外观的那几处（输入框里的提示词、行内数字）。
 */
const FIELD =
  'rounded-full border border-transparent bg-muted px-3.5 hover:bg-fill-strong focus-visible:bg-muted focus-visible:shadow-focus aria-invalid:border-destructive'
const BARE = 'border-0 bg-transparent p-0'

function Input({
  className,
  type,
  bare = false,
  ...props
}: React.ComponentProps<'input'> & { bare?: boolean }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 text-base text-foreground transition-[background-color,border-color,box-shadow] duration-fast outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-2sm file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-2sm coarse:h-11',
        bare ? BARE : FIELD,
        className,
      )}
      {...props}
    />
  )
}

export { Input }
