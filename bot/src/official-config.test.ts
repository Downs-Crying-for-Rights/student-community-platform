import { describe, expect, it } from "vitest";
import { loadOfficialConfig } from "./official-config.js";

const required = {
  QQ_OFFICIAL_BOT_APP_ID: "102012345",
  QQ_OFFICIAL_BOT_CLIENT_SECRET: "client-secret",
  INTERNAL_API_BASE_URL: "http://web:3000",
  INTERNAL_API_TOKEN: "internal-secret",
};

describe("loadOfficialConfig", () => {
  it("uses the official endpoints and isolated health port by default", () => {
    const config = loadOfficialConfig(required);
    expect(config.tokenUrl).toBe("https://bots.qq.com/app/getAppAccessToken");
    expect(config.apiBaseUrl).toBe("https://api.sgroup.qq.com/");
    expect(config.healthPort).toBe(8_082);
  });

  it("allows test endpoints and an explicit official health listener", () => {
    const config = loadOfficialConfig({
      ...required,
      QQ_OFFICIAL_TOKEN_URL: "http://127.0.0.1:4100/token",
      QQ_OFFICIAL_API_BASE_URL: "http://127.0.0.1:4100/api/",
      OFFICIAL_HEALTH_HOST: "127.0.0.1",
      HEALTH_PORT: "9091",
      OFFICIAL_HEALTH_PORT: "9092",
    });
    expect(config.tokenUrl).toBe("http://127.0.0.1:4100/token");
    expect(config.apiBaseUrl).toBe("http://127.0.0.1:4100/api/");
    expect(config.healthHost).toBe("127.0.0.1");
    expect(config.healthPort).toBe(9_092);
  });

  it("supports the shared health port when no official override is set", () => {
    expect(loadOfficialConfig({ ...required, HEALTH_PORT: "9091" }).healthPort).toBe(9_091);
  });

  it("rejects missing credentials and invalid URLs", () => {
    expect(() => loadOfficialConfig({ ...required, QQ_OFFICIAL_BOT_CLIENT_SECRET: "" }))
      .toThrow("QQ_OFFICIAL_BOT_CLIENT_SECRET");
    expect(() => loadOfficialConfig({ ...required, INTERNAL_API_BASE_URL: "ftp://web" }))
      .toThrow("unsupported protocol");
  });
});
