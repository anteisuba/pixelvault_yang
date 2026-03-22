'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

interface StoryExportButtonProps {
  storyTitle: string
  contentRef: React.RefObject<HTMLDivElement | null>
}

export function StoryExportButton({
  storyTitle,
  contentRef,
}: StoryExportButtonProps) {
  const t = useTranslations('StoryBoard')
  const [isExporting, setIsExporting] = useState(false)

  const handleExportPng = async () => {
    if (!contentRef.current) return
    setIsExporting(true)

    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(contentRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: '#faf9f5',
      })

      const link = document.createElement('a')
      link.download = `${storyTitle.replace(/[^a-zA-Z0-9]/g, '_')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isExporting}
      onClick={handleExportPng}
      className="gap-1.5 rounded-full"
    >
      {isExporting ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Download className="size-3.5" />
      )}
      {t('exportPng')}
    </Button>
  )
}
