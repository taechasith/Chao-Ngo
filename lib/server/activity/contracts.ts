import { z } from "zod";

const entityId = z.string().trim().min(1).max(128).regex(/^[a-z][a-z0-9-]*$/);
const eventId = z.string().uuid();

export const playerSessionStartSchema = z
  .object({
    eventId,
    gameId: entityId,
    subgameId: entityId,
  })
  .strict();

export const playerActivityEventSchema = z.discriminatedUnion("eventType", [
  z
    .object({
      eventId,
      eventType: z.literal("timeline_node_opened"),
      timelineNodeId: entityId,
    })
    .strict(),
  z
    .object({
      assetId: entityId,
      eventId,
      eventType: z.literal("evidence_opened"),
    })
    .strict(),
  z
    .object({
      eventId,
      eventType: z.literal("assistant_link_opened"),
    })
    .strict(),
]);

export type PlayerActivityEventInput = z.infer<typeof playerActivityEventSchema>;
export type PlayerSessionStartInput = z.infer<typeof playerSessionStartSchema>;

export const playerInitiatedEventLimitPerMinute = 60;
