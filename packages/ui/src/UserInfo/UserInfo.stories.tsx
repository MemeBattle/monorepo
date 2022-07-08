import { UserInfo } from './UserInfo'

export default {
  title: 'Ligretto-ui / UserInfo',
  component: UserInfo,
  argTypes: {
    onClick: { action: 'clicked' },
    buttonText: { control: 'text', defaultValue: 'Sign in' },
    onButtonClick: { action: 'buttonClicked' },
  },
}

export const DefaultView = args => <UserInfo {...args} />

export const Authorized = args => <UserInfo {...args} />

Authorized.argTypes = {
  onClick: { action: 'clicked' },
  username: { control: 'text', defaultValue: 'themezv' },
  buttonText: { control: 'text', defaultValue: 'Sign in' },
  onButtonClick: { action: 'button clicked' },
  img: { control: 'text' },
}
