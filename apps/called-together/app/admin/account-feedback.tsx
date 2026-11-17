"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Link } from "@mui/material";

export function InvitationNotice({ outcome }: { outcome: string | null }) {
  if (outcome === "invitation_pending")
    return (
      <Alert severity="warning" role="alert">
        Account created, but invitation delivery could not be confirmed. Do not
        create another account. Share the{" "}
        <Link href="/admin/setup">account setup page</Link> with the recipient
        so they can request their own setup code. Contact the site operator if
        email does not arrive.
      </Alert>
    );
  if (outcome === "invited")
    return (
      <Alert severity="success" role="status">
        Account created. The email service accepted the invitation; inbox
        delivery is not guaranteed. The recipient can use the{" "}
        <Link href="/admin/setup">account setup page</Link> to request a code
        and choose their password.
      </Alert>
    );
  return null;
}

function FeedbackFromQuery() {
  const params = useSearchParams();
  const outcomes = params.getAll("accountResult");
  return (
    <InvitationNotice outcome={outcomes.length === 1 ? outcomes[0]! : null} />
  );
}

export function AccountOperationFeedback() {
  return (
    <Suspense fallback={null}>
      <FeedbackFromQuery />
    </Suspense>
  );
}
