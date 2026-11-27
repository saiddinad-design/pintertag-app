"""scripts/ecr_replay.py, offline: a stand-in for Explore-Compile-Replay and Maestro, no phone."""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import ecr_replay as replayer  # noqa: E402

TRACE = {"schema": "ecr.trace/0", "id": "anna-20261125T120000", "adapter": {"id": "mobile-maestro"},
         "params": [{"name": "TEXT_1", "secret": True}], "invariants": [],
         "steps": [{"id": "s1", "action": {"kind": "launchApp", "appId": "com.example.todo"}, "checkpoints": []},
                   {"id": "s2", "action": {"kind": "tapOn", "target": {"text": "Sign in"}}, "checkpoints": []},
                   {"id": "s3", "action": {"kind": "inputText", "text": {"param": "TEXT_1"}}, "checkpoints": []}],
         "provenance": {"exploredAt": "2026-11-25T12:00:00Z"}}
TYPED = "anna@example.com"
PASS = "pass  anna-20261125T120000 (maestro, 41234 ms)\n"
FAIL = ("FAIL  anna-20261125T120000 (maestro, 38400 ms)\n"
        '      target_not_found  step s2: Element not found: Text matching regex: Sign in\n')
BUG = ("bug   anna-20261125T120000 (maestro, 65996 ms)\n"
       '      oracle_failed  step s3  oracle counter-singular: Assertion is false: "1 task" is visible\n'
       "      This oracle was recorded as a bug, and the bug is still there. The steps after it did not run.\n")


class Parts(unittest.TestCase):
    def test_tools_get_no_secret_and_the_typed_texts(self):
        env = {"PATH": "/usr/bin", "ANDROID_HOME": "/sdk", "CLAUDE_CODE_OAUTH_TOKEN": "t", "ANTHROPIC_API_KEY": "k",
               "LLM_API_KEY": "k", "LLM_BASE_URL": "https://example.com", "ARTIFACT_PASSPHRASE": "p", "GH_TOKEN": "g"}
        tools = replayer.tool_env(env, {"TEXT_1": TYPED}, Path("/tmp/debug"))
        self.assertEqual({"PATH", "ANDROID_HOME", "ECR_PARAM_TEXT_1", "ECR_MAESTRO_DEBUG", "MAESTRO_CLI_NO_ANALYTICS"}, set(tools))
        self.assertEqual(TYPED, tools["ECR_PARAM_TEXT_1"])

    def test_reads_a_pass(self):
        self.assertEqual({"status": "pass", "ms": 41234}, replayer.read_result("Maestro said things\n" + PASS))

    def test_reads_where_and_why_it_stopped(self):
        self.assertEqual({"status": "fail", "ms": 38400, "reason": "target_not_found", "step": "s2"}, replayer.read_result(FAIL))

    def test_reads_a_known_bug(self):
        self.assertEqual({"status": "known_bug", "ms": 65996, "reason": "oracle_failed", "step": "s3", "oracle": "counter-singular"},
                         replayer.read_result(BUG))

    def test_no_result_when_the_tool_crashed(self):
        self.assertIsNone(replayer.read_result("Error: Could not run Maestro: spawn maestro ENOENT\n"))

    def test_the_kind_of_a_step_uses_words_of_the_format_only(self):
        kind = lambda action: replayer.kind_of({"id": "s1", "action": action})  # noqa: E731
        self.assertEqual("tapOn by name", kind({"kind": "tapOn", "target": {"text": "Sign in"}}))
        self.assertEqual("tapOn by name, one of several", kind({"kind": "tapOn", "target": {"text": {"param": "TEXT_1"}, "index": 1}}))
        self.assertEqual("tapOn by id", kind({"kind": "tapOn", "target": {"id": "app:id/submit"}}))
        self.assertEqual("tapOn by point", kind({"kind": "tapOn", "target": {"point": "50%,50%"}}))
        self.assertEqual("inputText", kind({"kind": "inputText", "text": {"param": "TEXT_1"}}))
        self.assertEqual("", kind({"kind": "a text of the app, by mistake"}))
        self.assertEqual("", replayer.kind_of("not a step"))

    def test_summary_lines(self):
        ids = ["s1", "s2", "s3"]
        self.assertEqual("pass, 3 steps with no model in 41 s", replayer.summary(replayer.read_result(PASS), ids))
        self.assertEqual("stopped at step 2 of 3 (target_not_found), after 38 s", replayer.summary(replayer.read_result(FAIL), ids))
        self.assertEqual("stopped at step 2 of 3 (target_not_found, tapOn by name, after launchApp), after 38 s",
                         replayer.summary(replayer.read_result(FAIL), ids, TRACE["steps"]))
        self.assertEqual("the bug is still there at step 3 of 3 (oracle_failed), after 66 s", replayer.summary(replayer.read_result(BUG), ids))
        self.assertEqual("no trace, nothing to replay", replayer.summary({"status": "no_trace"}, []))
        self.assertIn("replay.txt", replayer.summary({"status": "invalid"}, ids))


