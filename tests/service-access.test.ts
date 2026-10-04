import { describe, expect, it } from "vitest";
import { localDevelopmentServiceUrl } from "../src/providers/service-access";

describe("no-key static service boundary", () => {
  it("ignores configured local, remote, and malformed service URLs in every production build", () => {
    for (const hostname of [
      "mchenry-power-dev.github.io",
      "localhost",
      "127.0.0.1",
    ])
      for (const url of [
        "http://127.0.0.1:4318",
        "https://service.example",
        "invalid URL",
      ])
        expect(
          localDevelopmentServiceUrl(url, false, hostname),
        ).toBeUndefined();
  });

  it("does not enable a service from a public origin even in development", () => {
    for (const hostname of [
      "mchenry-power-dev.github.io",
      "localhost.example.com",
      "192.168.1.10",
    ])
      expect(
        localDevelopmentServiceUrl("http://127.0.0.1:4318", true, hostname),
      ).toBeUndefined();
  });

  it("preserves the explicitly configured local development workflow and makes no implicit selection", () => {
    for (const hostname of ["localhost", "127.0.0.1"]) {
      expect(
        localDevelopmentServiceUrl(undefined, true, hostname),
      ).toBeUndefined();
      expect(localDevelopmentServiceUrl("  ", true, hostname)).toBeUndefined();
      expect(
        localDevelopmentServiceUrl(" http://127.0.0.1:4318 ", true, hostname),
      ).toBe("http://127.0.0.1:4318");
    }
  });
});
