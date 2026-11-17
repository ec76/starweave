import "server-only";
import type { AdminSession } from "../../domain/admin-auth";
import { accountId, requireRoles } from "../../domain/accounts";
import {
  ProfileError,
  type ProfileContent,
  type ProfileHistory,
  type ProfileSummary,
} from "../../domain/profiles";

// The repository rechecks live identity, roles and ownership in the same transaction
// as the operation. Client fields never supply an actor, owner, or permission.
export interface ProfileRepository {
  save(
    sessionId: string,
    profileId: string | null,
    expectedRevisionId: string | null,
    content: ProfileContent,
  ): Promise<string>;
  read(
    sessionId: string,
    profileId: string | null,
  ): Promise<ProfileHistory | null>;
  list(sessionId: string): Promise<ProfileSummary[]>;
}
export function profileService(repository: ProfileRepository) {
  const profileId = (value: unknown) => {
    try {
      return accountId(value);
    } catch {
      throw new ProfileError("Invalid profile or revision reference.", 400);
    }
  };
  return {
    read(session: AdminSession | null, id: string | null = null) {
      const current = requireRoles(session, ["Writer"]);
      return repository.read(current.id, id === null ? null : profileId(id));
    },
    list(session: AdminSession | null) {
      return repository.list(requireRoles(session, ["Writer"]).id);
    },
    save(session: AdminSession | null, form: FormData) {
      const current = requireRoles(session, ["Writer"]);
      const text = (key: string, max: number, required = false) => {
        const value = form.get(key) ?? "";
        if (
          typeof value !== "string" ||
          value.trim().length > max ||
          (required && !value.trim()) ||
          /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)
        )
          throw new ProfileError(`Invalid ${key}.`, 400);
        return value.trim();
      };
      const content: ProfileContent = {
        displayName: text("displayName", 200, true),
        biography: text("biography", 4000),
        photoUrl: text("photoUrl", 2048),
        photoAlt: text("photoAlt", 500),
        affiliation: text("affiliation", 300),
      };
      if (content.photoUrl) {
        try {
          const url = new URL(content.photoUrl);
          if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            !content.photoAlt
          )
            throw new Error();
        } catch {
          throw new ProfileError(
            "Use an HTTPS photo URL and describe the photo.",
            400,
          );
        }
      } else if (content.photoAlt)
        throw new ProfileError(
          "Add a photo URL or remove its description.",
          400,
        );
      const id = form.get("profileId"),
        expected = form.get("expectedRevisionId");
      return repository.save(
        current.id,
        id ? profileId(id) : null,
        expected ? profileId(expected) : null,
        content,
      );
    },
  };
}
