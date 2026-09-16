#!/usr/bin/env python3
"""Fail-closed publication-safety checks for tracked repository content.

The range scan examines added lines in the exact Git range supplied by CI. It
never prints matched content. The tree scan is an informational audit used by
maintainers to identify older findings without creating a baseline that silently
blesses them.
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import ipaddress
import json
import os
import re
import secrets
import string
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable, Sequence

ROOT = Path(__file__).resolve().parents[1]

# These are intentionally narrow. They identify concrete disclosure classes,
# not arbitrary names or every identifier that might be personal.
PRIVATE_HOME_PATH = re.compile(
    r"(?<![A-Za-z0-9_])/(?:home|Users)/[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?=[/\\]|$)"
)
WINDOWS_HOME_PATH = re.compile(
    r"(?i)(?<![A-Za-z0-9_])(?:[A-Z]:[\\/]+Users[\\/]+|\\\\[^\\/\s]+[\\/]+Users[\\/]+)"
    r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?=[\\/]|$)"
)
PRIVATE_IPV4 = re.compile(r"(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])")
# Require lowercase DNS-like labels of at least two characters. This catches
# common private hostnames without treating code properties such as Path.home,
# captured.home, e.local, or Enum.Internal as network identities. `.home.arpa`
# is the standards-based home suffix; bare `.home` is too ambiguous in source.
PRIVATE_HOSTNAME = re.compile(
    r"(?<![A-Za-z0-9-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])\.)+"
    r"(?:local|lan|internal|home\.arpa)(?![A-Za-z0-9-])"
)
CONTACT_EMAIL = re.compile(
    r"(?<![A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9.-]{0,61}[A-Za-z0-9])?\.[A-Za-z]{2,63}(?![A-Za-z0-9.-])"
)
CONTACT_PHONE = re.compile(
    r"(?<!\w)(?:\+?1[\s.-])?(?:\([2-9]\d{2}\)|[2-9]\d{2})"
    r"[\s.-]\d{3}[\s.-]\d{4}(?!\w)"
)
URL_CREDENTIAL = re.compile(
    r"(?i)\bhttps?://[^\s<>'\"]+[?&](?:access[-_]?key|access[-_]?token|api[-_]?key|"
    r"auth(?:entication)?[-_]?token|authorization|bearer[-_]?token|client[-_]?secret|"
    r"id[-_]?token|key|jwt|password|private[-_]?key|refresh[-_]?token|secret|"
    r"session[-_]?token|signature|sig|token|x[-_]?api[-_]?key)"
    r"=[^\s&#<>'\"]+"
)

SAFE_EMAIL_DOMAINS = frozenset(
    {
        "example.com",
        "example.net",
        "example.org",
        "example.test",
        "example.invalid",
        "users.noreply.github.com",
    }
)
SYNTHETIC_PHONE_PREFIXES = frozenset({"555"})
_PRIVATE_NETWORK_PREFIXES = (("10", ".0.0.0/8"), ("172", ".16.0.0/12"), ("192", ".168.0.0/16"))
PRIVATE_NETWORKS = tuple(
    ipaddress.ip_network(prefix + suffix)
    for prefix, suffix in _PRIVATE_NETWORK_PREFIXES
)


@dataclasses.dataclass(frozen=True, order=True)
class Finding:
    """A safe-to-log finding location; never store the matched value."""

    rule: str
    path: str
    line: int


@dataclasses.dataclass(frozen=True)
class ChangedFile:
    status: str
    path: str
    previous_path: str | None = None


@dataclasses.dataclass(frozen=True)
class RangeScan:
    changed_files: tuple[ChangedFile, ...]
    findings: tuple[Finding, ...]
    added_lines: int
    binary_or_non_text_files: tuple[str, ...] = ()


def _run_git(repo: Path, args: Sequence[str]) -> bytes:
    """Run a read-only Git query without exposing Git's diagnostic text."""
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("Git range inspection failed")
    return result.stdout


def _valid_commit(repo: Path, value: str) -> bool:
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", value or ""):
        return False
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"{value}^{{commit}}"],
        cwd=repo,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return result.returncode == 0


