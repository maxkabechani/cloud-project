import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { fromNodeHeaders } from "better-auth/node";
import { registrationSchema, type CurrentUser } from "@hpc/shared";
import { AUTH_CLIENT_IP_HEADER, type Auth } from "./auth";
import type { Config } from "./config";
import type { CloudService } from "./cloud";

type UserDirectory = () => Promise<CurrentUser[]>;

export async function createApp(config: Config, auth: Pick<Auth, "handler" | "api">, cloud: CloudService, listUsers: UserDirectory) {
  const app = Fastify({ logger: config.NODE_ENV !== "test" ? { redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'] } : false, bodyLimit: 16 * 1024, requestTimeout: 15_000 });
  await app.register(helmet);
  await app.register(cors, { origin: config.WEB_URL, credentials: true, methods: ["GET", "POST", "DELETE", "OPTIONS"] });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.setErrorHandler((error, request, reply) => {
    const status = error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    request.log.error({ requestId: request.id, status }, "Request failed");
    return reply.code(status).send({ error: { code: status >= 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST", message: status >= 500 ? "The service is temporarily unavailable." : "The request could not be accepted." } });
  });
  const sessionUser = async (request: { headers: Record<string, string | string[] | undefined> }) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return null;
    const user = session.user;
    return { id: user.id, name: user.name, email: user.email, role: user.role as CurrentUser["role"], createdAt: new Date(user.createdAt).toISOString() } satisfies CurrentUser;
  };
  const requireUser = async (request: { headers: Record<string, string | string[] | undefined> }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    const user = await sessionUser(request);
    if (!user) { reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } }); return null; }
    return user;
  };

  app.get("/health", async () => ({ status: "ok" }));
  app.route({
    method: ["GET", "POST"], url: "/api/auth/*", config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    async handler(request, reply) {
      if (request.method === "POST" && request.headers.origin !== new URL(config.WEB_URL).origin) return reply.code(403).send({ code: "INVALID_ORIGIN", message: "This origin is not allowed." });
      if (request.url.split("?")[0] === "/api/auth/sign-up/email" && request.method === "POST") {
        const parsed = registrationSchema.safeParse(request.body);
        if (!parsed.success) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Enter a name, valid email, and a password of 12–128 characters." });
        request.body = parsed.data;
      }
      const authHeaders = fromNodeHeaders(request.headers);
      authHeaders.set(AUTH_CLIENT_IP_HEADER, request.ip);
      const response = await auth.handler(new Request(new URL(request.url, config.BETTER_AUTH_URL), { method: request.method, headers: authHeaders, ...(request.body ? { body: JSON.stringify(request.body) } : {}) }));
      reply.code(response.status);
      response.headers.forEach((value, key) => { if (key !== "set-cookie") reply.header(key, value); });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(await response.text());
    },
  });

  app.get("/api/me", async (request, reply) => { reply.header("Cache-Control", "private, no-store"); const user = await requireUser(request, reply); return user ? { user } : undefined; });
  app.get("/api/dashboard", async (request, reply) => { const user = await requireUser(request, reply); return user ? cloud.dashboard(user) : undefined; });
  app.get("/api/cloud/status", async (request, reply) => { const user = await requireUser(request, reply); return user ? cloud.status() : undefined; });
  app.get("/api/users", async (request, reply) => { const user = await requireUser(request, reply); if (!user) return; const users = await listUsers(); const accounts = await cloud.accountsList(user); const accountByUser = new Map(accounts.map(account => [account.userId, account.status])); return { users: users.map(member => ({ ...member, cloudAccountStatus: accountByUser.get(member.id) ?? "not_provisioned" })) }; });
  app.get("/api/vms", async (request, reply) => { const user = await requireUser(request, reply); return user ? { vms: await cloud.listVMs(user) } : undefined; });
  app.get("/api/vms/:id", async (request, reply) => { const user = await requireUser(request, reply); if (!user) return; try { return await cloud.getVM(user, (request.params as { id: string }).id); } catch (error) { if (error instanceof Error && error.message === "FORBIDDEN") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Virtual machine not found." } }); throw error; } });
  app.post("/api/vms", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    try { return reply.code(201).send(await cloud.createVM(user, request.body)); } catch (error) { if (error instanceof Error && ["VALIDATION_ERROR", "INVALID_NODE", "INSUFFICIENT_NODE_CAPACITY"].includes(error.message)) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: error.message === "INVALID_NODE" ? "Choose an online cluster node." : error.message === "INSUFFICIENT_NODE_CAPACITY" ? "The selected node does not have enough available capacity." : "Choose a valid VM name, image, CPU, memory, and disk size." } }); throw error; }
  });
  app.post("/api/vms/:id/:action", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const params = request.params as { id: string; action: string };
    if (!["start", "stop", "reboot"].includes(params.action)) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "VM action not found." } });
    try { return await cloud.actionVM(user, params.id, params.action as "start" | "stop" | "reboot"); } catch (error) { if (error instanceof Error && error.message === "FORBIDDEN") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "You can only manage your own VMs." } }); throw error; }
  });
  app.delete("/api/vms/:id", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    try { await cloud.deleteVM(user, (request.params as { id: string }).id); return reply.code(204).send(); } catch (error) { if (error instanceof Error && error.message === "FORBIDDEN") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "You can only manage your own VMs." } }); throw error; }
  });
  app.get("/api/nodes", async (request, reply) => { const user = await requireUser(request, reply); return user ? { nodes: await cloud.nodes() } : undefined; });
  app.get("/api/nodes/:id", async (request, reply) => { const user = await requireUser(request, reply); if (!user) return; try { return await cloud.node((request.params as { id: string }).id); } catch (error) { if (error instanceof Error && error.message === "NODE_NOT_FOUND") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Cluster node not found." } }); throw error; } });
  app.get("/api/cloud-accounts", async (request, reply) => { const user = await requireUser(request, reply); return user ? { accounts: await cloud.accountsList(user) } : undefined; });
  app.post("/api/cloud-accounts/provision", async (request, reply) => { const user = await requireUser(request, reply); if (!user) return; const body = (request.body ?? {}) as { userId?: string }; try { return await cloud.provision(user, body.userId); } catch (error) { if (error instanceof Error && error.message === "FORBIDDEN") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "You cannot provision another member's account." } }); throw error; } });
  app.get("/api/activity", async (request, reply) => { const user = await requireUser(request, reply); return user ? { activity: cloud.activityList(user) } : undefined; });
  app.get("/api/mpi/programs", async (request, reply) => { const user = await requireUser(request, reply); return user ? { programs: await cloud.programs() } : undefined; });
  app.get("/api/jobs", async (request, reply) => { const user = await requireUser(request, reply); return user ? { jobs: await cloud.jobsList(user) } : undefined; });
  app.get("/api/jobs/:id", async (request, reply) => { const user = await requireUser(request, reply); if (!user) return; try { return await cloud.getJob(user, (request.params as { id: string }).id); } catch (error) { if (error instanceof Error && error.message === "FORBIDDEN") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "MPI job not found." } }); throw error; } });
  app.post("/api/jobs", async (request, reply) => { const user = await requireUser(request, reply); if (!user) return; try { return reply.code(201).send(await cloud.createJob(user, request.body)); } catch (error) { if (error instanceof Error && ["VALIDATION_ERROR", "NO_MPI_NODES", "INSUFFICIENT_MPI_NODES", "INVALID_MPI_PROGRAM"].includes(error.message)) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Choose a predefined program, valid process count, and available nodes." } }); throw error; } });
  app.post("/api/jobs/:id/cancel", async (request, reply) => { const user = await requireUser(request, reply); if (!user) return; try { await cloud.cancelJob(user, (request.params as { id: string }).id); return reply.code(204).send(); } catch (error) { if (error instanceof Error && error.message === "FORBIDDEN") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "MPI job not found." } }); throw error; } });
  app.get("/api/benchmarks", async (request, reply) => { const user = await requireUser(request, reply); return user ? { benchmarks: await cloud.listBenchmarks(user) } : undefined; });
  app.get("/api/benchmarks/:id", async (request, reply) => { const user = await requireUser(request, reply); if (!user) return; try { return await cloud.getBenchmark(user, (request.params as { id: string }).id); } catch (error) { if (error instanceof Error && error.message === "FORBIDDEN") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Benchmark not found." } }); throw error; } });
  app.post("/api/benchmarks", async (request, reply) => { const user = await requireUser(request, reply); if (!user) return; try { return reply.code(201).send(await cloud.createBenchmark(user, request.body)); } catch (error) { if (error instanceof Error && ["VALIDATION_ERROR", "NO_MPI_NODES", "INSUFFICIENT_MPI_NODES"].includes(error.message)) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Choose a predefined program and supported process counts." } }); throw error; } });
  app.get("/api/notifications", async (request, reply) => { const user = await requireUser(request, reply); return user ? { notifications: cloud.notifications(user) } : undefined; });
  app.post("/api/notifications/:id/read", async (request, reply) => { const user = await requireUser(request, reply); if (!user) return; try { return await cloud.markNotificationRead(user, (request.params as { id: string }).id); } catch (error) { if (error instanceof Error && error.message === "FORBIDDEN") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Notification not found." } }); throw error; } });
  return app;
}
