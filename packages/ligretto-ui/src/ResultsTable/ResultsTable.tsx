import React from 'react'
import { createStyles, makeStyles, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@material-ui/core'

export interface ResultsTableProps {
  /** Players results */
  players: Array<{ position: number; username: string; roundPoints: number; totalPoints: number }>
}

const useStyles = makeStyles(theme =>
  createStyles({
    resultsTable: {
      borderRadius: '10px',
    },
    tableBody: {},
    tableHead: {
      background: theme.palette.common.white,
    },
    winnerRow: {
      background: theme.palette.primary.dark,
    },
    otherRow: {
      background: theme.palette.grey['700'],
    },
    tableHeaderCell: {
      fontSize: '1rem',
      fontWeight: 600,
      color: theme.palette.grey['700'],
    },
    tableBodyCell: {
      color: theme.palette.common.white,
      fontWeight: 600,
      fontSize: '2rem',
    },
  }),
)

export const ResultsTable: React.FC<ResultsTableProps> = ({ players }) => {
  const classes = useStyles()

  return (
    <TableContainer className={classes.resultsTable}>
      <Table>
        <TableHead className={classes.tableHead}>
          <TableRow>
            <TableCell className={classes.tableHeaderCell}>Position</TableCell>
            <TableCell className={classes.tableHeaderCell}>Player</TableCell>
            <TableCell className={classes.tableHeaderCell}>Round points</TableCell>
            <TableCell className={classes.tableHeaderCell}>Total points</TableCell>
          </TableRow>
        </TableHead>
        <TableBody className={classes.tableBody}>
          {players.map(({ position, username, roundPoints, totalPoints }, index) => (
            <TableRow className={position === 1 ? classes.winnerRow : classes.otherRow} key={index}>
              <TableCell className={classes.tableBodyCell}>{position}</TableCell>
              <TableCell className={classes.tableBodyCell}>{username}</TableCell>
              <TableCell className={classes.tableBodyCell}>{roundPoints}</TableCell>
              <TableCell className={classes.tableBodyCell}>{totalPoints}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

ResultsTable.displayName = 'ResultsTable'
