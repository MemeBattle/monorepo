import { Box, Typography, useTheme, LoaderCards, MemebattleLogo, Stack, Grid, Button } from '@memebattle/ui'
import type { FC, ReactNode } from 'react'
import { useCallback, useState } from 'react'

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

const GameItem: FC<{ isActive: boolean; children: ReactNode; onClick: () => void; logo: ReactNode }> = ({ isActive, children, onClick, logo }) => {
  const theme = useTheme()
  return (
    <Box
      background={isActive ? theme.palette.background.light : undefined}
      flexDirection="column"
      cursor="pointer"
      flex={1}
      onClick={onClick}
      display="flex"
      maxHeight="12rem"
    >
      <Box display="flex" alignItems="center">
        <Box display="flex" maxHeight="6rem" width="4rem">
          {logo}
        </Box>
        <Box padding={theme.spacing(3)}>
          <Typography fontSize="1.4rem" fontWeight="600">
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

  const [selectedGameId, setSelectedGameId] = useState(() => Object.keys(games)[0])

  const handleSelectGame = useCallback((gameId: string) => {
    setSelectedGameId(gameId)
  }, [])

  return (
    <Box background={theme.palette.background.light}>
      <Grid container>
        <Grid maxHeight="35rem" height="35rem" xs={12} sm={8} item>
          <Stack maxHeight="100%" padding={6} direction="column" spacing={2}>
            <Typography variant="h2" fontWeight="bold">
              {games[selectedGameId].title}
            </Typography>
            <Typography>{games[selectedGameId].description}</Typography>
            <Box display="flex" minHeight={0} justifyContent="space-between">
              <Box>
                <Button size="large" variant="contained" href={games[selectedGameId].link}>
                  Играть!
                </Button>
              </Box>
              {games[selectedGameId].logo}
            </Box>
          </Stack>
        </Grid>
        <Grid bgcolor={theme.palette.background.lighter} xs={12} sm={4} item>
          <Box display="flex" flexDirection={['row', 'column']}>
            {gamesList.map(([gameId, { title, logo }]) => (
              <GameItem logo={logo} isActive={selectedGameId === gameId} key={gameId} onClick={() => handleSelectGame(gameId)}>
                {title}
              </GameItem>
            ))}
          </Box>
        </Grid>
      </Grid>
    </Box>
  )
}
