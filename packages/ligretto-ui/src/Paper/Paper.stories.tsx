import { Paper } from './Paper'

export default {
  title: 'Ligretto-ui / Paper',
  component: Paper,
}

const Template = args => <Paper {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  children: 'Qweqwe',
}
