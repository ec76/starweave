import { describe, it, expect } from "vitest";
import { Pool } from "tarn";
import { AuthSqlConnection, authPoolOptions } from "./sql-connection.ts";
describe("SQL connection acquisition safety", () => {
  it("preserves the first creation failure instead of replacing it with a timeout", async () => {
    const failure = Object.assign(new Error("PRIVATE"), { code: "ESOCKET" });
    let attempts = 0;
    const pool = new Pool({
      ...authPoolOptions,
      create: async () => {
        attempts++;
        throw failure;
      },
      destroy: async () => {},
    });
    try {
      await expect(pool.acquire().promise).rejects.toBe(failure);
      expect(attempts).toBe(1);
    } finally {
      await pool.destroy();
    }
  });
  it("removes sensitive error event data before dependency listeners", () => {
    // Construction is lazy; do not call connect or create a network socket.
    const connection = new AuthSqlConnection({
      server: "localhost",
      options: { encrypt: true },
    });
    let received: unknown;
    connection.on("error", (error) => {
      received = error;
    });
    connection.emit(
      "error",
      Object.assign(new Error("PRIVATE"), {
        code: "PRIVATE",
        parameters: "PRIVATE",
      }),
    );
    expect(received).toBeInstanceOf(Error);
    expect((received as Error).stack).toBeUndefined();
    expect(String(received)).toBe("Error: SQL connection failed.");
    expect(JSON.stringify(received)).not.toContain("PRIVATE");
    connection.emit(
      "error",
      Object.assign(new Error("PRIVATE"), { code: "ESOCKET" }),
    );
    expect(received).toMatchObject({ code: "ESOCKET" });
  });
});
