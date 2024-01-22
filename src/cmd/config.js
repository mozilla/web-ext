import { createLogger } from '../util/logger.js';

const log = createLogger(import.meta.url);

export default async function config(configData) {
  log.info(`Config data:\n\n${JSON.stringify(configData, null, 2)}`);
}
