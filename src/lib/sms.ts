// ============================================================
// Wamanafo SHS — SMS Provider Abstraction
// Swap providers by changing SMS_PROVIDER env var.
// All SMS calls are fire-and-forget — failures never block
// primary user actions.
// ============================================================

import { smsLogger } from "./logger";

// ============================================================
// Provider interface
// ============================================================

export interface SmsPayload {
  to: string;        // recipient phone number (E.164 or local)
  message: string;
  senderId?: string;
}

export interface SmsResult {
  success: boolean;
  providerResponse?: unknown;
  error?: string;
}

export interface SmsProvider {
  send(payload: SmsPayload): Promise<SmsResult>;
}

// ============================================================
// Message templates (exact contract from Section 8)
// ============================================================

export function buildReportCardPublishedMessage(
  schoolName: string,
  studentName: string,
  termNumber: number
): string {
  return `${schoolName}: ${studentName}'s Term ${termNumber} report card is now available. Log in to view it.`;
}

export function buildAmendmentRequestedMessage(
  schoolName: string,
  subjectName: string,
  className: string,
  reason: string
): string {
  return `${schoolName}: Your scores for ${subjectName} - ${className} have been sent back for amendment. Reason: ${reason}.`;
}

export function buildAttendanceWarningMessage(
  schoolName: string,
  studentName: string,
  percentage: number
): string {
  return `${schoolName}: ${studentName}'s attendance has dropped to ${percentage.toFixed(1)}%. Please contact the school.`;
}

// ============================================================
// Arkesel provider
// ============================================================

class ArkeselProvider implements SmsProvider {
  private apiKey: string;
  private senderId: string;

  constructor(apiKey: string, senderId: string) {
    this.apiKey   = apiKey;
    this.senderId = senderId;
  }

  async send(payload: SmsPayload): Promise<SmsResult> {
    try {
      const body = {
        sender: payload.senderId ?? this.senderId,
        message: payload.message,
        recipients: [payload.to],
      };

      const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        return {
          success: false,
          providerResponse: data,
          error: `Arkesel returned HTTP ${response.status}`,
        };
      }

      return { success: true, providerResponse: data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ============================================================
// Hubtel provider
// ============================================================

class HubtelProvider implements SmsProvider {
  private clientId: string;
  private clientSecret: string;
  private senderId: string;

  constructor(clientId: string, clientSecret: string, senderId: string) {
    this.clientId     = clientId;
    this.clientSecret = clientSecret;
    this.senderId     = senderId;
  }

  async send(payload: SmsPayload): Promise<SmsResult> {
    try {
      const body = {
        From: payload.senderId ?? this.senderId,
        To:   payload.to,
        Content: payload.message,
        RegisteredDelivery: "true",
      };

      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

      const response = await fetch("https://smsc.hubtel.com/v1/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        return {
          success: false,
          providerResponse: data,
          error: `Hubtel returned HTTP ${response.status}`,
        };
      }

      return { success: true, providerResponse: data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ============================================================
// No-op stub (development / testing)
// ============================================================

class StubProvider implements SmsProvider {
  async send(payload: SmsPayload): Promise<SmsResult> {
    console.info(`[SMS STUB] To: ${payload.to}\nMessage: ${payload.message}`);
    return { success: true, providerResponse: { stub: true } };
  }
}

// ============================================================
// Factory — returns the configured provider
// ============================================================

function createSmsProvider(): SmsProvider {
  const provider = process.env.SMS_PROVIDER ?? "stub";
  const apiKey   = process.env.SMS_API_KEY ?? "";
  const senderId = process.env.SMS_SENDER_ID ?? "GhSHS";

  switch (provider) {
    case "arkesel":
      return new ArkeselProvider(apiKey, senderId);

    case "hubtel": {
      const clientId     = process.env.HUBTEL_CLIENT_ID ?? "";
      const clientSecret = process.env.HUBTEL_CLIENT_SECRET ?? "";
      return new HubtelProvider(clientId, clientSecret, senderId);
    }

    default:
      return new StubProvider();
  }
}

// Singleton — created once at module load
export const smsProvider: SmsProvider = createSmsProvider();

// ============================================================
// Public send function — fire-and-forget with retry
// ============================================================

const SMS_MAX_RETRIES       = 3;
const SMS_RETRY_BASE_DELAY  = 5_000; // ms

/**
 * Send an SMS with automatic retry and exponential back-off.
 * Never throws — failures are logged but do not propagate.
 *
 * Callers should NOT await this in user-facing request handlers.
 * Usage: void sendSms({ to, message }, { recipientId, eventType, schoolId })
 */
export async function sendSms(
  payload: SmsPayload,
  context: { recipientId: string; eventType: string; schoolId: string }
): Promise<void> {
  let attempt = 0;

  while (attempt < SMS_MAX_RETRIES) {
    attempt++;
    const result = await smsProvider.send(payload);

    if (result.success) {
      smsLogger.sent(context.recipientId, context.eventType, context.schoolId);
      return;
    }

    if (attempt < SMS_MAX_RETRIES) {
      const delay = SMS_RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } else {
      smsLogger.failed(context.recipientId, context.eventType, context.schoolId, result.error);
    }
  }
}
