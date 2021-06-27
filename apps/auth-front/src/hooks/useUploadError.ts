import { useCallback, useState } from 'react'
import type { FileRejection } from 'react-dropzone'

type UseUploadErrorParams = { onError?: (fileRejection: FileRejection) => void }

export const useUploadError = ({ onError }: UseUploadErrorParams = {}) => {
  const [hasUploadError, setHasUploadError] = useState(false)

  const handleError = useCallback(
    (file: FileRejection) => {
      onError?.(file)
      setHasUploadError(true)
    },
    [onError],
  )

  const clearError = useCallback(() => setHasUploadError(false), [])

  return [hasUploadError, handleError, clearError] as const
}
