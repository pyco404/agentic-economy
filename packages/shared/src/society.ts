import { z } from 'zod';
import { AgentId, BuildingId, GridPos } from './primitives.js';

/** Social simulation never grants ownership, rewards or transaction permissions. */
export const SocialKind = z.enum(['conversation', 'friendship', 'disagreement', 'reconciliation', 'negotiation', 'celebration', 'performance', 'market', 'festival', 'construction']);
export type SocialKind = z.infer<typeof SocialKind>;
export const SocialPersonality = z.object({
  temperament: z.enum(['sociable', 'reflective', 'spirited', 'practical']),
  interest: z.enum(['music', 'gardening', 'craft', 'food', 'stories']),
  routine: z.enum(['morning market', 'afternoon stroll', 'evening square']),
}).meta({ id: 'SocialPersonality' });
export type SocialPersonality = z.infer<typeof SocialPersonality>;
export const SocialMoment = z.object({
  causedBy: z.string().max(80).nullable().optional(),
  id: z.string().max(80), tick: z.number().int().nonnegative(), kind: SocialKind,
  phase: z.enum(['invitation', 'encounter', 'consequence']),
  summary: z.string().max(320), participants: z.array(AgentId).max(8),
  buildingId: BuildingId.nullable(), location: GridPos,
  simulated: z.literal(true),
}).meta({ id: 'SocialMoment' });
export type SocialMoment = z.infer<typeof SocialMoment>;
export const SocialPresence = z.object({
  eventId: z.string().max(80), kind: SocialKind, description: z.string().max(160),
  speech: z.string().max(100), reaction: z.enum(['talk', 'wave', 'cheer', 'consider']),
  partnerIds: z.array(AgentId).max(7), untilTick: z.number().int().nonnegative(),
  location: GridPos,
}).meta({ id: 'SocialPresence' });
export type SocialPresence = z.infer<typeof SocialPresence>;
export const AgentSocial = z.object({
  tick: z.number().int().nonnegative(), personality: SocialPersonality,
  mood: z.enum(['content', 'curious', 'delighted', 'thoughtful']),
  socialNeed: z.number().int().min(0).max(100), current: SocialPresence.nullable(),
  destination: z.object({ buildingId: BuildingId, name: z.string().max(100), purpose: z.string().max(80), location: GridPos }).nullable(),
}).meta({ id: 'AgentSocial' });
export type AgentSocial = z.infer<typeof AgentSocial>;
export const SocialRelationship = z.object({
  agentId: AgentId, affinity: z.number().int().min(-100).max(100),
  encounters: z.number().int().nonnegative(), lastTick: z.number().int().nonnegative(),
}).meta({ id: 'SocialRelationship' });
export type SocialRelationship = z.infer<typeof SocialRelationship>;
