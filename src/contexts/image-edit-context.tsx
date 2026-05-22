'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  USER_UPLOAD_ACCEPTED_MIME_TYPES,
  USER_UPLOAD_MAX_BYTES,
} from '@/constants/uploads'
import { useInpaint } from '@/hooks/use-inpaint'
import { uploadImageAPI } from '@/lib/api-client'
import {
  getImageFileFromDataTransfer,
  getRemoteImageUrlFromDataTransfer,
  isRemoteImageUrl,
} from '@/lib/image-input'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import type {
  GenerationRecord,
  ImageDecomposeResult,
  InpaintRequest,
  OutpaintPadding,
  OutpaintRequest,
} from '@/types'
import type { ImageEditApiResult } from '@/lib/api-client/image-edit'

const DEFAULT_IMAGE_SIZE = 1024

export interface EditableSource {
  imageUrl: string
  generationId?: string
  width: number
  height: number
}

export type EditTaskKind =
  | 'upscale'
  | 'remove-background'
  | 'inpaint'
  | 'outpaint'
  | 'decompose'
  | 'extract-element'
  | 'object-replace'
  | 'style-transfer'
  | 'text-render'

export interface EditResult {
  imageUrl: string
  width: number
  height: number
  task: EditTaskKind
  generation?: GenerationRecord
}

export type DecomposeStage = 'queued' | 'running'

export interface ImageEditContextValue {
  source: EditableSource | null
  bannerError: string | null
  isUploadingSource: boolean
  assetPickerOpen: boolean
  result: EditResult | null
  layerResult: ImageDecomposeResult | null
  hasSource: boolean
  displayImage: string | null
  displayWidth: number
  displayHeight: number

  /** Currently running task (one at a time across the workspace). */
  runningTask: EditTaskKind | null
  /** True while inpaint/outpaint API call is in flight. */
  isMaskEditing: boolean
  /** Error surfaced by the inpaint/outpaint hook. */
  maskEditError: string | null
  /** Sub-stage of a decompose call for queue/running UI. */
  decomposeStage: DecomposeStage
  /** Composite busy flag — any in-flight operation. */
  isBusy: boolean

  setBannerError: (message: string | null) => void
  setAssetPickerOpen: (open: boolean) => void
  setResult: (next: EditResult | null) => void
  setLayerResult: (next: ImageDecomposeResult | null) => void
  setRunningTask: (task: EditTaskKind | null) => void
  setDecomposeStage: (stage: DecomposeStage) => void

  setSourceFromGeneration: (generation: GenerationRecord) => void
  setSourceFromUrl: (imageUrl: string) => Promise<void>
  resetEditState: () => void
  uploadSourceFile: (file: File) => Promise<void>
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  handlePaste: (event: ClipboardEvent<HTMLDivElement>) => void
  updateLoadedDimensions: (event: SyntheticEvent<HTMLImageElement>) => void

  /** Inpaint/outpaint helpers — proxied from useInpaint(). */
  inpaint: (params: InpaintRequest) => Promise<ImageEditApiResult | null>
  outpaint: (params: OutpaintRequest) => Promise<ImageEditApiResult | null>

  fileInputRef: RefObject<HTMLInputElement | null>
  pasteTargetRef: RefObject<HTMLDivElement | null>
}

const ImageEditContext = createContext<ImageEditContextValue | null>(null)

function parseDimension(value: string | null): number {
  if (!value) return DEFAULT_IMAGE_SIZE
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed)
    : DEFAULT_IMAGE_SIZE
}

