import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'node:path'

const config: UserConfigExport = defineConfig({
  projectName: 'perler-pattern-miniapp',
  date: '2026-11-16',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  // Keep platform artifacts isolated. The WeChat IDE watches this directory
  // incrementally; replacing it with an XHS build can leave a half-written
  // app.json/app-service runtime in the watcher cache.
  outputRoot: process.env.TARO_OUTPUT_ROOT || 'dist',
  framework: 'react',
  compiler: 'webpack5',
  plugins: ['@tarojs/plugin-platform-xhs'],
  mini: {
    postcss: {
      pxtransform: { enable: true },
      cssModules: { enable: false },
    },
    compile: {
      include: [path.resolve(__dirname, '../../src')],
    },
  },
})

export default config
