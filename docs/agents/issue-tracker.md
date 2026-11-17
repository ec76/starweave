# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `ec76/starweave`.
Use the `gh` CLI from the repository root.

- Before creating issues, verify the target with
  `gh repo view --json nameWithOwner`.
- Create: `gh issue create --repo ec76/starweave --title "..." --body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`.
- Comment: `gh issue comment <number> --body-file <file>`.
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: post an explanation, then run `gh issue close <number>`.
- Use native sub-issues and dependencies when supported. Otherwise record
  `Part of #<parent>` and `Blocked by: #<number>` in the issue body.
  A ticket is unblocked when every blocker is closed.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the GitHub issue.

## Pull requests as a triage surface

PRs as a request surface: no.
