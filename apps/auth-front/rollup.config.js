import resolve from '@rollup/plugin-node-resolve'
import peerDepsExternal from 'rollup-plugin-peer-deps-external'
import typescript from 'rollup-plugin-typescript2'
import commonjs from '@rollup/plugin-commonjs'
import postCss from 'rollup-plugin-postcss-modules'

export default {
  input: 'src/module.tsx',
  output: [
    {
      file: 'dist/module.js',
      format: 'cjs',
      sourcemap: true,
    },
    {
      file: 'dist/module.esm.js',
      format: 'esm',
      sourcemap: true,
    },
  ],
  plugins: [
    peerDepsExternal(),
    resolve({preferBuiltins: true, browser: true}),
    commonjs(),
    postCss(),
    typescript(),
  ],
}
