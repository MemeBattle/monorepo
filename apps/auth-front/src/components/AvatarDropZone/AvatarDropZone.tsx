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
  onChange?: (files: File[]) => void
}
type FilePreview = File & {
  preview: string
}

export const AvatarDropZone = (props: DropZoneProps) => {
  const [files, setFiles] = useState<FilePreview[]>([])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ['image/png', 'image/svg', 'image/jpeg', 'image/jpg'],
    onDrop: acceptedFiles => {
      const files = acceptedFiles.map(file =>
        Object.assign(file, {
          preview: URL.createObjectURL(file),
        }),
      )
      setFiles(files)
      if (props.onChange) {
        props.onChange(files)
      }
    },
  })

  useEffect(
    () => () => {
      // Make sure to revoke the data uris to avoid memory leaks
      files.forEach(file => URL.revokeObjectURL(file.preview))
    },
    [files],
  )

  return (
    <div className={styles.dropZone} {...getRootProps()}>
      <input {...getInputProps()} />
      {!isDragActive ? (
        <div className={cn(styles.container, styles.container__border)}>
          {files.length > 0 ? <UserPhotoDrop file={files[0]} /> : <Logo className={styles.container__img} />}
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
