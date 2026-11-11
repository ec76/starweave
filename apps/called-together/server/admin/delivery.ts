import "server-only";
import { adminConfig } from "./config.ts";
import { authStage } from "./diagnostics.ts";
export interface EmailDelivery {
  sendCode(message: {
    email: string;
    code: string;
    purpose: "setup" | "reset";
  }): Promise<void>;
  accountCreated(message: { email: string }): Promise<void>;
}
async function send(email: string, subject: string, text: string) {
  return authStage("mailpit_delivery", "mailpit_send", async () => {
    adminConfig();
    const response = await fetch("http://127.0.0.1:8025/api/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        From: { Email: "accounts@example.invalid", Name: "Local preview" },
        To: [{ Email: email }],
        Subject: subject,
        Text: text,
      }),
    });
    if (!response.ok) throw new Error("Email delivery unavailable.");
  });
}
/** Local Mailpit only. No deployed transport and no credentials in links. */
export const developmentDelivery: EmailDelivery = {
  async sendCode({ email, code, purpose }) {
    await send(
      email,
      purpose === "setup" ? "Set up your account" : "Reset your password",
      "Your " +
        purpose +
        " code is " +
        code +
        ". It expires in five minutes and can be used once. If you did not request it, ignore this message.",
    );
  },
  async accountCreated({ email }) {
    await send(
      email,
      "Your Called Together account was created",
      "An administrator created your account. Request your own setup code at " +
        adminConfig().origin +
        "/admin/setup\nThis link contains no credential.",
    );
  },
};
