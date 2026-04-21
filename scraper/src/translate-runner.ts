import { translationConfig } from './translations/config.js';
import { runTranslation } from './translations/translate.js';
import { getDataDir, getGlobalsDir } from './config.js';
import { log } from './log.js';

const dataDir = getDataDir();
const globalsDir = getGlobalsDir();

log('INFO', 'translation', 'init', `data dir: ${dataDir}, globals: ${globalsDir}`);

runTranslation(dataDir, globalsDir, translationConfig).catch(err => {
  log('FAIL', 'translation', 'fatal', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
