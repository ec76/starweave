import * as Tedious from "tedious";
import { EventEmitter } from "node:events";

// Tarn otherwise retries create failures and discards their structured cause
// when constructing its final timeout. Preserve the first driver error instead.
export const authPoolOptions = {
  min: 0,
  max: 3,
  acquireTimeoutMillis: 20000,
  propagateCreateError: true,
};

/** Kysely 0.29.8 prints connection error events directly. Never hand it raw data. */
export class AuthSqlConnection extends Tedious.Connection {
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (event === "error") {
      // Connect callbacks still receive the original error for structured diagnostics;
      // connection error events may be printed by dependencies, so contain no payload.
      const safe = new Error("SQL connection failed.");
      safe.stack = undefined;
      const original = args[0];
      const descriptor =
        original && typeof original === "object"
          ? Object.getOwnPropertyDescriptor(original, "code")
          : undefined;
      const code =
        descriptor && "value" in descriptor ? descriptor.value : undefined;
      // Kysely uses ESOCKET to mark a connection unusable; retain that behavior.
      if (
        typeof code === "string" &&
        ["ESOCKET", "ECONNRESET", "ELOGIN", "ETIMEOUT"].includes(code)
      )
        Object.assign(safe, { code });
      return super.emit(event, safe);
    }
    return EventEmitter.prototype.emit.call(this, event, ...args);
  }
}
