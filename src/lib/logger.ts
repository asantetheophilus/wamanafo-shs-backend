// ============================================================
// Wamanafo SHS — Structured Logger
// Single logging interface for the entire application.
// Never use console.log directly — always use this module.
// ============================================================

type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  timestamp: string;       // ISO 8601 UTC
  level: LogLevel;
  action: string;          // dot-namespaced, e.g. "score.submitted"
  userId?: string;         // actor
  schoolId?: string;       // tenant scope
  resource?: string;       // e.g. "score:scr_abc123"
  result?: "success" | "failure";
  meta?: Record<string, unknown>; // never include passwords or PII
  error?: string;          // internal detail, never sent to client
}

// ============================================================
// Core logger implementation
// ============================================================

function formatEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === "development") {
    // Pretty-print for local dev
    const { level, action, result, userId, schoolId, error, meta } = entry;
    const prefix = `[${entry.timestamp}] ${level.toUpperCase()} ${action}`;
    const context = [
      userId    && `user=${userId}`,
      schoolId  && `school=${schoolId}`,
      result    && `result=${result}`,
    ]
      .filter(Boolean)
      .join(" ");
    const suffix = error ? ` | error=${error}` : "";
    const metaStr = meta && Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : "";
    return `${prefix} ${context}${suffix}${metaStr}`;
  }
  // Compact JSON for production log aggregators
  return JSON.stringify(entry);
}

function writeLog(entry: LogEntry): void {
  try {
    const line = formatEntry(entry);
    switch (entry.level) {
      case "error":
        console.error(line);
        break;
      case "warn":
        console.warn(line);
        break;
      default:
        console.info(line);
    }
  } catch {
    // Logger must never throw — silent fallback
    try {
      console.error("[logger] Failed to format log entry");
    } catch {
      // Absolute last resort — nothing we can do
    }
  }
}

function buildEntry(
  level: LogLevel,
  action: string,
  partial: Omit<LogEntry, "timestamp" | "level" | "action">
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    action,
    ...partial,
  };
}

// ============================================================
// Public API
// ============================================================

export const logger = {
  info(action: string, fields: Omit<LogEntry, "timestamp" | "level" | "action"> = {}): void {
    writeLog(buildEntry("info", action, fields));
  },

  warn(action: string, fields: Omit<LogEntry, "timestamp" | "level" | "action"> = {}): void {
    writeLog(buildEntry("warn", action, fields));
  },

  error(action: string, fields: Omit<LogEntry, "timestamp" | "level" | "action"> = {}): void {
    writeLog(buildEntry("error", action, fields));
  },

  debug(action: string, fields: Omit<LogEntry, "timestamp" | "level" | "action"> = {}): void {
    if (process.env.NODE_ENV !== "production") {
      writeLog(buildEntry("debug", action, fields));
    }
  },
};

// ============================================================
// Convenience helpers for common actions
// ============================================================

export const authLogger = {
  loginSuccess(userId: string, schoolId: string, ip?: string): void {
    logger.info("auth.login.success", {
      userId,
      schoolId,
      result: "success",
      meta: { ip },
    });
  },

  loginFailure(email: string, ip?: string, reason?: string): void {
    logger.warn("auth.login.failure", {
      result: "failure",
      meta: { email, ip, reason },
    });
  },

  logout(userId: string): void {
    logger.info("auth.logout", { userId, result: "success" });
  },
};

export const scoreLogger = {
  created(scoreId: string, context: { studentId: string; subjectId: string; termId: string; actorId: string; schoolId: string }): void {
    logger.info("score.created", {
      userId: context.actorId,
      schoolId: context.schoolId,
      resource: `score:${scoreId}`,
      result: "success",
      meta: { studentId: context.studentId, subjectId: context.subjectId, termId: context.termId },
    });
  },

  submitted(scoreId: string, context: { actorId: string; schoolId: string; subjectId: string; classId: string; termId: string }): void {
    logger.info("score.submitted", {
      userId: context.actorId,
      schoolId: context.schoolId,
      resource: `score:${scoreId}`,
      result: "success",
      meta: { subjectId: context.subjectId, classId: context.classId, termId: context.termId },
    });
  },

  approved(scoreId: string, context: { actorId: string; schoolId: string }): void {
    logger.info("score.approved", {
      userId: context.actorId,
      schoolId: context.schoolId,
      resource: `score:${scoreId}`,
      result: "success",
    });
  },

  amendmentRequested(scoreId: string, context: { actorId: string; schoolId: string; reason: string }): void {
    logger.info("score.amendment_requested", {
      userId: context.actorId,
      schoolId: context.schoolId,
      resource: `score:${scoreId}`,
      result: "success",
      meta: { reason: context.reason },
    });
  },

  amended(
    scoreId: string,
    context: { actorId: string; schoolId: string; before: Record<string, unknown>; after: Record<string, unknown> }
  ): void {
    logger.info("score.amended", {
      userId: context.actorId,
      schoolId: context.schoolId,
      resource: `score:${scoreId}`,
      result: "success",
      meta: { before: context.before, after: context.after },
    });
  },
};

export const reportCardLogger = {
  generated(studentId: string, termId: string, context: { actorId: string; schoolId: string }): void {
    logger.info("reportcard.generated", {
      userId: context.actorId,
      schoolId: context.schoolId,
      result: "success",
      meta: { studentId, termId },
    });
  },

  published(studentId: string, termId: string, context: { actorId: string; schoolId: string }): void {
    logger.info("reportcard.published", {
      userId: context.actorId,
      schoolId: context.schoolId,
      result: "success",
      meta: { studentId, termId },
    });
  },

  invalidated(studentId: string, termId: string, reason: string): void {
    logger.warn("reportcard.invalidated", {
      result: "success",
      meta: { studentId, termId, reason },
    });
  },
};

export const smsLogger = {
  sent(recipientId: string, eventType: string, schoolId: string): void {
    logger.info("sms.sent", {
      schoolId,
      result: "success",
      meta: { recipientId, eventType },
    });
  },

  failed(recipientId: string, eventType: string, schoolId: string, providerError?: string): void {
    logger.error("sms.failed", {
      schoolId,
      result: "failure",
      meta: { recipientId, eventType },
      error: providerError,
    });
  },
};
