import type { OpenNebulaClient } from "./client";
import type { OpenNebulaVm } from "./types";

export async function listVms(_client: OpenNebulaClient): Promise<OpenNebulaVm[]> {
  void _client;
  throw new Error("OpenNebula VM management is not configured in local mode.");
}
