import { Link } from './Link'

export default {
  title: 'Ligretto-ui / Link',
  component: Link,
}

const Template = args => <Link {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  // write default values here
}
