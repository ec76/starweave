export interface ProfileContent {
  displayName: string;
  biography: string;
  photoUrl: string;
  photoAlt: string;
  affiliation: string;
}
export interface ProfileRevision extends ProfileContent {
  id: string;
  number: number;
  savedAt: string;
  savedBy: string;
  actorId: string | null;
}
export interface ProfileHistory {
  id: string;
  latestRevisionId: string | null;
  revisions: ProfileRevision[];
}
export interface ProfileSummary {
  id: string;
  displayName: string;
}
export class ProfileError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
  }
}
