import { ResultsTable } from './ResultsTable'

export default {
  title: 'Ligretto-ui / ResultsTable',
  component: ResultsTable,
}

/**
 * Temporary. Should be removed with component refactoring https://ligretto.atlassian.net/browse/LIG-156
 * TODO: remove https://ligretto.atlassian.net/browse/LIG-156
 */
const AvatarComponent = () => null

const players = [
  { position: 1, username: 'ThemeZV2', roundPoints: -4, totalPoints: 20 },
  { position: 2, username: 'ThemeZV', roundPoints: 12, totalPoints: 22, isPlayer: true },
  { position: 3, username: 'ThemeZV3', roundPoints: 0, totalPoints: 8 },
  { position: 4, username: 'ThemeZV4', roundPoints: 1, totalPoints: 2 },
]

export const DefaultView = () => <ResultsTable players={players} AvatarComponent={AvatarComponent} />
