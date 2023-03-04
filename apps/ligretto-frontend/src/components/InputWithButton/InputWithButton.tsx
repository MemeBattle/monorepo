import * as React from 'react'
import { Box, Button, InputBase } from '@memebattle/ui'
import { styled } from '@mui/material/styles'
import { theme } from '../../themes/default'

interface InputWithButtonExtension {
  Input: typeof StyledInput
  ButtonWrapper: typeof StyledButtonWrapper
  Button: typeof StyledButton
  IconWrapper: typeof StyledIconWrapper
}

const StyledInput = styled(InputBase)(({ theme }) => ({
  paddingLeft: '2.5rem',
  width: '100%',
  backgroundColor: theme.palette.primary.contrastText,
  color: theme.palette.primary.main,
  fontSize: 'inherit',
  [theme.breakpoints.down('md')]: {
    paddingLeft: '1.75rem',
  },
  [theme.breakpoints.down('sm')]: {
    paddingLeft: '1.25rem',
  },
}))

interface StyledButtonWrapperProps {
  onClick?: () => void
}

const StyledButtonWrapper: React.FC<React.PropsWithChildren<StyledButtonWrapperProps>> = ({ children, onClick }) => (
  <Box display="flex" justifyContent="center" alignItems="center" background={theme.palette.primary.main} onClick={onClick}>
    {children}
  </Box>
)

const StyledButton = styled(Button)(({ theme }) => ({
  height: '100%',
  width: '11.625rem',
  textTransform: 'none',
  cursor: 'pointer',
  fontSize: '1.5rem',
  '&:disabled': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.text.disabled,
  },
  [theme.breakpoints.down('lg')]: {
    width: '9rem',
  },
  [theme.breakpoints.down('md')]: {
    width: '6.5rem',
    fontSize: '1rem',
  },
  [theme.breakpoints.down('sm')]: {
    width: '6.5rem',
    fontSize: '1rem',
  },
}))

const StyledIconWrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box
    display="flex"
    justifyContent="center"
    alignItems="center"
    width={{ xs: '4.75rem', sm: '4.75rem', md: '6.5rem' }}
    fontSize={{ xs: '1.25rem', sm: '1.5rem', md: '2.185rem' }}
  >
    {children}
  </Box>
)

export const InputWithButton: React.FC<React.PropsWithChildren> & InputWithButtonExtension = ({ children }) => (
  <Box
    display="flex"
    width="100%"
    height={{ xs: '2.5rem', sm: '3rem', md: '4rem' }}
    fontSize={{ xs: '0.75rem', sm: '1rem', md: '1.5rem' }}
    borderRadius="0.25rem"
    overflow="hidden"
  >
    {children}
  </Box>
)

InputWithButton.Input = StyledInput
InputWithButton.ButtonWrapper = StyledButtonWrapper
InputWithButton.Button = StyledButton
InputWithButton.IconWrapper = StyledIconWrapper
