"""scripts/repair.py through scripts/replay_set.py --repair, offline: stand-ins for the agent, Explore-Compile-Replay and the phone."""
import contextlib
import io
import json
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tests"))
import repair  # noqa: E402
import test_replay_set as base  # noqa: E402


class Tools(base.Tools):
    """Replays of the original trace fail at s3; a repaired one passes. The agent answers from a list."""

    def __init__(self, answers, refusals=(), **more):
        super().__init__(outcomes={"open": "fail", "cut": "fail"}, **more)   # stops at s3
        self.answers, self.refusals, self.prompts = list(answers), list(refusals), []

    def __call__(self, args, cwd, env, timeout):
        if args[0] == "claude":
            self.calls.append(args)
            self.envs.append(env)
            self.prompts.append(args[2])
            answer = self.answers.pop(0)
            return 0, json.dumps({"result": answer, "total_cost_usd": 0.0123, "num_turns": 2, "duration_ms": 9000,
                                  "usage": {"input_tokens": 10, "output_tokens": 50}, "modelUsage": {"claude-sonnet-5-5": {}}})
        if args[0] == "python3" and args[1].endswith("screen.py"):
            self.calls.append(args)
            self.envs.append(env)
            return 0, '- button "Send ›\nTab 2 of 3" centre=(270,2300)\n'
        if "repair" in args:
            self.calls.append(args)
            self.envs.append(env)
            if self.refusals:
                reason = self.refusals.pop(0)
                return 1, f"REFUSED  t  step s3 ({reason})\n      no\n"
            path = Path(args[args.index("repair") + 1])
            trace = json.loads(path.read_text())
            action = json.loads(args[args.index("--action") + 1])
            for step in trace["steps"]:
                if step["id"] == args[args.index("--step") + 1]:
                    step["action"] = action
            path.write_text(json.dumps(trace))
            return 0, "repaired  t  step s3 (maestro)\n"
        if "replay" in args and "attempt-" in " ".join(args):
            self.calls.append(args)
            self.envs.append(env)
            report = Path(args[args.index("--report") + 1])
            report.write_text(json.dumps({"traces": [{"recorded": "pass", "replays": [{"outcome": "pass", "durationMs": 1, "divergences": []}]}]}))
            return 0, "pass\n"
        return super().__call__(args, cwd, env, timeout)


GOOD = '{"stepId": "s3", "action": {"kind": "tapOn", "target": {"text": "Send ›\\nTab 2 of 3"}}, "why": "renamed"}'


