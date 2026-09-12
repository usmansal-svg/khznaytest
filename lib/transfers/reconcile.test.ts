import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { reconcile } from "./reconcile";

describe("transfer reconciliation", () => {
  it("splits lines into received, missing and unexpected", () => {
    const r = reconcile([
      { sku: "A", received_at: "2026-01-01T09:00:00Z" },
      { sku: "B", received_at: null },
      { sku: "C", received_at: "2026-01-01T09:01:00Z", unexpected: true },
      { sku: "D", received_at: null },
    ]);
    assert.deepEqual(r, { received: ["A"], missing: ["B", "D"], unexpected: ["C"] });
  });
  it("an empty box reconciles to nothing", () => {
    assert.deepEqual(reconcile([]), { received: [], missing: [], unexpected: [] });
  });
});
