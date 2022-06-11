import resolve from '@rollup/plugin-node-resolve'
import peerDepsExternal from 'rollup-plugin-peer-deps-external'
import commonjs from '@rollup/plugin-commonjs'
import typescript from 'rollup-plugin-typescript2';
import postCss from 'rollup-plugin-postcss-modules'
import svgr from '@svgr/rollup'
import url from '@rollup/plugin-url'

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
    url(),
    svgr()
  ],
}
