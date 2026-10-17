import { createHash, randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { ZodError, type z } from "zod";
import { routes, type ApiError, type RouteDef, type RouteName } from "@agentic-economy/shared";
import type { AppContext } from "../context.js";
import { AppError } from "../util/errors.js";
import { registerHandlers } from "./handlers.js";
import { registerWebSocket } from "../ws/gateway.js";
import { registerLaunchpad } from "./launchpad.js";
import { health, metrics, readiness } from "./system.js";

export interface HandlerCtx<N extends RouteName> {
  params: (typeof routes)[N] extends { params: infer P extends z.ZodType } ? z.infer<P> : Record<string, never>;
  query: (typeof routes)[N] extends { query: infer Q extends z.ZodType } ? z.infer<Q> : Record<string, never>;
  body: (typeof routes)[N] extends { body: infer B extends z.ZodType } ? z.infer<B> : undefined;
  /** Authenticated wallet (present on auth routes). */
  wallet: string;
  /** Idempotency-Key header, when supplied (used as a dedupe key for durable commands). */
  idempotencyKey: string | null;
  sessionExpiresAt: string;
  req: FastifyRequest;
}

export type Handler<N extends RouteName> = (ctx: HandlerCtx<N>) => Promise<z.input<(typeof routes)[N]["response"]>>;

/** Fixed-window limiter for auth and agent mutations. Launch routes are deliberately NOT rate limited (spec §2.3). */
class WindowLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.reset < now) {
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      if (this.hits.size > 50_000) this.hits.clear();
      return true;
    }
    h.n += 1;
    return h.n <= this.max;
  }
}

const LIMITED: ReadonlySet<RouteName> = new Set<RouteName>(["authChallenge", "authVerify", "createAgent", "patchAgent"]);

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: ctx.config.logLevel === "silent" ? false : { level: ctx.config.logLevel },
    genReqId: () => randomUUID(),
    bodyLimit: 64 * 1024,
    trustProxy: true,
  });
  await app.register(cors, { origin: ctx.config.corsOrigins, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"] });
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

  const limiter = new WindowLimiter(30, 60_000);
  const validateResponses = ctx.config.mode !== "production";
  const counters = { requests: 0, errors: 0 };

  app.setErrorHandler((err, req, reply) => {
    counters.errors += 1;
    const body = (code: ApiError["error"]["code"], message: string, details?: unknown): ApiError => ({ error: { code, message, ...(details === undefined ? {} : { details }) }, requestId: String(req.id) });
    if (err instanceof AppError) return reply.status(err.status).send(body(err.code, err.message, err.details));
    if (err instanceof ZodError) return reply.status(400).send(body("bad_request", "request validation failed", err.issues));
    const fe = err as { statusCode?: number; message?: string };
    if (fe.statusCode && fe.statusCode < 500) return reply.status(fe.statusCode).send(body("bad_request", fe.message ?? "bad request"));
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send(body("internal", "internal error"));
  });
  app.setNotFoundHandler((req, reply) => reply.status(404).send({ error: { code: "not_found", message: `no route ${req.method} ${req.url}` }, requestId: String(req.id) } satisfies ApiError));
  app.addHook("onRequest", async () => {
    counters.requests += 1;
  });

  const servesApi = ctx.config.role === "api" || ctx.config.role === "all";
  const SYSTEM: ReadonlySet<RouteName> = new Set<RouteName>(["health", "readiness"]);

  function register<N extends RouteName>(name: N, handler: Handler<N>) {
    const def: RouteDef = routes[name];
    if (def.demoOnly && ctx.config.mode !== "demo") return;
    if (!servesApi && !SYSTEM.has(name)) return; // sim/indexer processes expose only health endpoints
    app.route({
      method: def.method.toUpperCase() as "GET" | "POST" | "PATCH",
      url: def.path,
      handler: async (req: FastifyRequest, reply: FastifyReply) => {
        if (LIMITED.has(name) && !limiter.allow(`${name}|${req.ip}`)) throw new AppError("forbidden", "too many requests; slow down");
        // Authenticate before validating input so unauthenticated callers learn nothing about request shapes.
        let wallet = "";
        let sessionExpiresAt = "";
        if (def.auth) ({ wallet, sessionExpiresAt } = await ctx.auth.authenticate(req.headers.authorization));
        const params = def.params ? def.params.parse(req.params) : {};
        const query = def.query ? def.query.parse(req.query) : {};
        const body = def.body ? def.body.parse(req.body ?? {}) : undefined;

        const idemKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : undefined;
        if (def.idempotencyKey === "required" && !idemKey) throw new AppError("bad_request", "Idempotency-Key header is required for this operation");
        if (idemKey && !/^[A-Za-z0-9_.:-]{8,128}$/.test(idemKey)) throw new AppError("bad_request", "Idempotency-Key must be 8-128 chars [A-Za-z0-9_.:-]");
        const requestHash = createHash("sha256").update(JSON.stringify({ params, body })).digest("hex");
        if (idemKey) {
          const prev = await ctx.store.getIdempotent(idemKey, wallet, def.operationId);
          if (prev) {
            if (prev.requestHash !== requestHash) throw new AppError("idempotency_conflict", "Idempotency-Key reused with a different request");
            reply.header("Idempotent-Replayed", "true");
            return reply.status(prev.status).send(prev.body);
          }
        }

        const result = await handler({ params, query, body, wallet, sessionExpiresAt, idempotencyKey: idemKey ?? null, req } as HandlerCtx<N>);
        let out: unknown = result;
        if (name === "readiness" && !(result as { ready: boolean }).ready) return reply.status(503).send(result);
        if (validateResponses) {
          const parsed = def.response.safeParse(result);
          if (!parsed.success) {
            req.log.error({ issues: parsed.error.issues, route: name }, "response violates published contract");
            throw new AppError("internal", "response violates published contract", parsed.error.issues);
          }
          out = parsed.data;
        }
        const status = def.successStatus ?? 200;
        if (idemKey) await ctx.store.saveIdempotent(idemKey, wallet, def.operationId, { requestHash, status, body: out });
        return reply.status(status).send(out);
      },
    });
  }

  register("health", () => health(ctx));
  register("readiness", () => readiness(ctx));
  registerHandlers(ctx, register);
  if (servesApi) { await registerLaunchpad(app,ctx); registerWebSocket(app, ctx); }

  app.get("/metrics", async (_req, reply) => reply.type("text/plain; version=0.0.4").send(metrics(ctx, counters)));

  return app;
}