def _validate_range(repo: Path, base: str | None, head: str, root: bool) -> None:
    if not _valid_commit(repo, head):
        raise RuntimeError("Requested head is not a verified commit")
    if root:
        if base:
            raise RuntimeError("Root scan cannot also specify a base")
        return
    if not base or not _valid_commit(repo, base):
        raise RuntimeError("Requested base is not a verified commit")


def _decode_path(value: bytes) -> str:
    return value.decode("utf-8", errors="surrogateescape")


def collect_changed_files(
    repo: Path, base: str | None, head: str, *, root: bool = False
) -> tuple[ChangedFile, ...]:
    """Return every tracked change, including deletions and renames."""
    _validate_range(repo, base, head, root)
    if root:
        raw = _run_git(
            repo,
            [
                "diff-tree",
                "--root",
                "--no-commit-id",
                "--name-status",
                "-z",
                "--find-renames",
                "--no-ext-diff",
                "--no-textconv",
                "-r",
                head,
                "--",
            ],
        )
    else:
        raw = _run_git(
            repo,
            [
                "diff",
                "--name-status",
                "-z",
                "--find-renames",
                "--no-ext-diff",
                "--no-textconv",
                f"{base}...{head}",
                "--",
            ],
        )

    tokens = raw.split(b"\0")
    if tokens and tokens[-1] == b"":
        tokens.pop()
    changed: list[ChangedFile] = []
    index = 0
    while index < len(tokens):
        status = _decode_path(tokens[index])
        index += 1
        if not status:
            raise RuntimeError("Git returned an empty change status")
        kind = status[0]
        if kind in {"R", "C"}:
            if index + 1 >= len(tokens):
                raise RuntimeError("Git returned an incomplete rename record")
            previous = _decode_path(tokens[index])
            path = _decode_path(tokens[index + 1])
            index += 2
            changed.append(ChangedFile(kind, path, previous))
        else:
            if index >= len(tokens):
                raise RuntimeError("Git returned an incomplete change record")
            path = _decode_path(tokens[index])
            index += 1
            if kind not in {"A", "C", "D", "M", "R", "T", "U", "X", "B"}:
                raise RuntimeError("Git returned an unsupported change status")
            changed.append(ChangedFile(kind, path))
    return tuple(changed)


def _unquote_diff_path(value: str) -> str | None:
    if value == "/dev/null":
        return None
    # Normal repository paths, including spaces, are emitted without quoting.
    # Keep C-style quoted paths safe and readable without evaluating escapes.
    if value.startswith('"') and value.endswith('"') and len(value) >= 2:
        value = value[1:-1]
        value = re.sub(r"\\([\\\"])", r"\1", value)
        value = re.sub(r"\\([0-7]{3})", lambda m: chr(int(m.group(1), 8)), value)
    if value.startswith("b/"):
        return value[2:]
    return value


def iter_added_lines(diff: bytes) -> Iterable[tuple[str, int, str]]:
    """Yield (repo-relative path, new line number, added text) from a diff."""
    current_path: str | None = None
    new_line = 0
    in_hunk = False
    for raw_line in diff.splitlines():
        line = raw_line.decode("utf-8", errors="surrogateescape")
        if line.startswith("+++ "):
            current_path = _unquote_diff_path(line[4:])
            in_hunk = False
            continue
        if line.startswith("@@ "):
            match = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", line)
            if not match:
                raise RuntimeError("Git returned an unreadable hunk header")
            new_line = int(match.group(1))
            in_hunk = True
            continue
        if not in_hunk:
            continue
        if line.startswith("+"):
            if current_path is None:
                raise RuntimeError("Git returned added content without a path")
            yield current_path, new_line, line[1:]
            new_line += 1
        elif line.startswith(" "):
            new_line += 1
        elif line.startswith("-") or line.startswith("\\"):
            continue


