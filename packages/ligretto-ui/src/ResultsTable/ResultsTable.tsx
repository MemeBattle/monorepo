import React from 'react'
import { createStyles, makeStyles, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@material-ui/core'
import { Avatar } from '../Avatar'

export interface ResultsTableProps {
  /** Players results */
  players: Array<{ position: number; username: string; avatar?: string; roundPoints: number; totalPoints: number; isPlayer: boolean }>
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
    playerRow: {
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

export const ResultsTable: React.FC<ResultsTableProps> = ({ players }: ResultsTableProps) => {
  const classes = useStyles()

  return (
    <TableContainer className={classes.resultsTable}>
      <Table>
        <TableHead className={classes.tableHead}>
          <TableRow>
            <TableCell className={classes.tableHeaderCell}>Position</TableCell>
            <TableCell className={classes.tableHeaderCell}>Avatar</TableCell>
            <TableCell className={classes.tableHeaderCell}>Username</TableCell>
            <TableCell className={classes.tableHeaderCell}>Round points</TableCell>
            <TableCell className={classes.tableHeaderCell}>Total points</TableCell>
          </TableRow>
        </TableHead>
        <TableBody className={classes.tableBody}>
          {players.map(({ position, username, roundPoints, totalPoints, avatar, isPlayer }, index) => (
            <TableRow className={isPlayer ? classes.playerRow : classes.otherRow} key={index}>
              <TableCell className={classes.tableBodyCell}>{position}</TableCell>
              <TableCell className={classes.tableBodyCell}>
                <Avatar src={avatar} size="small" />
              </TableCell>
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
