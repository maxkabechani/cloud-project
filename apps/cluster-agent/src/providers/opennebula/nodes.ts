import type { OpenNebulaClient } from "./client";

export async function listNodes(_client: OpenNebulaClient): Promise<never> {
  void _client;
  throw new Error("OpenNebula node discovery is not configured in local mode.");
}
