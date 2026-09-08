import Fastify, { type FastifyInstance } from "fastify";
import { vmCreateSchema } from "@hpc/shared";
import { hasAgentKey } from "./auth";
import type { AgentConfig } from "./config";
import { MockAgentProvider, type AgentProvider } from "./provider";

export function createAgentApp(config: Pick<AgentConfig, "CLUSTER_AGENT_API_KEY"> = { CLUSTER_AGENT_API_KEY: "local-agent-key-please-change-32chars" }, provider: AgentProvider = new MockAgentProvider()): FastifyInstance {
  const app = Fastify({ logger: { redact: ["req.headers.authorization"] }, requestTimeout: 15_000, bodyLimit: 16 * 1024 });
  app.get("/health", async () => ({ status: "ok", service: "cluster-agent" }));
  app.addHook("preHandler", async (request, reply) => { if (request.url === "/health") return; if (!hasAgentKey(request, config.CLUSTER_AGENT_API_KEY)) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "A valid cluster-agent API key is required." } }); });
  app.get("/cluster/status", async () => provider.status());
  app.get("/cluster/nodes", async () => ({ nodes: provider.nodes() }));
  app.get("/cloud/users", async () => ({ users: provider.users() }));
  app.post<{ Body: unknown }>("/cloud/users", async (request, reply) => { const body = request.body as Record<string, unknown>; const username = typeof body.username === "string" ? body.username.trim() : ""; const name = typeof body.name === "string" ? body.name.trim() : ""; if (!/^[a-z][a-z0-9-]{2,31}$/.test(username) || name.length < 2 || name.length > 100) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "A valid provider username and display name are required." } }); return reply.code(201).send(provider.createUser({ username, name })); });
  app.get("/cloud/vms", async () => ({ vms: provider.vms() }));
  app.get<{ Params: { id: string } }>("/cloud/vms/:id", async (request, reply) => { const vm = provider.vm(request.params.id); return vm ? vm : reply.code(404).send({ error: { code: "NOT_FOUND", message: "Virtual machine not found." } }); });
  app.post<{ Body: unknown }>("/cloud/vms", async (request, reply) => { const parsed = vmCreateSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } }); const payload = request.body as Record<string, unknown>; const body = parsed.data; return reply.code(201).send(provider.createVm({ ...body, ownerId: typeof payload.ownerId === "string" ? payload.ownerId : "agent", ownerName: typeof payload.ownerName === "string" ? payload.ownerName : "Cluster API" })); });
  for (const action of ["start", "stop", "reboot"] as const) app.post<{ Params: { id: string } }>(`/cloud/vms/:id/${action}`, async (request, reply) => { const vm = provider.vmAction(request.params.id, action); return vm ? vm : reply.code(404).send({ error: { code: "NOT_FOUND", message: "Virtual machine not found." } }); });
  app.delete<{ Params: { id: string } }>("/cloud/vms/:id", async (request, reply) => provider.deleteVm(request.params.id) ? reply.code(204).send() : reply.code(404).send({ error: { code: "NOT_FOUND", message: "Virtual machine not found." } }));
  app.get("/mpi/programs", async () => ({ programs: provider.programs() }));
  app.get("/mpi/jobs", async () => ({ jobs: provider.jobs() }));
  app.get<{ Params: { id: string } }>("/mpi/jobs/:id", async (request, reply) => { const job = provider.job(request.params.id); return job ? job : reply.code(404).send({ error: { code: "NOT_FOUND", message: "MPI job not found." } }); });
  app.post<{ Body: unknown }>("/mpi/jobs", async (request, reply) => { const body = request.body as Record<string, unknown>; const name = typeof body.name === "string" ? body.name.trim() : ""; const program = body.program; const processCount = body.processCount; if (name.length < 2 || !["matrix-multiply", "calculate-pi", "vector-addition"].includes(String(program)) || typeof processCount !== "number" || !Number.isInteger(processCount) || processCount < 1 || processCount > 64 || (body.command !== undefined) || (body.executablePath !== undefined) || (body.rawArguments !== undefined)) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "A valid job name, approved program, and process count are required." } }); return reply.code(201).send(provider.createJob({ name, program: program as Parameters<AgentProvider["createJob"]>[0]["program"], processCount, userId: "agent", userName: "Cluster API" })); });
  app.post<{ Params: { id: string } }>("/mpi/jobs/:id/cancel", async (request, reply) => provider.cancelJob(request.params.id) ? reply.code(204).send() : reply.code(404).send({ error: { code: "NOT_FOUND", message: "MPI job not found." } }));
  return app;
}
