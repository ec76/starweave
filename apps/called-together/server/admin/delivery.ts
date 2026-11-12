import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { deliveryAddress, emailConfig } from "./email-config.ts";
import { adminConfig } from "./config.ts";
import { authStage } from "./diagnostics.ts";
export interface EmailDelivery {
  sendCode(message: {
    email: string;
    code: string;
    purpose: "setup" | "reset";
  }): Promise<void>;
  accountCreated(message: {
    email: string;
    notificationId?: string;
  }): Promise<void>;
}
/** Fixed error text only: do not retain raw provider exceptions as causes. */
export class EmailDeliveryError extends Error {
  constructor() {
    super("Email delivery unavailable.");
    this.name = "EmailDeliveryError";
  }
}
async function send(
  email: string,
  subject: string,
  text: string,
  notificationId?: string,
) {
  adminConfig();
  const config = emailConfig();
  const recipient = deliveryAddress(email);
  if (
    config.provider === "resend" &&
    config.allowlist &&
    !config.allowlist.includes(recipient)
  )
    throw new EmailDeliveryError();
  return authStage(
    config.provider === "resend" ? "email_delivery" : "mailpit_delivery",
    config.provider === "resend" ? "resend_send" : "mailpit_send",
    async () => {
      try {
        // No automatic retries: a timeout can occur after provider acceptance.
        const response = await fetch(
          config.provider === "resend"
            ? "https://api.resend.com/emails"
            : "http://127.0.0.1:8025/api/v1/send",
          {
            method: "POST",
            headers:
              config.provider === "resend"
                ? {
                    "content-type": "application/json",
                    authorization: "Bearer " + config.apiKey,
                    "Idempotency-Key": notificationId
                      ? "ct-notice-v1/" +
                        createHash("sha256")
                          .update(notificationId)
                          .digest("hex")
                      : "ct-message/" + randomUUID(),
                  }
                : { "content-type": "application/json" },
            redirect: "error",
            signal: AbortSignal.timeout(5000),
            body: JSON.stringify(
              config.provider === "resend"
                ? {
                    from: config.name + " <" + config.address + ">",
                    to: [recipient],
                    subject,
                    text,
                  }
                : {
                    From: {
                      Email: "accounts@example.invalid",
                      Name: "Local preview",
                    },
                    To: [{ Email: recipient }],
                    Subject: subject,
                    Text: text,
                  },
            ),
          },
        );
        // Do not parse/log provider response bodies, headers or identifiers.
        await response.body?.cancel();
        if (!response.ok) throw new EmailDeliveryError();
      } catch {
        throw new EmailDeliveryError();
      }
    },
  );
}
/** Provider selected at request time; all templates remain shared. */
export const configuredDelivery: EmailDelivery = {
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
  async accountCreated({ email, notificationId }) {
    await send(
      email,
      "Your Called Together account was created",
      "An administrator created your account. Request your own setup code at " +
        adminConfig().origin +
        "/admin/setup\nThis link contains no credential.",
      notificationId,
    );
  },
};
