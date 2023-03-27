'use client'

import {
  Box,
  Typography,
  useTheme,
  LoaderCards,
  MemebattleLogo,
  Stack,
  Button,
  Carousel,
  CarouselControls,
  CarouselSlides,
  CarouselControl,
} from '@memebattle/ui'
import type { ReactNode } from 'react'

const games: Record<string, { title: string; description: string; logo: ReactNode; link: string }> = {
  ligretto: {
    title: 'Ligretto',
    description: 'Короткое, но стремительное соревнование всех со всеми за право называться самым внимательным, резвым и удачливым...',
    logo: <LoaderCards />,
    link: 'https://ligretto.app',
  },
  otherGame: {
    title: 'MemeBattle',
    description: 'Multiplayer battle of memes',
    logo: <MemebattleLogo />,
    link: 'https://mems.fun',
  },
}

const gamesList = Object.entries(games)

interface GameItemProps {
  isActive?: boolean
  children: ReactNode
  logo: ReactNode
  offset?: number
}

const GameItem = ({ isActive, children, logo }: GameItemProps) => {
  const theme = useTheme()
  return (
    <Box
      background={isActive ? theme.palette.background.light : undefined}
      flexDirection="column"
      cursor="pointer"
      flex={1}
      display="flex"
      maxHeight="12rem"
      justifyContent="space-between"
    >
      <Box
        width={[, , , '30rem']}
        display="flex"
        flex={1}
        alignItems="center"
        flexDirection={['column', 'row']}
        justifyContent={['space-between', 'start']}
      >
        <Box display="flex" maxHeight="6rem" width="4rem">
          {logo}
        </Box>
        <Box padding={theme.spacing(3)}>
          <Typography color={theme.palette.secondary.main} fontSize="1.4rem" fontWeight="600">
            {children}
          </Typography>
        </Box>
      </Box>
      <Box height="1px" background={isActive ? theme.palette.primary.main : theme.palette.background.light} />
    </Box>
  )
}

export const GamesBanner = () => {
  const theme = useTheme()

  return (
    <Box background={theme.palette.background.light} height="40rem">
      <Carousel>
        <CarouselSlides>
          {gamesList.map(([gameId, { title, description, link, logo }]) => (
            <Stack key={gameId} flex={1} justifyContent="space-around" maxHeight="100%" padding={[1, 2, 6]} direction="column" spacing={2}>
              <Typography variant="h2" fontWeight="bold">
                {title}
              </Typography>
              <Typography>{description}</Typography>
              <Box display="flex" minHeight={0} justifyContent="space-between" flexDirection={['column', 'row']}>
                <Box>
                  <Button size="large" variant="contained" href={link}>
                    Играть!
                  </Button>
                </Box>
                <Box display="flex" justifyContent="center" flex={1}>
                  {logo}
                </Box>
              </Box>
            </Stack>
          ))}
        </CarouselSlides>
        <CarouselControls>
          {gamesList.map(([gameId, { title, logo }]) => (
            <CarouselControl key={gameId}>
              <GameItem logo={logo} key={gameId}>
                {title}
              </GameItem>
            </CarouselControl>
          ))}
        </CarouselControls>
      </Carousel>
    </Box>
  )
}
