# Main branch protection

Configure these settings for `main` in the repository settings:

- Require a pull request before merging.
- Require the `Marketplace source PR gate / gate` check.
- Require at least one maintainer or CODEOWNER approval.
- Dismiss stale approvals when the source declaration changes.
- Require conversation resolution and block force pushes/deletions.
- Allow merges when the branch is behind; do not require branches to be up to date.
- Keep Actions permissions limited to read-only contents plus the OIDC token used by the workflows.

The source gate workflow runs for every pull request so the required check is
always reported. It exits successfully for non-source pull requests and
rejects source PRs that touch anything outside `sources/<plugin-id>.yaml`.
Changes under `.github/workflows/` or to `.github/CODEOWNERS` also require an
approval from the configured CODEOWNER on the current PR head; stale approvals
do not satisfy this check.
`repositories.txt` is retired. `registry.json` is a generated compatibility
projection and may only be changed by the configured marketplace automation
account through the registry projection workflow.
