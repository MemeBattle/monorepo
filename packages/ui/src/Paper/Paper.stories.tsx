import { Paper } from './Paper'

export default {
  title: 'UI / Paper',
  component: Paper,
}

const Template = args => <Paper {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  children: 'Qweqwe',
}
