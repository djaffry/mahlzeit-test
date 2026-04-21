import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import appConfigRaw from '../../data/config.json' with { type: 'json' };

export const SOURCE_LANGUAGE = 'de';
export const TARGET_LANGUAGES = ['en'];

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, '..', '..', 'data');

export function getDataDir(): string {
  return process.env.PECKISH_DATA_DIR ?? DEFAULT_DATA_DIR;
}

export function getGlobalsDir(): string {
  return process.env.PECKISH_GLOBALS_DIR ?? DEFAULT_DATA_DIR;
}

export interface AppConfig {
  timezone: string;
  archiveWeeks: number;
}

// Keep shape in sync with ui/app-config.ts (separate tsconfigs, can't share).
function validate(c: unknown): AppConfig {
  const { timezone, archiveWeeks } = c as Partial<AppConfig>;
  if (typeof timezone !== 'string' || !timezone) {
    throw new Error('data/config.json: .timezone must be a non-empty string');
  }
  if (typeof archiveWeeks !== 'number' || !Number.isInteger(archiveWeeks) || archiveWeeks < 0) {
    throw new Error('data/config.json: .archiveWeeks must be a non-negative integer');
  }
  return { timezone, archiveWeeks };
}

export const appConfig: AppConfig = validate(appConfigRaw);
