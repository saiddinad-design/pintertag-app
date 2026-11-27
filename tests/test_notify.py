"""scripts/notify.py: the opt-in Slack or Discord post of a run summary, offline."""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tests"))
import notify  # noqa: E402
import summarize  # noqa: E402
from test_summarize import FINDINGS, write_run  # noqa: E402

SLACK = "https://hooks.slack.com/services/T000/B000/fakefakefake"
DISCORD = "https://discord.com/api/webhooks/123/fake-token"


class FakeResponse:
    def __init__(self, status=200):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class Recorder:
    """Stands in for urlopen: keeps each request, answers with a status or raises."""
    def __init__(self, status=200, error=None):
        self.status, self.error, self.requests = status, error, []

    def __call__(self, req, timeout=None):
        self.requests.append(req)
        if self.error:
            raise self.error
        return FakeResponse(self.status)


def run_post(url, text, opener):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        ok = notify.post(url, text, opener=opener)
    return ok, out.getvalue() + err.getvalue()


class Message(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        write_run(self.tmp.name, FINDINGS)
        self.findings, self.scores = summarize.load(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_counts_and_most_severe_first(self):
        text = notify.message(self.findings, self.scores)
        lines = text.splitlines()
        self.assertEqual(lines[0], "Agent test run: 3 distinct bugs from 5 reports by 3 personas, "
                                   "average score 7.0/10.")
        self.assertIn("[blocker] App crashes on rotate | landscape (1: noah)", lines[1])
        self.assertIn("(2: anna, noah)", lines[2])
        self.assertIn("(2: anna, kenji)", lines[3])

    def test_only_the_top_ones(self):
        text = notify.message(self.findings, self.scores, top=1)
        self.assertEqual(len(text.splitlines()), 3)
        self.assertTrue(text.endswith("...and 2 more in SUMMARY.md."))

    def test_no_issues(self):
        self.assertEqual(notify.message([], []), "Agent test run: no issues reported.")

    def test_long_titles_and_message_are_cut(self):
        findings = [{"id": i + 1, "persona": f"p{i}", "severity": "minor", "title": f"{i} " + "x" * 300,
                     "screen": ""} for i in range(40)]
        text = notify.message(findings, [], top=40)
        self.assertLessEqual(len(text), notify.LIMIT)
        self.assertNotIn("x" * 121, text)


class Post(unittest.TestCase):
    def test_slack_payload(self):
        rec = Recorder()
        ok, shown = run_post(SLACK, "hello", rec)
        self.assertTrue(ok)
        self.assertEqual(json.loads(rec.requests[0].data), {"text": "hello"})
        self.assertEqual(rec.requests[0].get_method(), "POST")
        self.assertIn("Slack", shown)
        self.assertNotIn("fakefakefake", shown)

    def test_discord_payload_from_the_host(self):
        rec = Recorder(status=204)
        ok, shown = run_post(DISCORD, "hello", rec)
        self.assertTrue(ok)
        self.assertEqual(json.loads(rec.requests[0].data),
                         {"content": "hello", "allowed_mentions": {"parse": []}})
        self.assertNotIn("fake-token", shown)

    def test_titles_cannot_mention_the_channel(self):
        findings = [{"id": 1, "persona": "anna", "severity": "major",
                     "title": "Tap @everyone and <!channel> & confirm", "screen": ""}]
        text = notify.message(findings, [])
        self.assertIn("@everyone", text)
        self.assertIn("<!channel>", text)
        rec = Recorder()
        ok, _ = run_post(SLACK, text, rec)
        self.assertTrue(ok)
        slack = json.loads(rec.requests[0].data)["text"]
        self.assertIn("@everyone", slack)
        self.assertIn("&lt;!channel&gt;", slack)
        self.assertNotIn("<!channel>", slack)
        self.assertIn("&amp; confirm", slack)
        rec2 = Recorder(status=204)
        ok, _ = run_post(DISCORD, text, rec2)
        self.assertTrue(ok)
        body = json.loads(rec2.requests[0].data)
        self.assertEqual(body["content"], text)
        self.assertEqual(body["allowed_mentions"], {"parse": []})

    def test_kind_override_and_lookalike_host(self):
        self.assertEqual(notify.kind("https://notdiscordapp.com/x"), "slack")
        self.assertEqual(notify.kind("https://ptb.discord.com/api/webhooks/1/x"), "discord")
        with mock.patch.dict(os.environ, {"SUMMARY_WEBHOOK_KIND": "discord"}):
            self.assertEqual(notify.kind("https://chat.example.com/hook"), "discord")

    def test_http_error_is_reported_without_the_url(self):
        err = urllib.error.HTTPError(SLACK, 404, "no_service", {}, None)
        ok, shown = run_post(SLACK, "hello", Recorder(error=err))
        self.assertFalse(ok)
        self.assertIn("HTTP 404", shown)
        self.assertNotIn("fakefakefake", shown)

    def test_offline_does_not_raise(self):
        ok, shown = run_post(SLACK, "hello", Recorder(error=OSError("down")))
        self.assertFalse(ok)
        self.assertIn("OSError", shown)

    def test_plain_http_is_refused(self):
        rec = Recorder()
        ok, shown = run_post("http://hooks.slack.com/services/x", "hello", rec)
        self.assertFalse(ok)
        self.assertEqual(rec.requests, [])


class Main(unittest.TestCase):
    def test_nothing_happens_without_the_variable(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"SUMMARY_WEBHOOK_URL": ""}), \
                mock.patch.object(sys, "argv", ["notify.py", tmp]), \
                mock.patch.object(notify, "post") as post:
            self.assertEqual(notify.main(), 0)
            post.assert_not_called()

    def test_posts_the_run(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"SUMMARY_WEBHOOK_URL": SLACK}), \
                mock.patch.object(sys, "argv", ["notify.py", tmp]), \
                mock.patch.object(notify, "post", return_value=True) as post:
            write_run(tmp, FINDINGS)
            self.assertEqual(notify.main(), 0)
            url, text = post.call_args[0]
            self.assertEqual(url, SLACK)
            self.assertIn("3 distinct bugs", text)

    def test_credit_line_and_how_to_remove_it(self):
        line = f"Tested with mobile-agent-testers: {summarize.REPO}"
        for value, expected in (("1", True), ("0", False)):
            with tempfile.TemporaryDirectory() as tmp, \
                    mock.patch.dict(os.environ, {"SUMMARY_WEBHOOK_URL": DISCORD, "SUMMARY_CREDIT": value}), \
                    mock.patch.object(sys, "argv", ["notify.py", tmp]), \
                    mock.patch.object(notify, "post", return_value=True) as post:
                write_run(tmp, FINDINGS)
                self.assertEqual(notify.main(), 0)
                text = post.call_args[0][1]
                self.assertEqual(text.endswith("\n" + line), expected)
                self.assertEqual("mobile-agent-testers" in text, expected)
                self.assertLess(len(text), 2000)


if __name__ == "__main__":
    unittest.main()
