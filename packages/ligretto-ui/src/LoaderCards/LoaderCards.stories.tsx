import { LoaderCards } from './LoaderCards'

export default {
  title: 'Ligretto-ui / LoaderCards',
  component: LoaderCards,
}

const Template = args => <LoaderCards {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  // write default values here
}
