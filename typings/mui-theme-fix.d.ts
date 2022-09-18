import type { Theme } from '@mui/material/styles'

// TODO: Should be removed in https://ligretto.atlassian.net/browse/LIG-189
// https://mui.com/material-ui/migration/troubleshooting/#types-property-quot-palette-quot-quot-spacing-quot-does-not-exist-on-type-defaulttheme
declare module '@mui/styles' {
  // eslint-disable-next-line
  interface DefaultTheme extends Theme {}
}
