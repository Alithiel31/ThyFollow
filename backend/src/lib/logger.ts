// src/lib/logger.ts
// Logger minimal et coloré, remplace les console.log/console.error bruts.
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

export const logger = {
  info: (message: string, data?: unknown) => {
    console.log(`${colors.blue}[INFO]${colors.reset} ${message}`, data ?? '');
  },
  success: (message: string, data?: unknown) => {
    console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`, data ?? '');
  },
  warn: (message: string, data?: unknown) => {
    console.warn(`${colors.yellow}[WARN]${colors.reset} ${message}`, data ?? '');
  },
  error: (message: string, error?: unknown) => {
    console.error(`${colors.red}[ERROR]${colors.reset} ${message}`, error ?? '');
  },
  debug: (message: string, data?: unknown) => {
    console.log(`${colors.gray}[DEBUG]${colors.reset} ${message}`, data ?? '');
  },
};
