import { Background } from './Background'

export default {
  title: 'Ligretto-ui / Background',
  component: Background,
}

const Template = args => <Background {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  // write default values here
}
