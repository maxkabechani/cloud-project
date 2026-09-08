import type { OpenNebulaClientOptions } from "./types";

/**
 * Boundary for the eventual OpenNebula XML-RPC/REST client. Keeping this
 * adapter behind the agent makes provider credentials impossible to reach
 * from the public web application.
 */
export class OpenNebulaClient {
  constructor(private readonly options: OpenNebulaClientOptions) {}

  get endpoint() { return this.options.endpoint; }

  async request(): Promise<never> {
    // TODO: confirm the university's OpenNebula version, endpoint protocol,
    // service-account permissions, and TLS requirements before implementing calls.
    throw new Error("OpenNebula provider adapter is not configured in local mode.");
  }
}
