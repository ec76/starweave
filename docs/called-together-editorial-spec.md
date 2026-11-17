# Called Together: invitation through approved publication

Spec and testing approach confirmed by the owner for publication to GitHub Issues with `ready-for-agent`.

## Problem Statement

Called Together needs a complete editorial workflow for a small staff. An Administrator must invite a writer and assign roles; the writer must establish an account and author profile, write and preview an article, and submit it for review. Approvers need to provide feedback and approve exact revisions. Visitors must receive the approved article and approved author information immediately after publication, with appropriate SEO metadata. Staff need a reliable history showing who changed and approved what.

Existing account management, editorial schema, and public article readers provide foundations, but do not constitute this complete workflow. The current public detail presentation is a summary rather than the full article.

## Solution

Deliver an authenticated editorial workspace connected to the existing account system and public article routes. Keep account security separate from public author attribution. Save changes only through explicit Save actions, retain revisions, and attach review decisions to exact submitted revisions. Publish approved content immediately without a separate publish action or deployment. Keep previously approved content public while replacements await approval.

Administrator, Writer, and Approver are independent permissions. Administrator alone grants neither writing nor approval. Administrators with Writer may edit any article or profile; Administrators with Approver may review and approve. Only an Administrator who also holds Writer and Approver may approve their own changes. This is an intentional initial policy for a small staff, with traceable history, and may be tightened later.

## User Stories

1. As an Administrator, I want to invite a writer and assign roles, so that staff receive the access they need.
2. As an Administrator, I want to assign multiple roles independently, so that a small staff can cover multiple responsibilities.
3. As an invited writer, I want to complete the existing account setup process, so that I can securely access the editorial workspace.
4. As an invited writer, I want clear setup success and failure feedback, so that I know whether I can proceed.
5. As a writer, I want to create my own author profile, so that readers can identify me.
6. As a writer, I want to edit only my own profile, so that other authors' attribution remains protected.
7. As a writer, I want to explicitly save profile changes as revisions, so that I control when changes are retained.
8. As a writer, I want to submit my profile for approval, so that public attribution is reviewed.
9. As an approver, I want to inspect a submitted profile revision, so that I can assess the exact proposed information.
10. As an approver, I want to return profile changes with feedback, so that the writer can correct them.
11. As a writer, I want to revise and resubmit my profile after feedback, so that I can obtain approval.
12. As a visitor, I want pending profile changes to remain private, so that I see only approved author information.
13. As a writer, I want to create an article attributed to my author profile, so that my work has a clear author.
14. As a writer, I want to explicitly save article changes as revisions, so that I can inspect the history of my work.
15. As a writer, I want no autosave, so that only deliberate saves persist my edits.
16. As a writer, I want to preview my article privately, so that I can assess its reader-facing presentation before submission.
17. As a writer, I want to submit a specific saved article revision, so that reviewers assess a known version.
18. As an approver, I want to find submissions awaiting review, so that I can act on pending work.
19. As an approver, I want to inspect the article and author information associated with a submission, so that I can review it in context.
20. As an approver, I want to return an article with feedback, so that the writer knows what to revise.
21. As a writer, I want to save a new revision and resubmit after feedback, so that earlier work and decisions remain traceable.
22. As an approver, I want approval to apply only to the exact submitted revision, so that unseen changes cannot become public.
23. As a Writer and Approver without Administrator, I want self-approval to be denied, so that another person reviews my articles and profile changes.
24. As an Administrator with Writer, I want to edit any article or profile, so that I can help maintain the site.
25. As an Administrator with Approver, I want to approve eligible submissions, so that I can help process reviews.
26. As an Administrator with all three roles, I want to approve my own articles and profile revisions, so that the initial small staff can operate.
27. As an Administrator without Writer or Approver, I want editorial actions to remain unavailable, so that management access does not silently grant editorial permissions.
28. As a visitor, I want an approved article immediately available at `/articles/[slug]`, so that publication does not wait for a rebuild.
29. As a visitor, I want to read the full approved article and approved author information, so that I receive complete content and attribution.
30. As a visitor, I want useful article titles, descriptions, canonical URLs where configured, and sharing metadata, so that links accurately describe the approved content.
31. As a writer, I want to propose edits to a published article, so that I can improve it without immediately changing the public version.
32. As a visitor, I want the last approved article to remain available during revision, so that pending edits do not disrupt reading.
33. As an approver, I want approval of a replacement revision to update public content immediately, so that only reviewed changes go live.
34. As authorized staff, I want to inspect saved revisions and their content, so that I can see what changed over time.
35. As authorized staff, I want review feedback, actor identities, timestamps, and publication events tied to revisions, so that I can see who changed and approved what.
36. As a writer or approver, I want stale or conflicting actions rejected clearly, so that concurrent work cannot overwrite history or approve the wrong version.

## Implementation Decisions

