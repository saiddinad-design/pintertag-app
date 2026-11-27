"""scripts/draft_issues.py: turns SUMMARY.md findings into draft GitHub issues locally,
tested offline with a stand-in for the GitHub CLI on PATH."""
import json, os, stat, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import draft_issues  # noqa: E402
import summarize  # noqa: E402

FAKE_GH = """#!{python}
import json, os, sys
from pathlib import Path

log_path, fail_on = Path(os.environ["FAKE_GH_LOG"]), os.environ.get("FAKE_GH_FAIL_ON", "")
body, args = sys.stdin.read(), sys.argv[1:]
title = args[args.index("--title") + 1] if "--title" in args and args.index("--title") + 1 < len(args) else ""
with log_path.open("a", encoding="utf-8") as fh:
    fh.write(json.dumps({{"args": args, "body": body}}) + "\\n")
if fail_on and fail_on in title:
    sys.stderr.write("HTTP 422: Validation Failed\\n")
    sys.exit(1)
with log_path.open(encoding="utf-8") as fh:
    count = sum(1 for _ in fh)
print(f"https://github.com/example/app/issues/{{count}}")
"""

RUN_FINDINGS = {
    "anna": {"score": 6, "issues": [
        {"title": "Send button cut at large text", "severity": "major", "screen": "Send", "screens": ["05", "06"]},
        {"title": "Icon buttons have no name", "severity": "minor", "screen": "Home", "screens": ["01"]}]},
    "noah": {"score": 8, "issues": [
        {"title": "send button cut at large text", "severity": "minor", "screen": "Send", "screens": ["04.png"]},
        {"title": "App crashes on rotate | landscape", "severity": "blocker", "screen": "Home", "screens": ["02"]}]},
    "kenji": {"score": 7, "issues": [
        {"title": "Icon buttons have no name", "severity": "minor", "screen": "Settings", "screens": ["08"]}]},
}


def write_run(base, findings):
    for persona, data in findings.items():
        folder = Path(base, persona, "results", persona)
        folder.mkdir(parents=True)
        (folder / "findings.json").write_text(json.dumps(data), encoding="utf-8")


class DraftIssuesEndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.run_dir = self.root / "run-123"
        write_run(self.run_dir, RUN_FINDINGS)
        proc = subprocess.run([sys.executable, str(ROOT / "scripts/summarize.py"), str(self.run_dir)],
                              env=dict(os.environ, SUMMARY_GROUPING="0"), capture_output=True, text=True, check=True)
        self.summary_path = self.run_dir / "SUMMARY.md"
        self.summary_path.write_text(proc.stdout, encoding="utf-8")
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        gh_path = self.bin_dir / "gh"
        gh_path.write_text(FAKE_GH.format(python=sys.executable), encoding="utf-8")
        gh_path.chmod(gh_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        self.log_path = self.root / "gh.jsonl"
        self.env = dict(os.environ, PATH=f"{self.bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
                        FAKE_GH_LOG=str(self.log_path))

    def tearDown(self):
        self.tmp.cleanup()

    def run_cli(self, *cli_args, stdin_text="", env_extra=None, cwd=None):
        env = dict(self.env, **(env_extra or {}))
        return subprocess.run([sys.executable, str(ROOT / "scripts/draft_issues.py"), *cli_args],
                              input=stdin_text, env=env, cwd=cwd, capture_output=True, text=True)

    def read_gh_calls(self):
        if not self.log_path.exists():
            return []
        return [json.loads(line) for line in self.log_path.read_text(encoding="utf-8").splitlines() if line]

    def test_dry_run_is_default_and_never_calls_gh(self):
        proc = self.run_cli(str(self.run_dir))
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(self.read_gh_calls(), [])
        self.assertIn("=== Draft 1/3 ===", proc.stdout)
        self.assertIn("Title: App crashes on rotate | landscape", proc.stdout)
        self.assertIn("Title: Send button cut at large text", proc.stdout)
        self.assertIn("`anna`, Small phone, Android 11 (en-GB, x1.3)", proc.stdout)
        self.assertIn("`noah`, iPhone 16 Pro Max, iOS 18 (en-US, extra-extra-extra-large)", proc.stdout)
        self.assertNotIn("—", proc.stdout)
        self.assertIn("`anna/results/anna/05.png`", proc.stdout)
        self.assertIn("`anna/results/anna/06.png`", proc.stdout)
        self.assertIn("`noah/results/noah/04.png`", proc.stdout)
        self.assertIn("Dry run: 3 draft issues shown, none created.", proc.stdout)

    def test_credit_line_and_how_to_remove_it(self):
        line = "Tested with [mobile-agent-testers](https://github.com/pierridotite/mobile-agent-testers)."
        proc = self.run_cli(str(self.run_dir), env_extra={"SUMMARY_CREDIT": "1"})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(proc.stdout.count(line), 3)
        proc = self.run_cli(str(self.run_dir), env_extra={"SUMMARY_CREDIT": "0"})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("=== Draft 3/3 ===", proc.stdout)
        self.assertNotIn("mobile-agent-testers", proc.stdout)

    def test_default_summary_in_cwd(self):
        proc = self.run_cli(cwd=self.run_dir)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(self.read_gh_calls(), [])
        self.assertIn("Dry run: 3 draft issues shown, none created.", proc.stdout)

    def test_explicit_dry_run_overrides_create(self):
        proc = self.run_cli(str(self.summary_path), "--create", "--dry-run", "--yes")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(self.read_gh_calls(), [])

    def test_create_requires_repo(self):
        for extra in ((), ("--yes",)):
            proc = self.run_cli(str(self.run_dir), "--create", *extra)
            self.assertEqual(proc.returncode, 2)
            self.assertIn("--repo", proc.stderr)
            self.assertEqual(self.read_gh_calls(), [])

    def test_confirmation_n_skips_and_y_creates(self):
        proc = self.run_cli(str(self.run_dir), "--create", "--repo", "you/app",
                            "--label", "bug", "--label", "mobile-agent-testers", stdin_text="n\ny\nn\n")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Create this issue in you/app? [y/N/a/q]", proc.stdout)
        calls = self.read_gh_calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["args"], [
            "issue", "create", "--title", "Send button cut at large text", "--body-file", "-",
            "--repo", "you/app", "--label", "bug", "--label", "mobile-agent-testers",
        ])
        self.assertIn("**Severity:** major", calls[0]["body"])
        self.assertIn("`anna/results/anna/05.png`", calls[0]["body"])
        self.assertIn("`noah/results/noah/04.png`", calls[0]["body"])
        self.assertIn("https://github.com/example/app/issues/1", proc.stdout)
        self.assertIn("Created 1, skipped 2, failed 0.", proc.stdout)

    def test_create_with_yes_opens_all_drafts_without_prompt(self):
        proc = self.run_cli(str(self.summary_path), "--create", "--yes", "--repo", "you/app")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        calls = self.read_gh_calls()
        self.assertEqual([c["args"][c["args"].index("--title") + 1] for c in calls], [
            "App crashes on rotate | landscape",
            "Send button cut at large text",
            "Icon buttons have no name",
        ])
        self.assertIn("Created 3, skipped 0, failed 0.", proc.stdout)

    def test_confirmation_a_creates_remaining_and_q_stops(self):
        proc = self.run_cli(str(self.run_dir), "--create", "--repo", "you/app", stdin_text="n\na\n")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(len(self.read_gh_calls()), 2)
        self.assertIn("Created 2, skipped 1, failed 0.", proc.stdout)
        self.log_path.unlink()
        proc2 = self.run_cli(str(self.run_dir), "--create", "--repo", "you/app", stdin_text="q\n")
        self.assertEqual(proc2.returncode, 0, proc2.stderr)
        self.assertEqual(self.read_gh_calls(), [])
        self.assertIn("Created 0, skipped 3, failed 0.", proc2.stdout)

    def test_gh_failure_reports_error_and_continues_batch(self):
        proc = self.run_cli(str(self.run_dir), "--create", "--yes", "--repo", "you/app",
                            env_extra={"FAKE_GH_FAIL_ON": "Send button"})
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(len(self.read_gh_calls()), 3)
        self.assertIn("HTTP 422: Validation Failed", proc.stderr)
        self.assertIn("Created 2, skipped 0, failed 1.", proc.stdout)

    def test_missing_gh_binary_is_handled_gracefully(self):
        empty_bin = self.root / "empty-bin"
        empty_bin.mkdir()
        proc = self.run_cli(str(self.run_dir), "--create", "--yes", "--repo", "you/app",
                            env_extra={"PATH": str(empty_bin)})
        self.assertEqual(proc.returncode, 1)
        self.assertIn("gh CLI not found on PATH", proc.stderr)

    def test_missing_summary_exits_nonzero(self):
        proc = self.run_cli(str(self.root / "does-not-exist"))
        self.assertEqual(proc.returncode, 1)
        self.assertIn("Summary not found", proc.stderr)

    def test_invalid_repo_and_label_rejected(self):
        for flag, val, expected in (
            ("--repo=--injected", None, "Invalid --repo"),
            ("--repo", "not a repo", "Invalid --repo"),
            ("--label=-x", None, "Invalid --label"),
        ):
            args = [str(self.run_dir), flag] + ([val] if val is not None else [])
            proc = self.run_cli(*args)
            self.assertEqual(proc.returncode, 2)
            self.assertIn(expected, proc.stderr)


