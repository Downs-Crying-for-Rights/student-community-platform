import { AppClient } from "./app-client.js";
import { loadConfig } from "./config.js";
import { EventProcessor } from "./event-processor.js";
import { startHealthServer } from "./health.js";
import { logger } from "./logger.js";
import { OneBotWorker } from "./onebot-worker.js";

try {
  const config = loadConfig();
  const app = new AppClient(
    config.internalApiBaseUrl,
    config.internalApiToken,
    config.httpTimeoutMs,
    config.maxMessageBytes,
  );
const processor = new EventProcessor(
  app,
  config.expectedSelfId,
  config.allowedUserIds,
  config.maxMessageBytes,
);
  const worker = new OneBotWorker(config, processor, app);
  const health = startHealthServer(config.healthHost, config.healthPort, worker);

  const shutdown = () => {
    logger.info("shutdown_started");
    worker.stop();
    health.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  worker.start();
  logger.info("worker_started", { healthPort: config.healthPort });
} catch {
  logger.error("worker_start_failed");
  process.exitCode = 1;
}
