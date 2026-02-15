import { Box, Typography } from '@memebattle/ui'

export function Description() {
  return (
    <Box transform="translate(-50%, -50%)" position="absolute" left="50%" top="50%">
      <Typography textAlign="center" variant="body1" fontWeight="bold">
        Description
      </Typography>
    </Box>
  )
}
