import { useMediaQuery, useTheme } from '@memebattle/ui'

/**
 * Whether the game board is laid out in a single column.
 *
 * Mirrors the breakpoint `GameGrid` switches to `MobileGameGrid` at: below it
 * the opponents stack vertically and the playground spans almost the whole
 * width, so the desktop habit of parking a description bubble next to the
 * playground pushes it off-screen.
 */
export function useIsNarrowLayout(): boolean {
  const theme = useTheme()

  return useMediaQuery(theme.breakpoints.down('md'))
}
