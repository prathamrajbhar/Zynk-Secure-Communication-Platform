/**
 * Lightweight logger utility for Zynk
 * Suppresses debug/info logs in production builds.
 * Only errors and warnings are shown in production.
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  /** Debug info — suppressed in production */
  debug: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },

  /** Info-level — suppressed in production */
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },

  /** Warnings — always shown */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /** Errors — always shown */
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};

export default logger;
