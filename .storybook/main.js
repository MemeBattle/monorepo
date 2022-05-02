const path = require("path");
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
  addons: ['@storybook/addon-essentials'],
  core: {
    builder: "webpack5",
  },
  stories: ['../**/*.stories.tsx'],
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      compilerOptions: {
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      },
    },
    webpackFinal(config) {
      config.resolve.plugins = [
        ...(config.resolve.plugins || []),
        new TsconfigPathsPlugin({
          configFile: path.resolve(__dirname, '../apps/ligretto-recovery/tsconfig.json'),
          extensions: config.resolve.extensions,
        }),
      ];
      return config;
    },
  },
}
