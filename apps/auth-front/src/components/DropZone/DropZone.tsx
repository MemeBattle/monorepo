import React, { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import styles from './DropZone.module.scss'
import { ReactComponent as Logo } from '../../images/UserPhoto.svg'
import { ReactComponent as ButtonLogo } from '../../images/UploadButton.svg'
import { ReactComponent as DropLogo } from '../../images/DropImage.svg'
import { Button, Typography } from '@memebattle/ligretto-ui'
import cn from 'classnames'

interface DropZoneProps {
  onChange?: (files: File[]) => void
}
type FilePreview = File & {
  preview: string
}

export const Dropzone = (props: DropZoneProps) => {
  const [files, setFiles] = useState<FilePreview[]>([])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: 'image/*',
    multiple: false,
    noDrag: false,
    onDragEnter: console.log,
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

  // const removeFile = (file: FilePreview) => () => {
  //   const newFiles = [...files]
  //   newFiles.splice(newFiles.indexOf(file), 1)
  //   setFiles(newFiles)
  // }

  const thumbs = files.map(file => <img key={file.name} src={file.preview} className={styles.container__img} alt={file.name} />)

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
          {files.length > 0 ? <div className={styles.userPhoto}>{thumbs}</div> : <Logo className={styles.container__img} />}
          <div className={styles.buttonWrapper}>
            <Button size="medium" variant="outlined" color="inherit" endIcon={<ButtonLogo>send</ButtonLogo>}>
              UPLOAD
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.box}>
          <DropLogo className={styles.box__logo} />
          <Typography variant="subtitle1" align={'center'} gutterBottom color={'inherit'}>
            Drop avatar here
          </Typography>
        </div>
      )}
    </div>
  )
}
