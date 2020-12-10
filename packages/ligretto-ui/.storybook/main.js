module.exports = {
  addons: ['@storybook/addon-essentials'],
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
  webpackFinal: async config => {
    config.module.rules.push({
      test: /\.(png|woff|woff2|eot|ttf|svg)$/,
      use: [
        'file-loader',
      ],
    })
    return config
  },
}
