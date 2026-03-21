import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { translationConfig } from './translations/config.js'
import { runTranslation } from './translations/translate.js'
import { log } from './log.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '..', '..', 'data')

log('INFO', 'translation', 'init', `data dir: ${dataDir}`)

runTranslation(dataDir, translationConfig).catch(err => {
  log('FAIL', 'translation', 'fatal', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
