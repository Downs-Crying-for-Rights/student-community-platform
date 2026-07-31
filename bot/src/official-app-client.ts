import type { OfficialConfig } from "./official-config.js";
import type { GatewayPayload } from "./official-protocol.js";

export class OfficialAppClient {
  private readonly eventsUrl: URL;

  constructor(private readonly config: OfficialConfig) {
    this.eventsUrl = new URL("v1/internal/qq-official/events", config.internalApiBaseUrl);
  }

  async forwardEvent(payload: GatewayPayload): Promise<void> {
    const body = JSON.stringify(payload);
    if (Buffer.byteLength(body, "utf8") > this.config.maxMessageBytes) {
      throw new Error("QQ official event exceeds MAX_MESSAGE_BYTES");
    }
    const response = await fetch(this.eventsUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.internalApiToken}`,
        "content-type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(this.config.httpTimeoutMs),
    });
    if (!response.ok && response.status !== 409) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Internal event API returned ${response.status}`);
    }
    await response.body?.cancel().catch(() => undefined);
  }
}
