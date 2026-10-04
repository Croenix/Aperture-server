const config = require('../config');

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  constructor() {
    this.minLevel = (process.env.LOG_LEVEL || 'DEBUG').toUpperCase();
  }

  _formatTime() {
    return new Date().toISOString();
  }

  _shouldLog(level) {
    const minVal = LOG_LEVELS[this.minLevel] ?? LOG_LEVELS.DEBUG;
    const currentVal = LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
    return currentVal >= minVal;
  }

  debug(message, meta = null) {
    if (!this._shouldLog('DEBUG')) return;
    const time = this._formatTime();
    if (meta !== null && meta !== undefined) {
      console.log(`\x1b[36m[DEBUG]\x1b[0m [${time}] ${message}`, typeof meta === 'object' ? JSON.stringify(meta, null, 2) : meta);
    } else {
      console.log(`\x1b[36m[DEBUG]\x1b[0m [${time}] ${message}`);
    }
  }

  info(message, meta = null) {
    if (!this._shouldLog('INFO')) return;
    const time = this._formatTime();
    if (meta !== null && meta !== undefined) {
      console.log(`\x1b[32m[INFO]\x1b[0m [${time}] ${message}`, typeof meta === 'object' ? JSON.stringify(meta, null, 2) : meta);
    } else {
      console.log(`\x1b[32m[INFO]\x1b[0m [${time}] ${message}`);
    }
  }

  warn(message, meta = null) {
    if (!this._shouldLog('WARN')) return;
    const time = this._formatTime();
    if (meta !== null && meta !== undefined) {
      console.warn(`\x1b[33m[WARN]\x1b[0m [${time}] ${message}`, typeof meta === 'object' ? JSON.stringify(meta, null, 2) : meta);
    } else {
      console.warn(`\x1b[33m[WARN]\x1b[0m [${time}] ${message}`);
    }
  }

  error(message, error = null) {
    if (!this._shouldLog('ERROR')) return;
    const time = this._formatTime();
    console.error(`\x1b[31m[ERROR]\x1b[0m [${time}] ${message}`);
    if (error) {
      if (error.stack) {
        console.error(`\x1b[31m[STACK]\x1b[0m ${error.stack}`);
      } else {
        console.error(`\x1b[31m[DETAILS]\x1b[0m`, error);
      }
    }
  }
}

module.exports = new Logger();
