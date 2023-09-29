import type { FC } from 'react'
import { useState } from 'react'
import { Tab, useMediaQuery, useTheme, Typography, Grid } from '@memebattle/ui'
import { Tabs } from '../../shared/ui/Tabs'
import { LeaderListTable } from 'components/blocks/home/LeaderList'
import { LeaderListTableCell } from '../../components/blocks/home/LeaderList/LeaderListTableCell'
import { LeaderListTableHead } from '../../components/blocks/home/LeaderList/LeaderListTableHead'
import type { LeaderBoardProps } from '../../components/blocks/home/LeaderBoard/LeaderBoard'

const columnsProps = [
  { title: '#', size: { xs: 2, md: 1.5 } },
  { title: 'Player', size: { xs: 7.7, md: 8.7 } },
  { title: 'Points', size: { xs: 1.8, md: 1.8 } },
]

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

const CustomTabPanel: FC<TabPanelProps> = ({ children, value, index }) => (
  <div role="tabpanel" hidden={value !== index} id={`simple-tabpanel-${index}`} aria-labelledby={`simple-tab-${index}`}>
    {value === index && children}
  </div>
)

export const LeaderListContainer: FC<LeaderBoardProps> = ({ leaders }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const [value, setValue] = useState(0)

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue)
  }

  const title = !isMobile ? ['For day', 'For month', 'For all the time'] : ['Day', 'Month', 'All']

  return (
    <>
      <Tabs variant="fullWidth" value={value} onChange={handleChange}>
        {title.map(title => (
          <Tab label={title} />
        ))}
      </Tabs>
      {!isMobile && (
        <LeaderListTableHead>
          <Grid container minHeight="2.5em">
            {columnsProps.map(prop => (
              <LeaderListTableCell {...prop.size} justifyContent="center">
                <Typography variant="body1" color={theme.palette.text.disabled}>
                  {prop.title}
                </Typography>
              </LeaderListTableCell>
            ))}
          </Grid>
        </LeaderListTableHead>
      )}

      <CustomTabPanel value={value} index={0}>
        <LeaderListTable leader={leaders.day} />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={1}>
        <LeaderListTable leader={leaders.month} />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={2}>
        <LeaderListTable leader={leaders.all} />
      </CustomTabPanel>
    </>
  )
}
