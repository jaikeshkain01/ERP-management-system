/**
 * HTTP response + error conventions shared by every route handler.
 *
 * Success envelope:  { "data": <payload>, "meta"?: {...} }
 * Error envelope:    { "error": { "code": string, "message": string, "hint"?: string, "details"?: unknown } }
 *
 * `hint` is an optional one-sentence remediation suggestion shown next to the
 * message in the UI ("Cancel the PO first, then cancel the PR"). Populate it
 * on guards where the user needs to know *how to unblock*.
 *
 * Handlers wrap their body in `handle(fn)`; any thrown `ApiError` (or Zod error) is
 * converted to the error envelope with the right status. Unexpected errors become a
 * 500 without leaking internals.
 */
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Common error constructors — use these instead of `new ApiError(...)` inline.
 * The optional `hint` becomes a second-line remediation suggestion in the UI.
 */
export const Errors = {
  badRequest: (message = "Bad request", details?: unknown, hint?: string) =>
    new ApiError(400, "bad_request", message, details, hint),
  unauthorized: (message = "Not authenticated") =>
    new ApiError(401, "unauthorized", message),
  forbidden: (permission?: string) =>
    new ApiError(
      403,
      "forbidden",
      permission ? `Missing permission: ${permission}` : "Forbidden",
      permission ? { permission } : undefined,
    ),
  notFound: (what = "Resource") => new ApiError(404, "not_found", `${what} not found`),
  conflict: (message = "Conflict", details?: unknown, hint?: string) =>
    new ApiError(409, "conflict", message, details, hint),
  unprocessable: (message = "Unprocessable", details?: unknown, hint?: string) =>
    new ApiError(422, "unprocessable", message, details, hint),
};

/** Success envelope. `init` lets a handler set status (e.g. 201) or headers. */
export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

/** 201 Created shorthand. */
export function created<T>(data: T): Response {
  return ok(data, { status: 201 });
}

function failure(err: ApiError): Response {
  return Response.json(
    { error: { code: err.code, message: err.message, hint: err.hint, details: err.details } },
    { status: err.status },
  );
}

/**
 * Run a handler body, translating known errors into the error envelope.
 * Zod validation errors → 422 with the flattened issues.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return failure(err);
    if (err instanceof ZodError) {
      return failure(
        new ApiError(422, "validation_error", "Request validation failed", err.flatten()),
      );
    }
    console.error("[api] unhandled error:", err);
    return failure(new ApiError(500, "internal_error", "Internal server error"));
  }
}

/** Parse + validate a JSON body with a Zod schema (throws ZodError → 422). */
export async function parseJson<T>(
  req: Request,
  schema: { parse: (v: unknown) => T },
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw Errors.badRequest("Request body must be valid JSON");
  }
  return schema.parse(raw);
}
