import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

export function hasAgentKey(request: FastifyRequest, expected: string): boolean {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7));
  const target = Buffer.from(expected);
  return received.length === target.length && timingSafeEqual(received, target);
}