class ParsingAndEdgeCases(unittest.TestCase):
    def test_zero_findings_normal_and_reproduction_summaries(self):
        with tempfile.TemporaryDirectory() as d:
            empty_normal = Path(d) / "empty.md"
            empty_normal.write_text(summarize.render([], [], [], False), encoding="utf-8")
            proc = subprocess.run([sys.executable, str(ROOT / "scripts/draft_issues.py"), str(empty_normal), "--create", "--yes", "--repo", "you/app"],
                                  env=dict(os.environ, PATH=""), capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn("No findings", proc.stdout)
            repro_md = summarize.render([], [], [], False, ([{"persona": "olga", "result": "no", "evidence": ["03"], "note": ""}], "Crash"))
            self.assertEqual(draft_issues.parse_summary(repro_md), [])

    def test_grouped_claude_summary_maps_sub_reports_and_screenshots(self):
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            write_run(run_dir, RUN_FINDINGS)
            findings, scores = summarize.load(run_dir)
            groups = [
                {"title": "Send button clipped", "class": "layout and text size", "ids": [1, 4]},
                {"title": "Unlabelled icons", "class": "accessibility", "ids": [2, 3]},
                {"title": "Crash on landscape rotate", "class": "crash", "ids": [5]},
            ]
            parsed = draft_issues.parse_summary(summarize.render(findings, scores, groups, True))
            self.assertEqual([p["title"] for p in parsed], ["Crash on landscape rotate", "Send button clipped", "Unlabelled icons"])
            draft = draft_issues.build_draft(parsed[1], summarize.personas_by_id(), draft_issues.load_persona_screenshots(run_dir))
            self.assertIn("**Class:** layout and text size", draft["body"])
            self.assertIn("### Agent reports", draft["body"])
            self.assertIn("`anna/results/anna/05.png`", draft["body"])
            self.assertIn("`noah/results/noah/04.png`", draft["body"])

    def test_duplicate_titles_and_malformed_rows_are_handled_safely(self):
        md = (
            "# Agent test summary\n\n"
            "| Severity | Issue | Personas | Screen |\n|---|---|---|---|\n"
            "| minor | Dup bug | 1 (anna) | Home |\n"
            "| major | dup bug | 1 (noah) | Settings |\n"
            "| broken row without enough cols |\n"
            "| major |   | 1 (anna) | Home |\n"
        )
        parsed = draft_issues.parse_summary(md)
        self.assertEqual(len(parsed), 1)
        self.assertEqual((parsed[0]["severity"], parsed[0]["personas"], parsed[0]["screens"]),
                         ("major", ["anna", "noah"], ["Home", "Settings"]))

    def test_walkthrough_summary_ignores_non_issue_tables(self):
        with tempfile.TemporaryDirectory() as d:
            write_run(d, {
                "anna": {"score": 5, "goal_reached": "partly", "actions": 20, "issues": [],
                         "improvements": [{"title": "Bigger Send button", "area": "layout", "impact": "high"}]},
                "noah": {"score": 8, "goal_reached": "yes", "actions": 12,
                         "issues": [{"title": "Typo on home", "severity": "cosmetic", "screen": "Home"}], "improvements": []},
            })
            findings, scores = summarize.load(d)
            md = summarize.render(findings, scores, summarize.group_by_title(findings), False, ([], ""), summarize.load_walkthrough(d))
            parsed = draft_issues.parse_summary(md)
            self.assertEqual([(p["title"], p["personas"]) for p in parsed], [("Typo on home", ["noah"])])

    def test_path_traversal_in_findings_screenshots_is_sanitized(self):
        with tempfile.TemporaryDirectory() as d:
            run_dir = Path(d)
            write_run(run_dir, {"anna": {"score": 5, "issues": [
                {"title": "Bad path", "severity": "minor", "screen": "Home",
                 "screens": ["../../secret.txt", "/etc/passwd", "..", ".hidden", "07"]}]}})
            self.assertEqual(draft_issues.load_persona_screenshots(run_dir)[("anna", "bad path")], ["anna/results/anna/07.png"])

    def test_create_issue_handles_missing_repo_file_not_found_and_timeout(self):
        draft = {"title": "Bug", "body": "Body\n"}
        ok, msg = draft_issues.create_issue("gh", draft, "")
        self.assertFalse(ok)
        self.assertIn("--repo", msg)
        with mock.patch.object(draft_issues.subprocess, "run", side_effect=FileNotFoundError()):
            ok, msg = draft_issues.create_issue("gh", draft, "you/app")
            self.assertFalse(ok)
            self.assertIn("not found", msg)
        with mock.patch.object(draft_issues.subprocess, "run", side_effect=subprocess.TimeoutExpired(cmd=["gh"], timeout=60)):
            ok, msg = draft_issues.create_issue("gh", draft, "you/app")
            self.assertFalse(ok)
            self.assertIn("timed out", msg)


if __name__ == "__main__":
    unittest.main()
