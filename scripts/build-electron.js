const esbuild = require('esbuild')
const path = require('path')

const isWatch = process.argv.includes('--watch')

const buildOptions = {
  entryPoints: [
    path.resolve(__dirname, '../electron/main.ts'),
    path.resolve(__dirname, '../electron/preload.ts'),
    path.resolve(__dirname, '../electron/browser.ts')
  ],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outdir: path.resolve(__dirname, '../dist/electron'),
  external: ['electron', 'playwright'],
  format: 'cjs',
  sourcemap: true
}

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions)
      await ctx.watch()
      console.log('Watching for changes...')
    } else {
      await esbuild.build(buildOptions)
      console.log('Electron build complete')
    }
  } catch (error) {
    console.error('Build failed:', error)
    process.exit(1)
  }
}

build()
