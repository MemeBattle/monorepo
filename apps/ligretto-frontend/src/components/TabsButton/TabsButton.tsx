import { Tab, Tabs } from '@memebattle/ui'
import React from 'react'
import { styled, useTheme } from '@mui/material'

export const TabsButton = ({ tabsTitle }: { tabsTitle: string[] }) => {
  const [value, setValue] = React.useState(0)
  const { palette } = useTheme()

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue)
  }

  const StyledTabs = styled(Tabs)(({ theme }) => ({
    '& .MuiTab-root': {
      // borderRadius: '4px 0 0 4px', //TODO border-radius для крайних табов
      lineHeight: '1em',
      fontSize: '1.5em',
      minHeight: '2.7em',
      backgroundColor: '#2FB166',
      [theme.breakpoints.down('sm')]: {
        fontSize: '1em',
      },
    },
    '& .MuiTab-root.Mui-selected': {
      backgroundColor: palette.primary.lighter,
    },
    '& .MuiTabs-indicator': {
      display: 'none',
    },
  }))

  return (
    <StyledTabs variant="fullWidth" value={value} onChange={handleChange} textColor="inherit">
      {/* TODO имена табов капсом по умолчанию */}
      {tabsTitle.map((title, i) => (
        <Tab value={i} label={title} key={i} />
      ))}
    </StyledTabs>
  )
}
