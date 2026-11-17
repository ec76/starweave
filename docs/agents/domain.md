# Domain docs

## Before exploring

Read the root `GLOSSARY-MAP.md`, then the glossaries relevant to the task.
Read relevant system-wide ADRs in `docs/adr/` and context-specific ADRs
under the relevant app or package.

If these files do not exist, proceed silently. Domain modeling creates
them when terminology or decisions are resolved.

## Multi-context layout

- `GLOSSARY-MAP.md`: maps domain contexts to their glossaries.
- `docs/adr/`: system-wide decisions.
- `apps/<app>/GLOSSARY.md`: app-specific terminology.
- `apps/<app>/docs/adr/`: app-specific decisions.
- `packages/<package>/GLOSSARY.md`: package-specific terminology.
- `packages/<package>/docs/adr/`: package-specific decisions.

Create contexts where distinct domain vocabulary warrants them.
The map identifies relevant contexts; a workspace need not have its own glossary.

## Vocabulary and decisions

Use glossary terms in issues, proposals, hypotheses, and test names.
When a needed concept is missing, reconsider the wording or note the gap
for domain modeling.

Explicitly identify any proposal that conflicts with an existing ADR,
including the ADR reference and why the decision should be reconsidered.