def _private_ipv4(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    return any(address in network for network in PRIVATE_NETWORKS)


def _add_finding(findings: set[Finding], rule: str, path: str, line: int) -> None:
    findings.add(Finding(rule, path, line))


def private_detail_findings(text: str, path: str, line: int) -> tuple[Finding, ...]:
    """Find concrete private-detail classes without retaining matched text."""
    findings: set[Finding] = set()
    if PRIVATE_HOME_PATH.search(text):
        _add_finding(findings, "private-home-path", path, line)
    if WINDOWS_HOME_PATH.search(text):
        _add_finding(findings, "private-home-path", path, line)
    for match in PRIVATE_IPV4.finditer(text):
        if _private_ipv4(match.group(0)):
            _add_finding(findings, "private-network-address", path, line)
    if PRIVATE_HOSTNAME.search(text):
        _add_finding(findings, "private-hostname", path, line)
    for match in CONTACT_EMAIL.finditer(text):
        domain = match.group(0).rsplit("@", 1)[-1].lower().rstrip(".")
        if domain not in SAFE_EMAIL_DOMAINS and not domain.endswith((".test", ".invalid")):
            _add_finding(findings, "private-contact-email", path, line)
    for match in CONTACT_PHONE.finditer(text):
        digits = re.sub(r"\D", "", match.group(0))
        if digits.startswith("1"):
            digits = digits[1:]
        if digits[:3] not in SYNTHETIC_PHONE_PREFIXES:
            _add_finding(findings, "private-contact-phone", path, line)
    if URL_CREDENTIAL.search(text):
        _add_finding(findings, "credential-bearing-url", path, line)
    return tuple(sorted(findings))


def scan_range(repo: Path, base: str | None, head: str, *, root: bool = False) -> RangeScan:
    """Scan all added lines in a verified range and account for all changes."""
    changed_files = collect_changed_files(repo, base, head, root=root)
    if root:
        diff = _run_git(
            repo,
            [
                "diff-tree",
                "--root",
                "--no-commit-id",
                "--unified=0",
                "--no-renames",
                "--no-ext-diff",
                "--no-textconv",
                "-r",
                head,
                "--",
            ],
        )
    else:
        diff = _run_git(
            repo,
            [
                "diff",
                "--unified=0",
                "--no-renames",
                "--no-ext-diff",
                "--no-textconv",
                f"{base}...{head}",
                "--",
            ],
        )

    findings: set[Finding] = set()
    added_lines = 0
    paths_with_added_text: set[str] = set()
    for path, line, text in iter_added_lines(diff):
        added_lines += 1
        paths_with_added_text.add(path)
        findings.update(private_detail_findings(text, path, line))

    changed_paths = {entry.path for entry in changed_files if entry.status != "D"}
    if not paths_with_added_text <= changed_paths:
        raise RuntimeError("Added content was not accounted for in the Git change manifest")

    # Binary files and pure deletions are represented in changed_files. They do
    # not have text lines for this detector, and are called out explicitly.
    binary_or_non_text = tuple(
        sorted(
            entry.path
            for entry in changed_files
            if entry.path not in paths_with_added_text
        )
    )
    return RangeScan(tuple(changed_files), tuple(sorted(findings)), added_lines, binary_or_non_text)


def scan_tree(repo: Path, ref: str) -> tuple[tuple[Finding, ...], tuple[str, ...]]:
    """Audit a committed tree for existing findings; never create a baseline."""
    if not _valid_commit(repo, ref):
        raise RuntimeError("Requested tree ref is not a verified commit")
    paths_raw = _run_git(repo, ["ls-tree", "-r", "-z", "--name-only", ref, "--"])
    findings: set[Finding] = set()
    unreadable: list[str] = []
    for raw_path in paths_raw.split(b"\0"):
        if not raw_path:
            continue
        path = _decode_path(raw_path)
        try:
            content = _run_git(repo, ["show", f"{ref}:{path}"])
        except RuntimeError:
            unreadable.append(path)
            continue
        if b"\0" in content:
            # Binary files are part of the tree and are explicitly reported;
            # Gitleaks remains the binary-capable secret detector in CI.
            continue
        text = content.decode("utf-8", errors="surrogateescape")
        for line_number, line in enumerate(text.splitlines(), 1):
            findings.update(private_detail_findings(line, path, line_number))
    return tuple(sorted(findings)), tuple(sorted(unreadable))


MAX_SAFE_METADATA_CHARS = 160


def _strip_terminal_controls(value: object) -> str:
    return "".join(character for character in str(value) if character.isprintable())


def _safe_metadata(value: object) -> str:
    """Make untrusted non-path metadata safe and bounded for logs."""
    text = _strip_terminal_controls(value)
    text = re.sub(r"(?i)(?:[A-Z]:[\\/]+Users[\\/]+|\\\\[^\\/\s]+[\\/]+Users[\\/]+)"
                  r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", "<private-home>", text)
    text = re.sub(r"/(?:home|Users)/[A-Za-z0-9][A-Za-z0-9._-]{0,63}", "/<private-home>", text)
    text = CONTACT_EMAIL.sub("<private-contact>", text)
    text = CONTACT_PHONE.sub("<private-contact>", text)
    text = PRIVATE_IPV4.sub("<private-network>", text)
    text = PRIVATE_HOSTNAME.sub("<private-host>", text)
    text = URL_CREDENTIAL.sub("<credential-url>", text)
    return text[:MAX_SAFE_METADATA_CHARS]


def _redacted_path_identifier(value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8", errors="surrogatepass")).hexdigest()[:12]
    return f"<redacted-path:{digest}>"


def _safe_path_metadata(value: object) -> str:
    """Keep ordinary repo paths readable; hash risky paths without echoing them."""
    text = _strip_terminal_controls(value)
    path_like = re.fullmatch(r"[A-Za-z0-9._/@+, -]+", text or "")
    risky = (
        not text
        or len(text) > MAX_SAFE_METADATA_CHARS
        or text.startswith("/")
        or text.startswith("\\\\")
        or re.match(r"(?i)^[A-Z]:[\\/]", text) is not None
        or any(part == ".." for part in re.split(r"[\\/]", text))
        or PRIVATE_HOME_PATH.search(text) is not None
        or WINDOWS_HOME_PATH.search(text) is not None
        or any(_private_ipv4(match.group(0)) for match in PRIVATE_IPV4.finditer(text))
        or PRIVATE_HOSTNAME.search(text) is not None
        or CONTACT_EMAIL.search(text) is not None
        or CONTACT_PHONE.search(text) is not None
        or URL_CREDENTIAL.search(text) is not None
        or path_like is None
    )
    return _redacted_path_identifier(text) if risky else text


def _safe_finding_line(finding: Finding) -> str:
    return f"  rule={_safe_metadata(finding.rule)} path={_safe_path_metadata(finding.path)} line={finding.line}"


def _read_json_report(path: Path) -> list[dict[str, object]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("Gitleaks report could not be read") from exc
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise RuntimeError("Gitleaks report has an unexpected shape")
    return value


def report_gitleaks(report: Path, status: int) -> int:
    """Print only safe rule/path/line metadata from a private report."""
    try:
        findings = _read_json_report(report)
    except RuntimeError:
        print("FAIL Gitleaks did not produce a valid private report")
        return 2
    if status == 0 and not findings:
        print("OK Gitleaks changed-range scan passed")
        return 0
    if findings:
        print(f"FAIL Gitleaks found {len(findings)} finding(s); matched values were redacted")
        for item in findings:
            rule = item.get("RuleID", "unknown-rule")
            path = item.get("File", "unknown-path")
            line = item.get("StartLine", "?")
            print(f"  rule={_safe_metadata(rule)} path={_safe_path_metadata(path)} line={_safe_metadata(line)}")
        return 1
    print(f"FAIL Gitleaks scanner error (exit status {status}); no report details were emitted")
    return status if status > 1 else 1


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(f"Publication-safety self-test failed: {message}")


_IGNORE_FINGERPRINT = re.compile(r"^[0-9a-fA-F]{40,64}:[^:]+:[^:]+:\d+$")


def _read_ignore_entries(path: Path) -> set[str]:
    if not path.exists():
        return set()
    entries: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "*" in line or "?" in line or not _IGNORE_FINGERPRINT.fullmatch(line):
            raise RuntimeError(".gitleaksignore contains a broad or malformed exception")
        entries.add(line)
    return entries


def validate_ignore_policy(
    repo: Path = ROOT,
    trusted_ignore_path: Path | None = None,
    candidate_ignore_path: Path | None = None,
    *,
    allow_historical_additions: bool = False,
    trusted_base: str | None = None,
) -> None:
    """Reject new suppressions unless each points behind an authorized push base."""
    candidate_entries = _read_ignore_entries(candidate_ignore_path or (repo / ".gitleaksignore"))
    if trusted_ignore_path is None:
        return
    trusted_entries = _read_ignore_entries(trusted_ignore_path)
    additions = candidate_entries - trusted_entries
    if not additions:
        return
    if not allow_historical_additions or not trusted_base or not _valid_commit(repo, trusted_base):
        raise RuntimeError(".gitleaksignore adds an untrusted exception")
    for entry in additions:
        commit = entry.split(":", 1)[0]
        if not _valid_commit(repo, commit):
            raise RuntimeError(".gitleaksignore references an invalid commit")
        result = subprocess.run(
            ["git", "merge-base", "--is-ancestor", commit, trusted_base],
            cwd=repo,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(".gitleaksignore references a non-historical commit")


def run_private_self_test(repo: Path = ROOT) -> None:
    """Exercise positives, clean public metadata, and non-bypass behavior."""
    validate_ignore_policy(repo)
    clean_cases = [
        ("public project https://github.com/bgrablin/hermes-personal-display", "README.md"),
        ("synthetic endpoint https://example.test/api at 127.0.0.1", "tests/fixtures/example.json"),
        ("public author bgrablin and test@example.test", "docs/publication-safety.md"),
        ("synthetic contact 555-010-1234", "tests/fixtures/example.json"),
        ("Path.home() captured.home.activity e.local Enum.Internal", "src/example.py"),
    ]
    for text, path in clean_cases:
        _assert(not private_detail_findings(text, path, 1), f"clean case was rejected: {path}")

    positives = [
        ("/" + "home/example-user/private.txt", "private-home-path"),
        ("C:" + "\\\\" + "Users" + "\\\\" + "example-user" + "\\\\" + "private.txt", "private-home-path"),
        ("10" + ".23.4.5", "private-network-address"),
        ("display" + ".internal", "private-hostname"),
        ("test.user" + "@" + "private.example", "private-contact-email"),
        ("256" + "-" + "456-7890", "private-contact-phone"),
    ]
    for text, expected_rule in positives:
        findings = private_detail_findings(text, "canary.txt", 7)
        _assert(any(item.rule == expected_rule for item in findings), expected_rule)

    for parameter in (
        "api" + "_key",
        "access" + "_token",
        "refresh" + "_token",
        "client" + "_secret",
        "auth" + "_token",
        "bearer" + "_token",
        "x-api-key",
        "token",
    ):
        findings = private_detail_findings(
            "https://example.test/?" + parameter + "=synthetic-value", "canary.txt", 8
        )
        _assert(any(item.rule == "credential-bearing-url" for item in findings), parameter)

    # A safe marker on the same line cannot suppress a real addition.
    mixed = "https://github.com/bgrablin/hermes-personal-display " + "/" + "home/example-user/private.txt"
    _assert(
        any(item.rule == "private-home-path" for item in private_detail_findings(mixed, "mixed.txt", 3)),
        "public marker bypassed a private path",
    )

    unsafe_path = "/" + "home/example-user/report" + "\x1b[31m.txt"
    redacted_path = _safe_path_metadata(unsafe_path)
    _assert(redacted_path.startswith("<redacted-path:") and redacted_path.endswith(">"), "risky path was not redacted")
    _assert("example-user" not in redacted_path and "\x1b" not in redacted_path, "risky path leaked metadata")
    _assert(_safe_path_metadata("tests/fixtures/example.json") == "tests/fixtures/example.json", "safe path was over-redacted")

    with tempfile.TemporaryDirectory(prefix="publication-safety-ignore-") as directory:
        ignore_root = Path(directory)
        candidate = "a" * 40 + ":tests/fixtures/example.txt:synthetic-rule:1"
        (ignore_root / ".gitleaksignore").write_text(candidate + "\n", encoding="utf-8")
        trusted = ignore_root / "trusted.gitleaksignore"
        trusted.write_text("", encoding="utf-8")
        try:
            validate_ignore_policy(ignore_root, trusted)
        except RuntimeError:
            pass
        else:
            raise RuntimeError("Publication-safety self-test failed: new ignore was accepted")
        trusted.write_text(candidate + "\n", encoding="utf-8")
        validate_ignore_policy(ignore_root, trusted)

    with tempfile.TemporaryDirectory(prefix="publication-safety-range-") as directory:
        range_root = Path(directory)
        script_dir = range_root / "scripts"
        script_dir.mkdir()
        (script_dir / "publication_safety.py").write_text(
            Path(__file__).read_text(encoding="utf-8"), encoding="utf-8"
        )

        def git(*arguments: str) -> str:
            result = subprocess.run(
                ["git", *arguments], cwd=range_root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False
            )
            _assert(result.returncode == 0, "self-test Git fixture setup failed")
            return result.stdout.strip()

        git("-c", "init.defaultBranch=main", "init", "--quiet")
        git("config", "user.email", "test@example.test")
        git("config", "user.name", "publication-safety")
        git("add", "scripts/publication_safety.py")
        git("commit", "--quiet", "-m", "synthetic checker source")
        head = git("rev-parse", "HEAD")
        self_scan = scan_range(range_root, None, head, root=True)
        _assert(not self_scan.findings, "checker source failed its committed self-scan")

        trusted_ignore = range_root / "trusted.gitleaksignore"
        candidate_ignore = range_root / "candidate.gitleaksignore"
        trusted_ignore.write_text("", encoding="utf-8")
        candidate_ignore.write_text(
            f"{head}:tests/fixtures/example.txt:synthetic-rule:1\n", encoding="utf-8"
        )
        validate_ignore_policy(
            range_root,
            trusted_ignore,
            candidate_ignore,
            allow_historical_additions=True,
            trusted_base=head,
        )
        (range_root / "future.txt").write_text("future\n", encoding="utf-8")
        git("add", "future.txt")
        git("commit", "--quiet", "-m", "future candidate")
        future = git("rev-parse", "HEAD")
        candidate_ignore.write_text(
            f"{future}:tests/fixtures/example.txt:synthetic-rule:1\n", encoding="utf-8"
        )
        try:
            validate_ignore_policy(
                range_root,
                trusted_ignore,
                candidate_ignore,
                allow_historical_additions=True,
                trusted_base=head,
            )
        except RuntimeError:
            pass
        else:
            raise RuntimeError("Publication-safety self-test failed: future ignore was accepted")


def _run_gitleaks(binary: Path, source: Path, report: Path) -> tuple[int, list[dict[str, object]]]:
    result = subprocess.run(
        [
            str(binary),
            "dir",
            str(source),
            "--redact",
            "--ignore-gitleaks-allow",
            "--no-banner",
            "--no-color",
            "--report-format",
            "json",
            "--report-path",
            str(report),
            "--exit-code",
            "1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    findings = _read_json_report(report) if report.exists() and report.stat().st_size else []
    return result.returncode, findings


def run_gitleaks_self_test(binary: Path) -> None:
    """Require the downloaded scanner to reject a disposable synthetic canary."""
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise RuntimeError("Gitleaks binary is missing or not executable")
    alphabet = string.ascii_letters + string.digits
    with tempfile.TemporaryDirectory(prefix="publication-safety-") as directory:
        root = Path(directory)
        positive = root / "positive.txt"
        synthetic_pat = "ghp_" + "".join(secrets.choice(alphabet) for _ in range(36))
        positive.write_text("GITHUB_TOKEN=" + synthetic_pat + "\n", encoding="utf-8")
        report = root / "positive-report.json"
        status, findings = _run_gitleaks(binary, root, report)
        _assert(status == 1, "Gitleaks did not fail on the secret-shaped canary")
        _assert(any(item.get("RuleID") == "github-pat" for item in findings), "Gitleaks rule was not exercised")

        clean_root = root / "clean"
        clean_root.mkdir()
        (clean_root / "clean.txt").write_text(
            "public project: https://github.com/bgrablin/hermes-personal-display\n",
            encoding="utf-8",
        )
        clean_report = root / "clean-report.json"
        clean_status, clean_findings = _run_gitleaks(binary, clean_root, clean_report)
        _assert(clean_status == 0 and not clean_findings, "Gitleaks rejected the clean canary")


def _print_range_result(result: RangeScan) -> int:
    statuses = "".join(entry.status for entry in result.changed_files) or "none"
    print(
        f"Publication safety range inspected: {len(result.changed_files)} changed file(s), "
        f"{result.added_lines} added text line(s), statuses={statuses}"
    )
    if result.binary_or_non_text_files:
        print(
            f"  explicitly accounted for {len(result.binary_or_non_text_files)} "
            "binary/deletion/metadata-only change(s); no text was silently skipped"
        )
    if result.findings:
        print(f"FAIL private-detail guard found {len(result.findings)} finding(s); matched values were redacted")
        for finding in result.findings:
            print(_safe_finding_line(finding))
        print("Treatment: remove the private value, replace it with a synthetic/public value, or document a narrow exact exception.")
        return 1
    print("OK private-detail guard passed; no matched values were emitted")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true", help="run private-detail detector canaries")
    parser.add_argument("--gitleaks-self-test", type=Path, metavar="BINARY")
    parser.add_argument("--gitleaks-report", type=Path, metavar="REPORT")
    parser.add_argument("--gitleaks-status", type=int, metavar="STATUS")
    parser.add_argument("--tree-ref", metavar="SHA", help="fail-closed audit of one exact committed tree")
    parser.add_argument("--base", metavar="SHA", help="verified base commit for a three-dot range")
    parser.add_argument("--head", metavar="SHA", help="verified head commit")
    parser.add_argument("--root", action="store_true", help="scan the root commit at --head")
    parser.add_argument(
        "--trusted-gitleaks-ignore",
        type=Path,
        metavar="PATH",
        help="trusted base policy used to reject newly added ignore entries",
    )
    parser.add_argument(
        "--candidate-gitleaks-ignore",
        type=Path,
        metavar="PATH",
        help="candidate policy extracted from the untrusted head for comparison",
    )
    parser.add_argument(
        "--allow-historical-gitleaks-ignore-additions",
        action="store_true",
        help="allow exact fingerprints only for commits already behind --trusted-base",
    )
    parser.add_argument("--trusted-base", metavar="SHA")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.self_test:
            run_private_self_test()
            print("OK private-detail detector self-test passed")
            return 0
        if args.gitleaks_self_test:
            run_gitleaks_self_test(args.gitleaks_self_test)
            print("OK Gitleaks synthetic positive/negative canaries passed")
            return 0
        if args.gitleaks_report is not None:
            if args.gitleaks_status is None:
                raise RuntimeError("Gitleaks status is required with a report")
            return report_gitleaks(args.gitleaks_report, args.gitleaks_status)
        if args.tree_ref:
            findings, unreadable = scan_tree(ROOT, args.tree_ref)
            print(f"Existing-tree audit: {len(findings)} private-detail finding(s)")
            for finding in findings:
                print(_safe_finding_line(finding))
            if unreadable:
                print(f"FAIL existing-tree audit could not read {len(unreadable)} tracked file(s)")
                return 2
            print("Committed-tree audit completed; no baseline was created")
            return 1 if findings else 0
        if not args.head:
            raise RuntimeError("--head is required for a range scan")
        validate_ignore_policy(
            ROOT,
            args.trusted_gitleaks_ignore,
            args.candidate_gitleaks_ignore,
            allow_historical_additions=args.allow_historical_gitleaks_ignore_additions,
            trusted_base=args.trusted_base,
        )
        result = scan_range(ROOT, args.base, args.head, root=args.root)
        return _print_range_result(result)
    except (OSError, RuntimeError, ValueError) as exc:
        # Do not echo exception details: Git can include private paths or
        # scanner diagnostics. The stable message is sufficient for CI triage.
        print(f"FAIL publication-safety check could not complete: {type(exc).__name__}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
