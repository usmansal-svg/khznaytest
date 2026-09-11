import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { stationOf } from "./station";

describe("station", () => {
  it("walks an online garment from tagging to the online shelf", () => {
    assert.equal(stationOf({ status: "tagged", channel: "online", online_status: "draft", photos: [] }), "Photography station");
    assert.equal(stationOf({ status: "tagged", channel: "online", online_status: "ready", photos: [{}, {}] }), "Packing station");
    assert.equal(stationOf({ status: "tagged", channel: "online", online_status: "listed", photos: [{}] }), "Online shelf");
    assert.equal(stationOf({ status: "sold", channel: "online", online_status: "unlisted", photos: [{}] }), "Sold");
  });
  it("walks an outlet garment from tagging to the outlet", () => {
    assert.equal(stationOf({ status: "tagged", channel: "outlet", online_status: null }), "Tagging station");
    assert.equal(stationOf({ status: "tagged", channel: "outlet", online_status: null, transfer: { status: "open", outlet: "Lahore 1" } }), "Being packed for Lahore 1");
    assert.equal(stationOf({ status: "tagged", channel: "outlet", online_status: null, transfer: { status: "sent", outlet: "Lahore 1" } }), "In transit to Lahore 1");
    assert.equal(stationOf({ status: "on_floor", channel: "outlet", online_status: null, outlet: "Lahore 1", transfer: { status: "received", outlet: "Lahore 1" } }), "At Lahore 1");
  });
  it("holds and exceptions come first", () => {
    assert.equal(stationOf({ status: "tagged", channel: "outlet", online_status: null, qc_hold: true }), "QC rail");
    assert.equal(stationOf({ status: "rejected", channel: "outlet", online_status: null }), "Rejected");
    assert.equal(stationOf({ status: "returned_damaged", channel: "outlet", online_status: null }), "Returned damaged");
  });
});
