import React from 'react'
import { createStyles, makeStyles, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@material-ui/core'

export interface ResultsTableProps {
  /** Players results */
  players: Array<{ position: number; username: string; roundPoints: number; totalPoints: number }>
}

const useStyles = makeStyles(
  createStyles({
    resultsTable: {},
  }),
)

export const ResultsTable: React.FC<ResultsTableProps> = ({ players }) => {
  const classes = useStyles()

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Position</TableCell>
            <TableCell>Player</TableCell>
            <TableCell>Round points</TableCell>
            <TableCell>Total points</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {players.map(({ position, username, roundPoints, totalPoints }, index) => (
            <TableRow key={index}>
              <TableCell>{position}</TableCell>
              <TableCell>{username}</TableCell>
              <TableCell>{roundPoints}</TableCell>
              <TableCell>{totalPoints}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

ResultsTable.displayName = 'ResultsTable'
