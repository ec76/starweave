"use client";
import { useState } from "react";
import {
  Alert,
  Button,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ProfileContent, ProfileHistory } from "../../../domain/profiles";
import { useCsrf } from "../auth-controls";
import { ActivityTime } from "../activity-time";

export function ProfileEditor({ profile }: { profile: ProfileHistory | null }) {
  const latest = profile?.revisions[0];
  const initial: ProfileContent = {
    displayName: latest?.displayName ?? "",
    biography: latest?.biography ?? "",
    photoUrl: latest?.photoUrl ?? "",
    photoAlt: latest?.photoAlt ?? "",
    affiliation: latest?.affiliation ?? "",
  };
  const [content, setContent] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const csrf = useCsrf();
  const dirty = JSON.stringify(content) !== JSON.stringify(initial);
  const fields = [
    ["displayName", "Public display name", 200],
    ["biography", "Biography", 4000],
    ["affiliation", "Affiliation", 300],
    ["photoUrl", "Photo URL (HTTPS)", 2048],
    ["photoAlt", "Photo description", 500],
  ] as const;
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h3">
        Author profile
      </Typography>
      <Typography>
        Save deliberately to retain a private revision. Public attribution
        changes only after approval.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {csrf.error && (
        <Alert severity="error">
          Save is unavailable. Reload to try again.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack
          component="form"
          spacing={2}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || saved) return;
            setBusy(true);
            setError("");
            const form = new FormData();
            for (const [key, value] of Object.entries(content))
              form.set(key, value);
            form.set("csrfToken", csrf.csrfToken);
            if (profile) form.set("profileId", profile.id);
            if (profile?.latestRevisionId)
              form.set("expectedRevisionId", profile.latestRevisionId);
            try {
              const response = await fetch("/api/admin/profiles", {
                method: "POST",
                body: form,
                credentials: "same-origin",
              });
              const result = await response.json();
              if (!response.ok) {
                setError(
                  typeof result.error === "string"
                    ? result.error
                    : "Profile could not be saved.",
                );
                return;
              }
              setSaved(true);
            } catch {
              setError(
                "Profile could not be saved. Keep your edits and try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {fields.map(([key, label, maxLength]) => (
            <TextField
              key={key}
              label={label}
              value={content[key]}
              required={key === "displayName"}
              multiline={key === "biography"}
              minRows={key === "biography" ? 4 : undefined}
              disabled={busy || saved}
              slotProps={{ htmlInput: { maxLength } }}
              onChange={(event) =>
                setContent({ ...content, [key]: event.target.value })
              }
            />
          ))}
          <Typography role="status">
            {saved
              ? "Profile saved. Revision retained."
              : busy
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : "No unsaved changes"}
          </Typography>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || saved || csrf.pending || csrf.error || !dirty}
            sx={{ minHeight: 44 }}
          >
            Save profile
          </Button>
          {saved && (
            <Link
              href={
                profile
                  ? `/admin/profiles?profile=${profile.id}`
                  : "/admin/profiles"
              }
            >
              Continue editing and view saved history
            </Link>
          )}
          <Link
            href={
              profile
                ? `/admin/profiles?profile=${profile.id}`
                : "/admin/profiles"
            }
          >
            Reload saved profile (discards unsaved edits)
          </Link>
        </Stack>
      </Paper>
      <Typography component="h2" variant="h4">
        Revision history
      </Typography>
      {!profile?.revisions.length && (
        <Typography>No saved revisions.</Typography>
      )}
      {profile?.revisions.map((revision) => (
        <Paper
          key={revision.id}
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, overflowWrap: "anywhere" }}
        >
          <Stack spacing={2}>
            <Typography component="h3" variant="h5">
              Revision {revision.number}
            </Typography>
            <Typography>
              Saved by {revision.savedBy} ·{" "}
              <ActivityTime instant={revision.savedAt} />
            </Typography>
            <Typography variant="body2">
              {revision.actorId
                ? `Actor: ${revision.actorId}`
                : "Retained legacy profile; original saver unknown"}
            </Typography>
            <Typography>Public display name: {revision.displayName}</Typography>
            <Typography sx={{ whiteSpace: "pre-wrap" }}>
              Biography: {revision.biography || "—"}
            </Typography>
            <Typography>Affiliation: {revision.affiliation || "—"}</Typography>
            <Typography>Photo URL: {revision.photoUrl || "—"}</Typography>
            <Typography>
              Photo description: {revision.photoAlt || "—"}
            </Typography>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
