import type { OpenNebulaClient } from "./client";
import type { OpenNebulaUser } from "./types";

export async function createUser(_client: OpenNebulaClient, _username: string, _name: string): Promise<OpenNebulaUser> {
  void _client;
  void _username;
  void _name;
  throw new Error("OpenNebula user provisioning is not configured in local mode.");
}
