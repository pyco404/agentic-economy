import type { ApiErrorCode } from "@agentic-economy/shared";

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  idempotency_conflict: 409,
  not_eligible: 403,
  chain_verification_failed: 422,
  feature_disabled: 503,
  unavailable: 503,
  internal: 500,
  gone: 410,
  rate_limited: 429,
  not_token_launcher: 403,
  wallet_already_activated: 409,
  mint_already_activated: 409,
  activation_in_progress: 409,
  unsupported_lifecycle: 409,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}
