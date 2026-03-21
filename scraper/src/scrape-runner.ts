import { scrape } from './restaurants/scraper.js';
import { log } from './log.js';

scrape().catch(err => {
  log('FAIL', '*', 'fatal', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
