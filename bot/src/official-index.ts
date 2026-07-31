import { startHealthServer } from "./health.js";
import { logger } from "./logger.js";
import { OfficialAppClient } from "./official-app-client.js";
import { loadOfficialConfig } from "./official-config.js";
import { OfficialGatewayWorker } from "./official-worker.js";

try {
  const config = loadOfficialConfig();
  const worker = new OfficialGatewayWorker(config, new OfficialAppClient(config));
  const health = startHealthServer(config.healthHost, config.healthPort, worker);
  const shutdown = () => {
    logger.info("qq_official_shutdown_started");
    worker.stop();
    health.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  worker.start();
  logger.info("qq_official_worker_started", { healthPort: config.healthPort });
} catch {
  logger.error("qq_official_worker_start_failed");
  process.exitCode = 1;
}