class Run(unittest.TestCase):
    def setUp(self):
        self.results = Path(tempfile.mkdtemp()) / "anna"
        self.results.mkdir()
        (self.results / "trace.json").write_text(json.dumps(TRACE), encoding="utf-8")
        (self.results / "trace.params.json").write_text(json.dumps({"TEXT_1": TYPED}), encoding="utf-8")
        self.calls, self.phone_calls = [], []

    def tool(self, answers, phone=None):
        def run(args, cwd, env, timeout):
            if args[0] == "adb":   # the phone: silent unless a test gives it answers
                self.phone_calls.append((args, env))
                return next((answer for word, answer in (phone or {}).items() if word in args), (1, "no device\n"))
            self.calls.append((args, cwd, env))
            return answers[args[2]]
        return run

    def main(self, answers, summary_file=None, phone=None):
        env = {"PATH": os.environ.get("PATH", ""), "CLAUDE_CODE_OAUTH_TOKEN": "secret-token"}
        if summary_file:
            env.update(GITHUB_ACTIONS="true", GITHUB_STEP_SUMMARY=str(summary_file))
        out = io.StringIO()
        with mock.patch.dict(os.environ, env, clear=True), contextlib.redirect_stdout(out):
            code = replayer.main([str(self.results), "--ecr", "/ecr", "--persona", "anna"], run=self.tool(answers, phone))
        return code, out.getvalue()

    def test_a_replay_that_does_not_pass_says_what_the_phone_showed(self):
        phone = {"date": (0, "1764100800\n"), "pidof": (1, ""), "/proc/loadavg": (0, "7.91 5.02 3.00 4/310 999\n"),
                 "logcat": (0, "I ActivityTaskManager: Displayed com.example.todo/.MainActivity for user 0: +21s40ms\n"
                               "E ActivityManager: ANR in com.android.systemui\n"),
                 "dumpsys": (0, "mCurrentFocus=Window{77 u0 Application Not Responding: com.android.systemui}\n")}
        code, printed = self.main({"validate": (0, "ok\n"), "compile": (0, "wrote\n"), "replay": (1, FAIL)}, phone=phone)
        self.assertEqual(0, code)
        self.assertIn("after 38 s; on screen: a window that does not respond, of the system, the app not running; "
                      "the screen tree could not be read; app start 21 s; "   # this phone gives no tree
                      "in the log the app was cleared 0, stopped 0 and launched 0 times; not responding: the system; no crash; load 7.9 on the phone", printed)
        kept = json.loads((self.results / "replay.json").read_text())
        self.assertNotIn("freshStart", kept)   # the trace does not ask for a fresh state: the app is not cleared
        self.assertEqual(kept["device"]["inFront"], "a window that does not respond, of the system")
        self.assertNotIn("CLAUDE_CODE_OAUTH_TOKEN", self.phone_calls[0][1])

    def test_a_step_that_finds_nothing_says_what_is_now_where_its_element_was(self):
        trace = json.loads((self.results / "trace.json").read_text())
        trace["steps"][1]["action"]["target"] = {"text": "Smart Banana"}   # a name the app draws at random on each first start
        trace["steps"][1]["evidence"] = {"point": [540, 660], "bounds": [40, 600, 1040, 720], "size": [1080, 2400]}
        (self.results / "trace.json").write_text(json.dumps(trace))
        now = ("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\">"
               '<node text="" package="com.example.todo" bounds="[0,0][1080,2400]">'
               '<node text="" content-desc="Brave Apple" package="com.example.todo" clickable="true" bounds="[40,604][1040,722]" />'
               '<node text="Settings" package="com.example.todo" bounds="[0,2200][1080,2400]" /></node></hierarchy>')
        phone = {"date": (0, "1764100800\n"), "pidof": (0, "4242\n"), "logcat": (0, ""), "exec-out": (0, now),
                 "input_method": (0, "  mShowRequested=false mShowExplicitlyRequested=false mShowForced=false mInputShown=false\n"),
                 "dumpsys": (0, "mCurrentFocus=Window{77 u0 com.example.todo/com.example.todo.MainActivity}\n")}
        code, printed = self.main({"validate": (0, "ok\n"), "compile": (0, "wrote\n"), "replay": (1, FAIL)}, phone=phone)
        self.assertEqual(0, code)
        self.assertIn("; keyboard closed; the element the step looked for: not on the screen, and where it was when explored, "
                      "an element of the same size with another name;", printed)
        self.assertNotIn("Banana", printed)
        self.assertNotIn("Apple", printed)
        kept = json.loads((self.results / "replay.json").read_text())
        self.assertEqual({"name": "not on the screen", "place": "an element of the same size with another name"}, kept["device"]["target"])
        self.assertIs(False, kept["device"]["keyboard"])
        self.assertNotIn("Apple", (self.results / "replay.json").read_text())

    def test_a_replay_that_passes_keeps_only_the_start_time_of_the_app(self):
        phone = {"date": (0, "1764100800\n"), "logcat": (0, "I ActivityTaskManager: Displayed com.example.todo/.MainActivity: +1s200ms\n")}
        code, printed = self.main({"validate": (0, "ok\n"), "compile": (0, "wrote\n"), "replay": (0, PASS)}, phone=phone)
        self.assertEqual((0, "replay: pass, 3 steps with no model in 41 s\n"), (code, printed))
        self.assertEqual({"appStartSeconds": [1.2], "appCleared": 0, "appStopped": 0, "appLaunched": 0},
                         json.loads((self.results / "replay.json").read_text())["device"])

    def test_a_trace_that_asks_for_a_fresh_state_gets_the_app_cleared_before_its_replay(self):
        trace = json.loads((self.results / "trace.json").read_text())
        trace["steps"][0]["action"]["clearState"] = True
        (self.results / "trace.json").write_text(json.dumps(trace))
        phone = {"force-stop": (0, ""), "clear": (0, "Success\n"), "date": (0, "1764100800\n"), "logcat": (0, "")}
        code, printed = self.main({"validate": (0, "ok\n"), "compile": (0, "wrote\n"), "replay": (0, PASS)}, phone=phone)
        self.assertEqual((0, "replay: pass, 3 steps with no model in 41 s\n"), (code, printed))
        self.assertTrue(json.loads((self.results / "replay.json").read_text())["freshStart"])
        self.assertEqual(["adb", "shell", "pm", "clear", "com.example.todo"], self.phone_calls[1][0])

    def test_pass(self):
        code, printed = self.main({"validate": (0, "ok\n"), "compile": (0, "wrote\n"), "replay": (0, PASS)})
        self.assertEqual((0, "replay: pass, 3 steps with no model in 41 s\n"), (code, printed))
        self.assertEqual({"status": "pass", "ms": 41234, "steps": 3}, json.loads((self.results / "replay.json").read_text()))
        self.assertEqual(["validate", "compile", "replay"], [args[2] for args, _, _ in self.calls])
        for args, cwd, env in self.calls:
            self.assertEqual("/ecr", cwd)
            self.assertNotIn("CLAUDE_CODE_OAUTH_TOKEN", env)
            self.assertEqual(TYPED, env["ECR_PARAM_TEXT_1"])
            self.assertTrue(Path(args[3]).is_absolute())

    def test_a_failed_replay_never_fails_the_run_and_prints_no_text_of_the_app(self):
        summary_file = self.results.parent / "summary.md"
        code, printed = self.main({"validate": (0, "ok\n"), "compile": (0, "wrote\n"), "replay": (1, FAIL)}, summary_file)
        self.assertEqual((0, "replay: stopped at step 2 of 3 (target_not_found, tapOn by name, after launchApp), after 38 s\n"), (code, printed))
        self.assertNotIn("Sign in", printed + summary_file.read_text())
        self.assertEqual("Replay of the path of anna: stopped at step 2 of 3 (target_not_found, tapOn by name, after launchApp), after 38 s\n", summary_file.read_text())
        self.assertIn("Sign in", (self.results / "replay.txt").read_text())   # kept for the owner, in the encrypted results
        kept = json.loads((self.results / "replay.json").read_text())
        self.assertEqual(("fail", "s2", 2, "target_not_found"), (kept["status"], kept["step"], kept["stepNumber"], kept["reason"]))

    def test_a_trace_that_is_not_accepted_is_not_replayed(self):
        code, printed = self.main({"validate": (1, "FAIL  trace.json\n      steps.1.action: unknown kind\n")})
        self.assertEqual(0, code)
        self.assertIn("does not accept the trace", printed)
        self.assertNotIn("unknown kind", printed)
        self.assertEqual(1, len(self.calls))

    def test_maestro_missing(self):
        code, printed = self.main({"validate": (0, ""), "compile": (0, ""), "replay": (1, "Error: Could not run Maestro\n")})
        self.assertEqual((0, "replay: could not run (replay.txt in the results)\n"), (code, printed))

    def test_too_long(self):
        code, printed = self.main({"validate": (0, ""), "compile": (0, ""), "replay": (124, "")})
        self.assertEqual((0, "replay: stopped, it took too long (replay.txt in the results)\n"), (code, printed))

    def test_no_trace_writes_nothing(self):
        (self.results / "trace.json").unlink()
        code, printed = self.main({})
        self.assertEqual((0, "replay: no trace, nothing to replay\n"), (code, printed))
        self.assertFalse((self.results / "replay.json").exists())


