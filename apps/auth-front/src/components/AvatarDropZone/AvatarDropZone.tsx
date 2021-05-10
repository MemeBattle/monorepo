import React, { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import styles from './AvatarDropZone.module.scss'
import { ReactComponent as AvatarPlaceHolder } from '../../images/UserPhoto.svg'
import { ReactComponent as ButtonLogo } from '../../images/UploadButton.svg'
import { Button } from '@memebattle/ligretto-ui'
import cn from 'classnames'
import { DropBox } from '../DropBox/DropBox'
import { UserPhotoDrop } from '../UserPhotoDrop'
import { t } from '../../utils/i18n'

interface DropZoneProps {
  onChange?: (file: File) => void
}

type FilePreview = File & {
  preview: string
}

export const AvatarDropZone = (props: DropZoneProps) => {
  const [file, setFile] = useState<FilePreview | null>(null)
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ['image/png', 'image/svg', 'image/jpeg', 'image/jpg'],
    onDrop: acceptedFiles => {
      const file = acceptedFiles[0]
      const fileWithPreview: FilePreview = { ...file, preview: URL.createObjectURL(file) }
      setFile(fileWithPreview)
      if (props.onChange) {
        props.onChange(file)
      }
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
    <div className={styles.dropZone} {...getRootProps()}>
      <input {...getInputProps()} />
      {!isDragActive ? (
        <div className={cn(styles.container, styles.container__border)}>
          {file ? <UserPhotoDrop file={file} /> : <AvatarPlaceHolder className={styles.container__img} />}
          <div className={styles.buttonWrapper}>
            <Button size="medium" variant="outlined" color="inherit" endIcon={<ButtonLogo>send</ButtonLogo>}>
              {t.avatarDropZone.text}
            </Button>
          </div>
        </div>
      ) : (
        <DropBox />
      )}
    </div>
  )
}
