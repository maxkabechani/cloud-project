import type { OpenNebulaClientOptions } from "./types";

export class OpenNebulaClient {
  constructor(private readonly options: OpenNebulaClientOptions) {}

  get endpoint() { return this.options.endpoint; }

  async call(method: string, args: string[] = []): Promise<string> {
    const body = `<?xml version="1.0"?><methodCall><methodName>${escapeXml(method)}</methodName><params>${args.map((arg) => `<param><value><string>${escapeXml(arg)}</string></value></param>`).join("")}</params></methodCall>`;
    const response = await fetch(this.options.endpoint, { method: "POST", headers: { "content-type": "text/xml" }, body, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`OPENNEBULA_HTTP_${response.status}`);
    const xml = await response.text();
    const fault = xml.match(/<fault>[\s\S]*?<string>([\s\S]*?)<\/string>[\s\S]*?<\/fault>/i)?.[1];
    if (fault) throw new Error(`OPENNEBULA_${decodeXml(fault)}`);
    const value = xml.match(/<value>\s*<(?:string|int|i4|double|boolean)>([\s\S]*?)<\/(?:string|int|i4|double|boolean)>\s*<\/value>/i)?.[1];
    if (value === undefined) throw new Error("OPENNEBULA_INVALID_RESPONSE");
    return decodeXml(value);
  }
}

function escapeXml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
export function decodeXml(value: string) { return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&"); }
