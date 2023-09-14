import { Tabs as TabsBase } from '@memebattle/ui'
import { styled } from '@mui/material'

export const Tabs = styled(TabsBase)(({ theme }) => ({
  '& .MuiTab-root': {
    lineHeight: '1em',
    fontSize: '1.5em',
    textTransform: 'none',
    minHeight: '2.7em',
    backgroundColor: '#2FB166',
    [theme.breakpoints.down('sm')]: {
      fontSize: '1em',
    },
    color: 'rgba(255, 255, 255, 0.5)',
  },
  '& .MuiTab-root.Mui-selected': {
    backgroundColor: theme.palette.primary.lighter,
    color: 'rgba(255, 255, 255, 1)',
  },
  '& .MuiTabs-indicator': {
    display: 'none',
  },
  '& .MuiTab-root:first-child': {
    borderRadius: '4px 0px 0px 4px',
  },
  '& .MuiTab-root:last-child': {
    borderRadius: '0px 4px 4px 0px',
  },
}))