class Tool(unittest.TestCase):
    def test_a_missing_program_is_an_answer_not_a_crash(self):
        code, printed = replayer.run_tool(["no-such-program-anywhere"], None, {"PATH": ""}, 5)
        self.assertEqual(127, code)
        self.assertIn("no-such-program-anywhere", printed)

    def test_merges_what_a_program_prints(self):
        code, printed = replayer.run_tool([sys.executable, "-c", "import sys; print('a'); print('b', file=sys.stderr); sys.exit(3)"],
                                          None, dict(os.environ), 30)
        self.assertEqual(3, code)
        self.assertEqual({"a", "b"}, set(printed.split()))


class Check(unittest.TestCase):
    """The replay check on a phone (scripts/android/replay_check.py) cannot run here: only what it relies on."""

    def test_both_workflows_use_the_same_commit_of_explore_compile_replay(self):
        import re
        refs = set()
        for name in ("agent-testers.yml", "replay-check.yml"):
            text = (ROOT / ".github/workflows" / name).read_text(encoding="utf-8")
            found = re.findall(r"repository: pierridotite/explore-compile-replay\n\s+ref: (\S+)", text)
            self.assertEqual(1, len(found), name)
            self.assertRegex(found[0], r"^[0-9a-f]{40}$")   # a full commit, never a branch
            refs.add(found[0])
        self.assertEqual(1, len(refs))

    def test_the_scripted_tester_reads_what_screen_py_prints(self):
        import importlib.util
        import xml.etree.ElementTree as ET
        sys.path.insert(0, str(ROOT / "scripts/android"))
        import replay_check
        spec = importlib.util.spec_from_file_location("android_screen", ROOT / "scripts/android/screen.py")
        android_screen = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(android_screen)
        lines = android_screen.elements(
            ET.fromstring('<hierarchy><node clickable="true" text="Continue" bounds="[100,1100][980,1300]"/></hierarchy>'),
            1080, 2400,
        )
        found = replay_check.SEEN.match(lines[0])
        self.assertEqual(("Continue", "540", "1200"), found.groups()[1:])
        kinds = {kind for kind, _, _ in replay_check.STEPS}
        self.assertEqual({"tap", "type", "hide", "look", "keys"}, kinds)


if __name__ == "__main__":
    unittest.main()
