import { scrape } from './restaurants/scraper.js';
import { getDataDir, getGlobalsDir } from './config.js';
import { log } from './log.js';

log('INFO', 'scrape', 'init', `data dir: ${getDataDir()}, globals: ${getGlobalsDir()}`);

scrape().catch(err => {
  log('FAIL', '*', 'fatal', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
