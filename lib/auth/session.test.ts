import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { hashPin, verifyPin } from "./pin";
import { signSession, verifySession } from "./session";

describe("PIN hashing", () => {
  it("verifies the right PIN and rejects the wrong one", () => {
    const h = hashPin("4821");
    assert.ok(h.startsWith("scrypt$"));
    assert.equal(verifyPin("4821", h), true);
    assert.equal(verifyPin("4822", h), false);
    assert.equal(verifyPin("4821", null), false);
  });

  it("salts, so equal PINs hash differently", () => {
    assert.notEqual(hashPin("1234"), hashPin("1234"));
  });

  it("only accepts 4–6 digit PINs", () => {
    assert.throws(() => hashPin("12"));
    assert.throws(() => hashPin("abcd"));
    assert.equal(verifyPin("12", hashPin("1234")), false);
  });
});

describe("signed session", () => {
  const secret = "test-secret";
  const who = { id: 7, name: "Ayesha", role: "tagger" as const, outlet_id: 2 };

  it("round-trips", async () => {
    const token = await signSession(who, secret);
    const s = await verifySession(token, secret);
    assert.equal(s?.id, 7);
    assert.equal(s?.name, "Ayesha");
    assert.equal(s?.role, "tagger");
    assert.ok(s!.exp > Date.now() / 1000);
  });

  it("rejects tampering, a wrong secret, and expiry", async () => {
    const token = await signSession(who, secret);
    assert.equal(await verifySession(token.slice(0, -2) + "xx", secret), null);
    assert.equal(await verifySession(token, "other"), null);
    const [body] = token.split(".");
    const forged = Buffer.from(body, "base64url").toString().replace('"role":"tagger"', '"role":"founder"');
    const forgedToken = Buffer.from(forged).toString("base64url") + "." + token.split(".")[1];
    assert.equal(await verifySession(forgedToken, secret), null);
    assert.equal(await verifySession(await signSession(who, secret, -1), secret), null);
    assert.equal(await verifySession(undefined, secret), null);
  });
});
