import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { profileService } from "./profiles/service";
import type { ProfileRepository } from "./profiles/service";
import type { AdminSession } from "../domain/admin-auth";

const session: AdminSession = {
  id: "session",
  userId: "user",
  actorId: "actor",
  email: "private@example.invalid",
  identity: { issuer: "fixture", subject: "user", displayName: "Account name" },
  roles: ["Writer"],
  expiresAt: Date.now() / 1000 + 1000,
};
it("saves public profile content using the authenticated session, ignoring supplied ownership", async () => {
  const save = vi.fn(async () => "revision");
  const repository: ProfileRepository = { save, read: vi.fn(), list: vi.fn() };
  const form = new FormData();
  form.set("displayName", " Public pen name ");
  form.set("biography", "A writer.");
  form.set("actorId", "someone-else");
  expect(await profileService(repository).save(session, form)).toBe("revision");
  expect(save).toHaveBeenCalledWith("session", null, null, {
    displayName: "Public pen name",
    biography: "A writer.",
    photoUrl: "",
    photoAlt: "",
    affiliation: "",
  });
});

it.each(
  [[], ["Administrator"], ["Approver"], ["Administrator", "Approver"]].map(
    (roles) => ({ roles: roles as AdminSession["roles"] }),
  ),
)(
  "denies profile reads and direct saves without Writer: $roles",
  async ({ roles }) => {
    const repository: ProfileRepository = {
      save: vi.fn(),
      read: vi.fn(),
      list: vi.fn(),
    };
    const service = profileService(repository);
    expect(() => service.save({ ...session, roles }, new FormData())).toThrow(
      "Access required",
    );
    expect(() => service.read({ ...session, roles })).toThrow(
      "Access required",
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.read).not.toHaveBeenCalled();
  },
);
it("rejects anonymous operations and invalid profile content before persistence", () => {
  const repository: ProfileRepository = {
    save: vi.fn(),
    read: vi.fn(),
    list: vi.fn(),
  };
  const service = profileService(repository);
  expect(() => service.save(null, new FormData())).toThrow(
    "Authentication required",
  );
  const form = new FormData();
  expect(() => service.save(session, form)).toThrow("Invalid displayName");
  form.set("displayName", "Name");
  form.set("photoUrl", "javascript:alert(1)");
  expect(() => service.save(session, form)).toThrow("HTTPS");
  form.set("photoUrl", "https://example.invalid/photo.jpg");
  expect(() => service.save(session, form)).toThrow("describe");
  form.set("photoAlt", "Portrait");
  form.set("biography", "x".repeat(4001));
  expect(() => service.save(session, form)).toThrow("Invalid biography");
  expect(repository.save).not.toHaveBeenCalled();
});
it.each(
  [
    ["Writer"],
    ["Writer", "Approver"],
    ["Administrator", "Writer"],
    ["Administrator", "Writer", "Approver"],
  ].map((roles) => ({ roles: roles as AdminSession["roles"] })),
)(
  "passes exact profile and concurrency references to live authorization: $roles",
  async ({ roles }) => {
    const id = "11111111-1111-4111-8111-111111111111";
    const save = vi.fn(async () => {
      throw new Error("Profile changed");
    });
    const repository: ProfileRepository = {
      save,
      read: vi.fn(),
      list: vi.fn(),
    };
    const form = new FormData();
    form.set("displayName", "Name");
    form.set("profileId", id);
    form.set("expectedRevisionId", id);
    await expect(
      profileService(repository).save({ ...session, roles }, form),
    ).rejects.toThrow("Profile changed");
    expect(save.mock.calls[0]?.slice(0, 3)).toEqual(["session", id, id]);
  },
);
