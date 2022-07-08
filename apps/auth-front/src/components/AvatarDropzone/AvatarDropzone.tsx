import React, { memo, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import styles from './AvatarDropzone.module.scss'
import { ReactComponent as AvatarPlaceHolder } from '../../images/UserPhoto.svg'
import { ReactComponent as UploadIcon } from '../../images/UploadButton.svg'
import { Alert, Button, Snackbar } from '@memebattle/ui'
import cn from 'classnames'
import { DropBox } from '../DropBox'
import { UserPhotoDrop } from '../UserPhotoDrop'
import { t } from '../../utils/i18n'
import { useUploadError } from '../../hooks/useUploadError'

interface DropZoneProps {
  onChange?: (file: File) => void
  avatarUrl?: string
}

type FilePreview = File & {
  preview: string
}

export const MAX_FILE_SIZE = 2097152 // 2mb

export const AvatarDropzone = memo(({ avatarUrl, onChange }: DropZoneProps) => {
  const [file, setFile] = useState<FilePreview | null>(() => {
    if (avatarUrl) {
      const file: FilePreview = { ...new File([], 'default'), preview: avatarUrl }
      return file
    }
    return null
  })

  const [hasUploadError, handleError, clearError] = useUploadError()

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ['image/png', 'image/svg+xml', 'image/jpeg', 'image/jpg'],
    maxSize: MAX_FILE_SIZE,
    onDropAccepted: acceptedFiles => {
      const file = acceptedFiles[0]
      const fileWithPreview: FilePreview = { ...file, preview: URL.createObjectURL(file) }
      setFile(fileWithPreview)
      clearError()
      onChange?.(file)
    },
    onDropRejected: fileRejections => {
      handleError(fileRejections[0])
    },
  })

  useEffect(
    () => () => {
      // Make sure to revoke the data uris to avoid memory leaks
      if (file) {
        URL.revokeObjectURL(file.preview)
      }
    },
    [file],
  )

  return (
    <>
      <div className={styles.dropZone} {...getRootProps()}>
        <input {...getInputProps()} />
        {!isDragActive ? (
          <div className={cn(styles.container, styles.containerBorder, { [styles.containerBorderError]: hasUploadError })}>
            {file ? <UserPhotoDrop file={file} /> : <AvatarPlaceHolder className={styles.containerImg} />}
            <div className={styles.buttonWrapper}>
              <Button size="medium" variant="outlined" color="inherit" endIcon={<UploadIcon>send</UploadIcon>}>
                {t.avatarDropZone.text}
              </Button>
            </div>
          </div>
        ) : (
          <DropBox />
        )}
      </div>
      <Snackbar open={hasUploadError} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="error">{t.profile.maxFileSizeError}</Alert>
      </Snackbar>
    </>
  )
})