function getSourceFromQuery(queryString: string): EditableSource | null {
  const params = new URLSearchParams(queryString)
  const sourceUrl = params.get('sourceUrl')
  if (!sourceUrl || !isRemoteImageUrl(sourceUrl)) return null

  return {
    imageUrl: sourceUrl,
    generationId: params.get('generationId') ?? undefined,
    width: parseDimension(params.get('width')),
    height: parseDimension(params.get('height')),
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to read file'))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function ImageEditProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  // Snapshot once — subsequent searchParams changes don't replace a source the
  // user has already picked.
  const initialSource = useMemo(
    () => getSourceFromQuery(searchParams.toString()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const t = useTranslations('StudioImageEdit')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pasteTargetRef = useRef<HTMLDivElement | null>(null)
  const [source, setSource] = useState<EditableSource | null>(initialSource)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [isUploadingSource, setIsUploadingSource] = useState(false)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [result, setResult] = useState<EditResult | null>(null)
  const [layerResult, setLayerResult] = useState<ImageDecomposeResult | null>(
    null,
  )
  const [runningTask, setRunningTask] = useState<EditTaskKind | null>(null)
  const [decomposeStage, setDecomposeStage] = useState<DecomposeStage>('queued')
  const {
    inpaint,
    outpaint,
    isLoading: isMaskEditing,
    error: maskEditError,
  } = useInpaint()

  const hasSource = source !== null
  const displayImage = result?.imageUrl ?? source?.imageUrl ?? null
  const displayWidth = result?.width ?? source?.width ?? DEFAULT_IMAGE_SIZE
  const displayHeight = result?.height ?? source?.height ?? DEFAULT_IMAGE_SIZE
  const isBusy = runningTask !== null || isMaskEditing || isUploadingSource

  const resetEditState = useCallback(() => {
    setResult(null)
    setLayerResult(null)
    setBannerError(null)
  }, [])

  const setSourceFromGeneration = useCallback(
    (generation: GenerationRecord) => {
      setSource({
        imageUrl: generation.url,
        generationId: generation.id,
        width: generation.width,
        height: generation.height,
      })
      resetEditState()
    },
    [resetEditState],
  )

  const setSourceFromUrl = useCallback(
    async (imageUrl: string) => {
      if (!isRemoteImageUrl(imageUrl)) {
        setBannerError(t('sourceInvalid'))
        return
      }

      setIsUploadingSource(true)
      setBannerError(null)
      try {
        const response = await uploadImageAPI({
          imageUrl,
          note: t('uploadNote'),
        })

        if (!response.success || !response.data) {
          const message = response.error ?? t('importFailed')
          setBannerError(message)
          toast.error(message)
          return
        }

        setSourceFromGeneration(response.data.generation)
        toast.success(t('importSuccess'))
      } catch {
        const message = t('importFailed')
        setBannerError(message)
        toast.error(message)
      } finally {
        setIsUploadingSource(false)
      }
    },
    [setSourceFromGeneration, t],
  )

  const validateSourceFile = useCallback(
    (file: File): boolean => {
      const acceptedTypes = USER_UPLOAD_ACCEPTED_MIME_TYPES as readonly string[]
      if (!acceptedTypes.includes(file.type)) {
        const message = t('uploadUnsupported')
        setBannerError(message)
        toast.error(message)
        return false
      }
      // Size is no longer rejected outright — uploadSourceFile passes the file
      // through compressImageToLimit so over-cap images shrink instead of
      // bouncing the user.
      return true
    },
    [t],
  )

  const uploadSourceFile = useCallback(
    async (file: File) => {
      if (!validateSourceFile(file)) return

      setIsUploadingSource(true)
      setBannerError(null)
      try {
        const maxMb = String(USER_UPLOAD_MAX_BYTES / 1024 / 1024)
        const uploadFile = await prepareImageUpload(file, {
          maxBytes: USER_UPLOAD_MAX_BYTES,
          messages: {
            compressing: t('uploadCompressing'),
            compressed: ({ from, to }) => t('uploadCompressed', { from, to }),
            gifTooLarge: t('uploadGifTooLarge', { maxMb }),
            tooLarge: t('uploadTooLarge', { maxMb }),
          },
          // Mirror the toast into the persistent in-canvas banner so the
          // error stays visible after the toast auto-dismisses.
          onError: setBannerError,
        })
        if (!uploadFile) return // helper already toasted + set banner

        const imageDataUrl = await readFileAsDataUrl(uploadFile)
        const response = await uploadImageAPI({
          imageDataUrl,
          note: t('uploadNote'),
        })

        if (!response.success || !response.data) {
          const message = response.error ?? t('uploadFailed')
          setBannerError(message)
          toast.error(message)
          return
        }

        setSourceFromGeneration(response.data.generation)
        toast.success(t('uploadSuccess'))
      } catch {
        const message = t('uploadFailed')
        setBannerError(message)
        toast.error(message)
      } finally {
        setIsUploadingSource(false)
      }
    },
    [setSourceFromGeneration, t, validateSourceFile],
  )

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) void uploadSourceFile(file)
    },
    [uploadSourceFile],
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const imageFile = getImageFileFromDataTransfer(event.clipboardData)
      if (imageFile) {
        event.preventDefault()
        void uploadSourceFile(imageFile)
        return
      }

      const pastedUrl = getRemoteImageUrlFromDataTransfer(event.clipboardData)
      if (pastedUrl) {
        event.preventDefault()
        void setSourceFromUrl(pastedUrl)
      }
    },
    [setSourceFromUrl, uploadSourceFile],
  )

  const updateLoadedDimensions = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget
      setSource((current) =>
        current && current.imageUrl === image.src
          ? {
              ...current,
              width: image.naturalWidth || current.width,
              height: image.naturalHeight || current.height,
            }
          : current,
      )
    },
    [],
  )

  const value = useMemo<ImageEditContextValue>(
    () => ({
      source,
      bannerError,
      isUploadingSource,
      assetPickerOpen,
      result,
      layerResult,
      hasSource,
      displayImage,
      displayWidth,
      displayHeight,
      runningTask,
      isMaskEditing,
      maskEditError,
      decomposeStage,
      isBusy,
      setBannerError,
      setAssetPickerOpen,
      setResult,
      setLayerResult,
      setRunningTask,
      setDecomposeStage,
      setSourceFromGeneration,
      setSourceFromUrl,
      resetEditState,
      uploadSourceFile,
      handleFileChange,
      handlePaste,
      updateLoadedDimensions,
      inpaint,
      outpaint,
      fileInputRef,
      pasteTargetRef,
    }),
    [
      source,
      bannerError,
      isUploadingSource,
      assetPickerOpen,
      result,
      layerResult,
      runningTask,
      isMaskEditing,
      maskEditError,
      decomposeStage,
      isBusy,
      inpaint,
      outpaint,
      hasSource,
      displayImage,
      displayWidth,
      displayHeight,
      setSourceFromGeneration,
      setSourceFromUrl,
      resetEditState,
      uploadSourceFile,
      handleFileChange,
      handlePaste,
      updateLoadedDimensions,
    ],
  )

  return (
    <ImageEditContext.Provider value={value}>
      {children}
    </ImageEditContext.Provider>
  )
}

export function useImageEdit(): ImageEditContextValue {
  const value = useContext(ImageEditContext)
  if (!value) {
    throw new Error('useImageEdit must be used inside <ImageEditProvider>')
  }
  return value
}

// Re-exported types for downstream consumers
export type { OutpaintPadding }
