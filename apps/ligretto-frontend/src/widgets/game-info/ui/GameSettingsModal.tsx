import { Box, Modal, Slide } from '@memebattle/ui'
import type { Theme } from '@mui/material/styles'
import { GameSettingsContainer } from './GameSettings/GameSettingsContainer'
import type { FC } from 'react'

/**
 * Phones in portrait are narrower than `sm`, phones in landscape are lower than it. The height alone also matches a
 * short desktop window, so it counts only on a touch-first device.
 */
const fullScreenMediaQuery = (theme: Theme) => {
  const maxSize = theme.breakpoints.values.sm - 0.05
  return `@media (max-width:${maxSize}px), (max-height:${maxSize}px) and (pointer: coarse)`
}

const safeAreaPadding = (theme: Theme) => {
  const spacing = theme.spacing(2)
  return ['top', 'right', 'bottom', 'left'].map(side => `calc(${spacing} + env(safe-area-inset-${side}, 0px))`).join(' ')
}

export const GameSettingsModal: FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <Modal open={isOpen}>
    <Slide direction="down" mountOnEnter unmountOnExit in={isOpen}>
      <Box display="flex" height="100%" alignItems="center" justifyContent="center">
        <Box
          padding={1}
          display="flex"
          minHeight="min(44rem, 100vh)"
          maxHeight="100%"
          width="64rem"
          minWidth="min-content"
          maxWidth="100%"
          sx={theme => ({
            [fullScreenMediaQuery(theme)]: {
              flexDirection: 'column',
              alignSelf: 'stretch',
              width: '100%',
              minWidth: 0,
              minHeight: 0,
              maxHeight: 'none',
              padding: 0,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              '& > .MuiPaper-root': {
                flexShrink: 0,
                borderRadius: 0,
                padding: safeAreaPadding(theme),
              },
            },
          })}
        >
          <GameSettingsContainer />
        </Box>
      </Box>
    </Slide>
  </Modal>
)
