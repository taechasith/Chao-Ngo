import { describe, expect, it } from "vitest";

import { playerActivityEventSchema, playerSessionStartSchema } from "./contracts";

const eventId = "de305d54-75b4-431b-adb2-eb6b9e546014";

describe("player activity contracts", () => {
  it("accepts a bounded session start", () => {
    expect(
      playerSessionStartSchema.safeParse({
        eventId,
        gameId: "game-node-zone",
        subgameId: "subgame-node-zone-quantum",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown fields and non-UUID event identifiers", () => {
    expect(
      playerSessionStartSchema.safeParse({
        eventId: "retry-me",
        gameId: "game-node-zone",
        subgameId: "subgame-node-zone-quantum",
      }).success,
    ).toBe(false);
    expect(
      playerActivityEventSchema.safeParse({
        eventId,
        eventType: "assistant_link_opened",
        payload: "unbounded client text",
      }).success,
    ).toBe(false);
  });

  it("requires the resource context for evidence and timeline events", () => {
    expect(
      playerActivityEventSchema.safeParse({
        eventId,
        eventType: "evidence_opened",
      }).success,
    ).toBe(false);
    expect(
      playerActivityEventSchema.safeParse({
        eventId,
        eventType: "timeline_node_opened",
        timelineNodeId: "timeline-node-zone-quantum",
      }).success,
    ).toBe(true);
  });
});
