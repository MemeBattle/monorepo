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
  webpackFinal: async config => {
    config.module.rules.push({
      test: /\.(woff|woff2|eot|ttf)$/,
      use: [
        'file-loader',
      ],
    })
    config.module.rules.push({
      test: /\.(woff|woff2|eot|ttf)$/,
      use: [
        'file-loader',
      ],
    })
    return config
  },
}