class Repair(unittest.TestCase):
    setUp = base.ReplaySet.setUp

    def run_repair(self, tools, *more):
        printed = io.StringIO()
        with contextlib.redirect_stdout(printed):
            code = base.replay_set.main([str(self.folder), "--persona", "anna", "--ecr", str(self.dir), "--out", str(self.out),
                                         "--times", "3", "--repair", "3", *more], run=tools)
        self.assertEqual(code, 0)
        return printed.getvalue(), json.loads((self.out / "replays.json").read_text())

    def test_an_accepted_proposal_is_replayed_three_times_and_keeps_the_checks(self):
        tools = Tools([GOOD])
        printed, kept = self.run_repair(tools)
        attempt = kept["repairs"][0]["attempts"][0]
        self.assertEqual(attempt["result"], "accepted")
        self.assertEqual(attempt["stop"], {"type": "target_not_found", "stepId": "s3"})
        self.assertEqual(attempt["action"], "tapOn by name")
        self.assertEqual(attempt["replaysAfter"], ["pass"] * 3)
        self.assertTrue(attempt["oraclesKept"])
        self.assertEqual(attempt["cost"]["price_usd"], 0.0123)
        self.assertIn("repairs: anna-20261125T120000 attempt 1: stop target_not_found at step s3; proposed step s3, tapOn by name: accepted, "
                      "then 3 of 3 replays pass, checks unchanged; agent $0.0123, 2 turns, 50 tokens out", printed)
        self.assertNotIn("Tab 2 of 3", printed)   # texts of the app stay private by default
        self.assertNotIn("Tab 2 of 3", json.dumps(kept))
        private = json.loads((self.out / "repairs-private.json").read_text())
        self.assertEqual(private[0]["attempts"][0]["proposal"]["action"]["target"]["text"], "Send ›\nTab 2 of 3")

    def test_refusals_go_into_the_next_prompt_and_stop_after_three(self):
        tools = Tools([GOOD, GOOD, '{"stepId": "s3", "action": null, "why": "a new step is needed"}'], refusals=["still_diverges", "not_local"])
        printed, kept = self.run_repair(tools)
        results = [a["result"] for a in kept["repairs"][0]["attempts"]]
        self.assertEqual(results, ["refused: still_diverges", "refused: not_local", "no_proposal"])
        self.assertIn("refused, still_diverges", tools.prompts[1])
        self.assertIn("refused, not_local", tools.prompts[2])
        self.assertNotIn("Earlier proposals", tools.prompts[0])

    def test_the_agent_never_sees_checks_typed_texts_or_the_secret_of_typed_texts(self):
        trace = dict(base.TRACE)
        trace["steps"] = [dict(step) for step in base.TRACE["steps"]]
        trace["steps"][1]["checkpoints"] = [{"id": "ai-s2-send", "check": {"kind": "visible", "target": {"text": "Nearby devices"}}}]
        (self.folder / "anna" / "first.trace.json").write_text(json.dumps(trace), encoding="utf-8")
        tools = Tools([GOOD])
        os.environ.update(CLAUDE_CODE_OAUTH_TOKEN="tok", REPLAY_PARAMS=json.dumps({base.TRACE["id"]: {"TEXT_1": "secret text"}}))
        try:
            printed, _ = self.run_repair(tools)
        finally:
            del os.environ["CLAUDE_CODE_OAUTH_TOKEN"], os.environ["REPLAY_PARAMS"]
        prompt = tools.prompts[0]
        self.assertNotIn("Nearby devices", prompt)
        self.assertNotIn("ai-s2-send", prompt)
        self.assertNotIn(base.TYPED, prompt)
        self.assertNotIn("secret text", prompt)
        self.assertIn('"param": "TEXT_1"', prompt)
        agent_env = [env for args, env in zip(tools.calls, tools.envs) if args[0] == "claude"][0]
        self.assertEqual(agent_env["CLAUDE_CODE_OAUTH_TOKEN"], "tok")
        self.assertNotIn("REPLAY_PARAMS", agent_env)
        repair_env = [env for args, env in zip(tools.calls, tools.envs) if "repair" in args][0]
        self.assertNotIn("CLAUDE_CODE_OAUTH_TOKEN", repair_env)
        self.assertNotIn("secret text", printed)

    def test_public_proposals_show_the_action_but_never_a_typed_text(self):
        tools = Tools(['{"stepId": "s3", "action": {"kind": "inputText", "text": "typed by the agent"}}', GOOD], refusals=["still_diverges"])
        os.environ["PUBLIC_PROPOSALS"] = "true"
        try:
            printed, kept = self.run_repair(tools)
        finally:
            del os.environ["PUBLIC_PROPOSALS"]
        self.assertNotIn("typed by the agent", printed)
        self.assertIn("(typed text left out)", printed)
        self.assertIn('"target":{"text":"Send ›\\nTab 2 of 3"}', printed)
        self.assertEqual(kept["repairs"][0]["attempts"][1]["proposal"]["stepId"], "s3")

    def test_no_repair_when_every_replay_gives_what_was_recorded(self):
        tools = base.Tools()
        printed = io.StringIO()
        with contextlib.redirect_stdout(printed):
            base.replay_set.main([str(self.folder), "--persona", "anna", "--ecr", str(self.dir), "--out", str(self.out), "--times", "2", "--repair", "3"], run=tools)
        self.assertNotIn("repairs:", printed.getvalue())
        self.assertFalse(any(args[0] == "claude" for args in tools.calls))


class Helpers(unittest.TestCase):
    def test_the_hash_of_the_checks_changes_only_with_the_checks(self):
        trace = json.loads(json.dumps(base.TRACE))
        before = repair.oracles_sha256(trace)
        trace["steps"][1]["action"] = {"kind": "tapOn", "target": {"text": "Other"}}
        self.assertEqual(repair.oracles_sha256(trace), before)
        trace["steps"][1]["checkpoints"] = [{"id": "x", "check": {"kind": "visible", "target": {"text": "A"}}}]
        self.assertNotEqual(repair.oracles_sha256(trace), before)

    def test_the_last_json_object_of_an_answer_is_the_proposal(self):
        self.assertEqual(repair.last_json_object('Here: {"a": 1} then {"stepId": "s3", "action": {"kind": "hideKeyboard"}}'),
                         {"stepId": "s3", "action": {"kind": "hideKeyboard"}})
        self.assertIsNone(repair.last_json_object("no json here"))


if __name__ == "__main__":
    unittest.main()
