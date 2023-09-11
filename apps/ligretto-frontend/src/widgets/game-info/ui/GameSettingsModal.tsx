import { Box, Modal, Slide } from '@memebattle/ui'
import { GameSettingsContainer } from './GameSettings/GameSettingsContainer'
import type { FC } from 'react'

export const GameSettingsModal: FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <Modal open={isOpen}>
    <Slide direction="down" mountOnEnter unmountOnExit in={isOpen}>
      <Box display="flex" height="100%" alignItems="center" justifyContent="center">
        <Box padding={1} display="flex" minHeight="min(44rem, 100vh)" maxHeight="100%" width="64rem" minWidth="min-content" maxWidth="100%">
          <GameSettingsContainer />
        </Box>
      </Box>
    </Slide>
  </Modal>
)
