module.exports = {
  addons: ['@storybook/addon-essentials'],
  core: {
    builder: "webpack5",
  },
  stories: ['../src/**/*.stories.[tj]sx'],
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      compilerOptions: {
        allowSyntheticDefaultImports: false,
        esModuleInterop: false,
      },
    }
  },
}
