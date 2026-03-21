import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { translationConfig } from './translations/config.js'
import { runTranslation } from './translations/translate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const dataDir = resolve(__dirname, '..', '..', 'data')
  console.log(`Starting translation pipeline (data dir: ${dataDir})`)

  try {
    await runTranslation(dataDir, translationConfig)
  } catch (error) {
    console.error('Translation pipeline failed:', error)
    process.exit(1)
  }
}

main()
