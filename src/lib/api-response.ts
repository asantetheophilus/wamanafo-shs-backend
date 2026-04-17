// ============================================================
// Wamanafo SHS Backend — API Response Helpers (Express)
// ============================================================

export function ok<T>(data: T, message?: string) {
  return { success: true as const, data, ...(message ? { message } : {}) };
}

export function created<T>(data: T, message?: string) {
  return { success: true as const, data, ...(message ? { message } : {}) };
}

export function notFound(resource = "Resource") {
  return { success: false as const, error: `${resource} not found.`, code: "NOT_FOUND" };
}

export function forbidden(msg = "You do not have permission.") {
  return { success: false as const, error: msg, code: "FORBIDDEN" };
}

export function conflict(msg = "A record with this value already exists.") {
  return { success: false as const, error: msg, code: "CONFLICT" };
}

export function validationError(msg: string, fields?: Record<string, string>) {
  return { success: false as const, error: msg, code: "VALIDATION_ERROR", ...(fields ? { fields } : {}) };
}

export function prerequisiteFailed(details: string[]) {
  return { success: false as const, error: "Prerequisites not met.", code: "PREREQUISITE_FAILED", details };
}
