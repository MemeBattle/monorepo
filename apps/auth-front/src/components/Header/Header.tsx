import { Container } from '@memebattle/ligretto-ui'
import { useAppContext } from '../../modules/app'

export const Header = () => {
  const { Header } = useAppContext()

  return (
    <Container component="header">
      <>{Header}</>
    </Container>
  )
}