- Keep Called Together's editorial behavior, brand, and content in its own app. Reuse existing shared UI and account infrastructure where appropriate; this milestone does not create a generic multi-app editorial platform.
- Reuse account invitation/setup and role assignment behavior. Verify the complete invited-user journey rather than treating account creation success as proof of invitation delivery.
- Bind authenticated accounts to editorial actors and author ownership on the server. Do not trust client-supplied identities, ownership, roles, or approval permissions.
- Preserve independent Administrator, Writer, and Approver roles. Writer grants ownership-scoped editing; Administrator plus Writer extends editing to all articles and profiles. Approver grants review, subject to the self-approval policy. Administrator alone grants no editorial write or approval ability.
- Apply the self-approval restriction to both article authorship and the person's own changes; changing the submitting identity must not bypass it. The all-three-role Administrator exception is explicit and audited.
- Retain a content snapshot for each successful explicit Save. There is no autosave. Saving, submitting, returning feedback, approving, and publishing are distinct recorded actions; submission and approval identify the exact saved revision.
- Use the existing draft, submitted, changes-requested, and approved concepts. A saved replacement never silently inherits an earlier approval. Approved or submitted content cannot be overwritten in place to change what a review refers to.
- Extend the existing article revision/review model and add corresponding profile revision/review support. Use additive migrations rather than rewriting applied migrations.
- Separate pending revisions from public approved snapshots. Public author reads must not expose direct, unapproved profile updates. First article publication requires approved author information; subsequent profile changes leave existing approved attribution visible.
- Keep the last approved article revision public while a new revision is saved, submitted, returned, or awaiting approval. The same rule applies to public profiles.
- Commit approval, the public revision selection, and its activity record consistently. A failed approval must not publish partially or record a successful approval. The next public request after successful approval sees the new approved state without a rebuild.
- Reuse existing dynamic public article readers and publication filtering, extending them to full body rendering and approved author attribution. Preserve unpublished/missing article handling and separation from private editorial data.
- Provide a private preview that uses the same supported content renderer as publication. Validate structured content and render it safely. Preview access must not make drafts publicly discoverable or indexable.
- Retain title, summary, body, language, SEO description, and supported sharing image metadata within the reviewed article snapshot. Reuse the configured site origin for canonical URLs; do not infer or invent a production origin.
- Use conflict detection at save and review boundaries so an outdated browser cannot overwrite newer work or approve an unintended revision. A review must not regress publication to an obsolete version after a newer publication.
- Retain append-only review/activity records with actor, target, revision reference, action, timestamp, and feedback where applicable. Revision snapshots must make the changed content inspectable. Protect history with existing authenticated authorization boundaries and exclude credentials, tokens, and other secrets.
- Provide usable editorial navigation, clear status/action feedback, and accessible layouts within the existing Called Together design system. Do not expose unavailable actions as working controls.

## Testing Decisions

Owner-confirmed testing approach:

- Prefer the authenticated server operation boundary as the main automated seam for editorial behavior, following the existing account-service/repository pattern. Exercise save, submit, request changes, approve, ownership checks, the full role matrix, and audit outcomes through this boundary rather than testing private helper details.
- Use database integration verification against an explicitly selected disposable database to establish guarantees mocks cannot prove: retained snapshots, exact revision references, concurrency, approved public projections, authorization rechecks, and atomic approval/publication/history. Follow the existing opt-in editorial SQL verification pattern; do not run mutation verification on a live database.
- Reuse public article service/page tests to verify full approved body and attribution, metadata, missing/unpublished behavior, and unchanged public content during pending edits. Verify new public content on the next request after approval, including profile updates.
- Add focused UI behavior tests for explicit Save, private preview, submit, feedback/resubmission, review actions, and history inspection. Do not test static copy or Material UI implementation details. Use Storybook for visual states.
- Verify the complete invited-user-to-publication journey in a controlled environment, including a normal writer with a different approver and the all-three-role Administrator self-approval exception. Include editing an already published article and profile while proving their previous public versions stay visible.
- Test denied actions as well as successful ones: cross-writer edits, missing Writer/Approver roles, non-Administrator self-approval, stale reviews, direct unauthorized requests, draft disclosure, and failed publication transactions. Good tests assert externally observable results and retained state, not internal call ordering.
- Run the repository's required formatting, lint, type, test, application build, and Storybook checks during implementation. Preserve the independent static-export web application and existing deployment configuration.

## Out of Scope

- Autosave, real-time collaborative editing, and recording every keystroke.
- Scheduled publication or a separate post-approval publish step.
- A mandatory independent approver for an Administrator holding all three roles; that is a possible future policy change.
- A generic CMS for future monorepo apps, additional applications, or unrelated shared-package refactoring.
- Advanced review workflows such as multiple approval stages, reviewer assignment automation, and inline annotation systems.
- A new asset-management platform, public author-directory project, or translation workflow beyond existing article language support.
- Infrastructure migration, changes to the separate static-export application's hosting, or unrequested Azure resource changes.

## Further Notes

This spec captures the agreed first complete Called Together publishing milestone. Existing features must be reused and verified, not assumed complete or rebuilt unnecessarily. Current local admin usability changes are work in progress and must be preserved.

The self-approval exception is deliberate for the initial small staff. Preserve a clear policy boundary so it can be tightened later without losing historical actor or revision information.

Implementation details such as editor library and exact UI layout are not selected by this spec. They must satisfy the explicit-save, safe-preview, revision-history, approval, accessibility, and publication requirements above.
