# Publication safety gate

`.github/workflows/publication-safety.yml` runs the gate on `pull_request_target`,
pushes to `main`, a weekly schedule, and manual dispatch. The job has only
`contents: read`, checks out trusted base code, fetches the PR head object for
inspection, and never checks out or executes pull-request code. It receives no
repository secret.

## Coverage

- Gitleaks `8.29.1` is downloaded from the official release URL and checked
  against the published Linux x64 SHA-256 before execution. Its JSON report and
  stdout/stderr stay in the runner temporary directory and are never uploaded.
- The private-detail guard scans added text lines in the exact PR (`base...head`)
  or push (`before..after`) range. Gitleaks uses the PR commit range
  (`base..head`) so commits reachable from the submitted head are not skipped.
  The guard explicitly accounts for added,
  modified, renamed, copied, deleted, binary, and metadata-only paths. A root
  push is scanned from the root commit.
- Every run also scans the complete candidate tree. Weekly and manual runs
  additionally scan all reachable Git history with Gitleaks.
- The guard reports only a rule, repository-relative path, and line number. It
  detects concrete home-directory paths, RFC1918 addresses, private DNS suffixes
  (`.local`, `.lan`, `.internal`, `.home.arpa`), non-synthetic email addresses,
  non-synthetic North American phone numbers, and URLs carrying credential-like
  query parameters. It does not attempt to classify arbitrary personal names,
  usernames, UUIDs, or ordinary public identifiers.

## Narrow exceptions

- `bgrablin` and the canonical public repository URL are public authorship and
  project metadata, not private-detail findings.
- `example.com`, `example.net`, `example.org`, `.test`, `.invalid`,
  `users.noreply.github.com`, loopback addresses, and `555` phone exchanges are
  reserved synthetic/public examples.
- `.gitleaksignore` accepts only exact historical fingerprints with a commit,
  path, rule, and line. It rejects globs and path-wide exclusions. Pull requests
  cannot add suppressions. An authorized main push may add an exact fingerprint
  only when its commit is already an ancestor of the trusted base. Gitleaks
  receives the trusted policy for the candidate delta. Existing entries document
  reviewed synthetic fixtures; they are not a baseline for new content.

A clean marker never suppresses another finding on the same line. Real private
values should be removed or replaced with a clearly synthetic value; only a
specific, reviewed public metadata exception should be added.

## Limitations

The complete-tree check protects the current published snapshot. The scheduled
Gitleaks audit covers reachable Git history. Exact historical fingerprints are
limited to reviewed synthetic test fixtures; path-wide ignores and candidate
changes to the trusted ignore policy fail closed. Gitleaks remains the secret
detector for binary and non-text content. A real credential finding still
requires rotation and, when warranted, history cleanup outside this workflow.
