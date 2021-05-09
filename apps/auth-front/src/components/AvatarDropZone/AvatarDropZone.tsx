import React, { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import styles from './AvatarDropZone.module.scss'
import { ReactComponent as Logo } from '../../images/UserPhoto.svg'
import { ReactComponent as ButtonLogo } from '../../images/UploadButton.svg'
import { Button } from '@memebattle/ligretto-ui'
import cn from 'classnames'
import { DropBox } from '../DropBox/DropBox'
import { UserPhotoDrop } from '../UserPhotoDrop'

interface DropZoneProps {
  onChange?: (files: File) => void
}
type FilePreviewItem = {
  preview: string
}
type FilePreview = {
  file: FilePreviewItem
}

export const AvatarDropZone = (props: DropZoneProps) => {
  const [file, setFile] = useState<FilePreview>()
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ['image/png', 'image/svg', 'image/jpeg', 'image/jpg'],
    onDrop: acceptedFiles => {
      const file = acceptedFiles[0]
      const file = Object.assign(file, {
        preview: URL.createObjectURL(file),
      })
      setFile(file)
      if (props.onChange) {
        props.onChange(file)
      }
    },
  })

  useEffect(
    () => () => {
      // Make sure to revoke the data uris to avoid memory leaks
      URL.revokeObjectURL(file.preview)
    },
    [file],
  )

  return (
    <div className={styles.dropZone} {...getRootProps()}>
      <input {...getInputProps()} />
      {!isDragActive ? (
        <div className={cn(styles.container, styles.container__border)}>
          {file ? <UserPhotoDrop file={file} /> : <Logo className={styles.container__img} />}
          <div className={styles.buttonWrapper}>
            <Button size="medium" variant="outlined" color="inherit" endIcon={<ButtonLogo>send</ButtonLogo>}>
              UPLOAD
            </Button>
          </div>
        </div>
      ) : (
        <DropBox />
      )}
    </div>
  )
}
