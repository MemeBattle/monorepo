import * as React from 'react'
import { InputWithButtonTypes } from '@memebattle/ligretto-shared'
import { Button, IconButton, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { styled } from '@mui/material/styles'

import SearchIcon from '@mui/icons-material/Search'
import CachedIcon from '@mui/icons-material/Cached'

export interface InputWithButtonProps {
  type: InputWithButtonTypes
  defaultValue?: string
  isLoading?: boolean
  onSearchChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  onCreateClick?: () => void
  onRoomNameChange?: React.ChangeEventHandler<HTMLInputElement>
  validationErrors?: {
    error?: string
  } | null
  isButtonDisabled?: boolean
}

const StyledSearchInputWithButtonWrapper = styled('div')(({ theme }) => ({
  minHeight: theme.spacing(8),
  maxHeight: theme.spacing(8),
  height: theme.spacing(8),
  width: '100%',
  display: 'inline-flex',
  fontSize: theme.spacing(3),
  [theme.breakpoints.down('md')]: {
    minHeight: theme.spacing(6),
    maxHeight: theme.spacing(6),
    height: theme.spacing(6),
    fontSize: theme.spacing(2),
  },
  [theme.breakpoints.down('sm')]: {
    minHeight: theme.spacing(5),
    maxHeight: theme.spacing(5),
    height: theme.spacing(5),
    fontSize: theme.spacing(1.5),
  },
}))

const StyledInput = styled('input')(({ theme }) => ({
  border: 0,
  borderRadius: `${theme.spacing(0.5)} 0 0 ${theme.spacing(0.5)}`,
  paddingLeft: theme.spacing(5),
  height: '100%',
  width: '100%',
  color: theme.palette.primary.main,
  fontSize: 'inherit',
  '&::placeholder': {
    color: theme.palette.text.secondary,
  },
  [theme.breakpoints.down('md')]: {
    paddingLeft: theme.spacing(3.5),
  },
  [theme.breakpoints.down('sm')]: {
    paddingLeft: theme.spacing(2.5),
  },
}))

const ButtonWrapper = styled('div')<{ type: string }>(({ theme, type }) => ({
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  borderRadius: `0 ${theme.spacing(0.5)} ${theme.spacing(0.5)} 0`,
  background: theme.palette.primary.main,
  width: type === InputWithButtonTypes.createRoom ? theme.spacing(23.25) : theme.spacing(13),
  cursor: 'pointer',
}))

const StyledButton = styled(Button)(({ theme }) => ({
  height: '100%',
  boxShadow: `0 0 ${theme.spacing(2)} 0 #33333340`,
  textTransform: 'inherit',
}))

const StyledIconButton = styled(IconButton)(({ theme }) => ({
  color: theme.palette.primary.contrastText,
}))

export const InputWithButton: React.FC<InputWithButtonProps> = props => {
  const { type, isLoading, onCreateClick, onRoomNameChange, isButtonDisabled, validationErrors, onSearchChange } = props
  const theme = useTheme()

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const isTablet = useMediaQuery(theme.breakpoints.down('md'))

  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleButtonClick = React.useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const renderSearchInput = () => (
    <>
      <StyledInput ref={inputRef} placeholder={props.placeholder} onChange={onSearchChange} />
      <ButtonWrapper onClick={handleButtonClick} type={type}>
        <StyledIconButton>
          {isLoading ? (
            <CachedIcon fontSize={isMobile ? 'small' : isTablet ? 'medium' : 'large'} />
          ) : (
            <SearchIcon fontSize={isMobile ? 'small' : isTablet ? 'medium' : 'large'} />
          )}
        </StyledIconButton>
      </ButtonWrapper>
    </>
  )

  const renderCreateRoomInput = () => (
    <>
      <StyledInput placeholder={props.placeholder} onChange={onRoomNameChange} />
      <ButtonWrapper onClick={handleButtonClick} type={type}>
        <StyledButton
          data-test-id="CreateGameButton"
          onClick={onCreateClick}
          disabled={isButtonDisabled || !!validationErrors}
          variant="contained"
          color="primary"
          fullWidth
          size="large"
        >
          <Typography fontSize={isMobile || isTablet ? '1rem' : '1.5rem'}>Create</Typography>
        </StyledButton>
      </ButtonWrapper>
    </>
  )

  return <StyledSearchInputWithButtonWrapper>{type === 'search' ? renderSearchInput() : renderCreateRoomInput()}</StyledSearchInputWithButtonWrapper>
}
