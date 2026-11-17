import "server-only";
import { AdminAccessError } from "../../domain/accounts";
import { ProfileError } from "../../domain/profiles";
import { requestAdminSession } from "../admin/access";
import { adminConfig } from "../admin/config";
import { adminJson, csrfForm } from "../admin/handlers";
import { profiles } from "./repository";
import { profileService } from "./service";

export async function saveProfile(request: Request) {
  try {
    // Profile fields permit Unicode prose; retain a bounded body while allowing
    // the documented field lengths at their maximum UTF-8 representation.
    const form = await csrfForm(request, adminConfig(), 32768);
    if (!form)
      return adminJson(
        { error: "Invalid profile request. Reload and try again." },
        403,
      );
    await profileService(profiles).save(
      await requestAdminSession(request),
      form,
    );
    return adminJson({ saved: true });
  } catch (error) {
    if (error instanceof AdminAccessError || error instanceof ProfileError)
      return adminJson({ error: error.message }, error.status);
    return adminJson(
      { error: "Profile could not be saved. Keep your edits and try again." },
      503,
    );
  }
}
