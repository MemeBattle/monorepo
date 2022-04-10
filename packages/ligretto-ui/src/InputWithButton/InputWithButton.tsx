import React from 'react'
import { Button, createStyles, Input, makeStyles } from '@material-ui/core'
import { Search } from '@material-ui/icons'
import { InputWithButtonTypes } from '@memebattle/ligretto-shared'

export interface InputWithButtonProps {
  type: InputWithButtonTypes
}

const backgroundColorByType = {
  [InputWithButtonTypes.search]: '#D3EDDE',
  [InputWithButtonTypes.createRoom]: '#F9F9F9',
}

const inputWidthByType = {
  [InputWithButtonTypes.search]: '437px',
  [InputWithButtonTypes.createRoom]: '352px',
}

const placeholderByType = {
  [InputWithButtonTypes.search]: 'Search..',
  [InputWithButtonTypes.createRoom]: 'Room name..',
}

const buttonWidthByType = {
  [InputWithButtonTypes.search]: '102px',
  [InputWithButtonTypes.createRoom]: '187px',
}

const useSearchStyles = makeStyles(
  createStyles({
    input: {
      backgroundColor: ({ type }: InputWithButtonProps) => backgroundColorByType[type],
      width: ({ type }: InputWithButtonProps) => inputWidthByType[type],
      height: '64px',
      borderRadius: '4px 0 0 4px',
      fontSize: '24px',
      color: '#000',
      paddingLeft: '32px',
    },
    button: {
      background: '#2D8A53',
      width: ({ type }: InputWithButtonProps) => buttonWidthByType[type],
      height: '64px',
      borderRadius: '0 4px 4px 0',
      boxShadow: '0px 0px 16px 0px #33333340',
      verticalAlign: 'top',
      textTransform: 'inherit',
      fontSize: '24px',
      fontWeight: 400,
      fontStyle: 'normal',
    },
  }),
)

export const InputWithButton: React.FC<InputWithButtonProps> = ({ type }) => {
  const classes = useSearchStyles({ type })

  const renderButtonChildren = () => {
    if (type === 'search') {
      return <Search fontSize="large" />
    }
    if (type === 'createRoom') {
      return 'Create'
    }
  }

  return (
    <>
      <Input className={classes.input} placeholder={placeholderByType[type]} />
      <Button className={classes.button}>{renderButtonChildren()}</Button>
    </>
  )
}
