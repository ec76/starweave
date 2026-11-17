import "server-only";
import sql from "mssql";
import { database } from "../database";
import {
  ProfileError,
  type ProfileContent,
  type ProfileRevision,
} from "../../domain/profiles";
import type { ProfileRepository } from "./service";

async function operation(
  sessionId: string,
  action: string,
  id: string | null = null,
  expected: string | null = null,
  content?: ProfileContent,
) {
  try {
    const request = (await database.getPool())
      .request()
      .input("SessionId", sql.NVarChar(36), sessionId)
      .input("Action", sql.VarChar(10), action)
      .input("ProfileId", sql.UniqueIdentifier, id)
      .input("ExpectedRevisionId", sql.UniqueIdentifier, expected);
    if (content)
      request
        .input("DisplayName", sql.NVarChar(200), content.displayName)
        .input("Biography", sql.NVarChar(sql.MAX), content.biography || null)
        .input("PhotoUrl", sql.NVarChar(2048), content.photoUrl || null)
        .input("PhotoAlt", sql.NVarChar(500), content.photoAlt || null)
        .input("Affiliation", sql.NVarChar(300), content.affiliation || null);
    return await request.execute("dbo.AuthorProfileOperation");
  } catch (error) {
    if (error instanceof sql.RequestError) {
      if (error.number === 53303)
        throw new ProfileError("Profile access denied.", 403);
      if (error.number === 53309)
        throw new ProfileError(
          "Profile changed or is busy. Keep your edits and reload before saving.",
          409,
        );
      if (error.number === 53300)
        throw new ProfileError("Check the profile fields.", 400);
    }
    throw error;
  }
}
export const profiles: ProfileRepository = {
  async save(sessionId, id, expected, content) {
    return String(
      (await operation(sessionId, "save", id, expected, content)).recordset[0]
        .id,
    );
  },
  async list(sessionId) {
    return (await operation(sessionId, "list")).recordset;
  },
  async read(sessionId, id) {
    const result = await operation(sessionId, "read", id);
    const sets = result.recordsets as sql.IRecordSet<unknown>[];
    const header = result.recordset[0];
    if (!header?.id) return null;
    return {
      id: String(header.id),
      latestRevisionId: header.latestRevisionId
        ? String(header.latestRevisionId)
        : null,
      revisions: (sets[1] ?? []).map((value) => {
        const row = value as Omit<ProfileRevision, "savedAt"> & {
          savedAt: Date;
        };
        return { ...row, savedAt: row.savedAt.toISOString() };
      }),
    };
  },
};
