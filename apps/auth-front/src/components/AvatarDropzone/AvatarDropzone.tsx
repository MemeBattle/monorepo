import React, { memo, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import styles from './AvatarDropzone.module.scss'
import { ReactComponent as AvatarPlaceHolder } from '../../images/UserPhoto.svg'
import { ReactComponent as UploadIcon } from '../../images/UploadButton.svg'
import { Alert, Button, Snackbar } from '@memebattle/ui'
import clsx from 'clsx'
import { DropBox } from '../DropBox'
import { UserPhotoDrop } from './UserPhotoDrop'
import { t } from '../../utils/i18n'
import { useUploadError } from '../../hooks/useUploadError'

interface DropZoneProps {
  onChange?: (file: File) => void
  avatarUrl?: string
}

export const MAX_FILE_SIZE = 2097152 // 2mb

export const AvatarDropzone = memo(({ avatarUrl, onChange }: DropZoneProps) => {
  const [stateFile, setStateFile] = useState<{ file: File; previewUrl: string } | null>(() => {
    if (avatarUrl) {
      const file = new File([], 'default')
      return { file, previewUrl: avatarUrl }
    }
    return null
  })

  const [hasUploadError, handleError, clearError] = useUploadError()

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ['image/png', 'image/svg+xml', 'image/jpeg', 'image/jpg'],
    maxSize: MAX_FILE_SIZE,
    onDropAccepted: acceptedFiles => {
      const acceptedFile = acceptedFiles[0]
      setStateFile({ file: acceptedFile, previewUrl: URL.createObjectURL(acceptedFile) })
      clearError()
      onChange?.(acceptedFile)
    },
    onDropRejected: fileRejections => {
      handleError(fileRejections[0])
    },
  })

  useEffect(
    () => () => {
      // Make sure to revoke the data uris to avoid memory leaks
      if (stateFile?.previewUrl) {
        URL.revokeObjectURL(stateFile.previewUrl)
      }
    },
    [stateFile?.previewUrl],
  )

  return (
    <>
      <div className={styles.dropZone} {...getRootProps()}>
        <input {...getInputProps()} />
        {!isDragActive ? (
          <div className={clsx(styles.container, styles.containerBorder, { [styles.containerBorderError]: hasUploadError })}>
            {stateFile?.file ? (
              <UserPhotoDrop name={stateFile.file.name} src={stateFile.previewUrl} />
            ) : (
              <AvatarPlaceHolder className={styles.containerImg} />
            )}
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
