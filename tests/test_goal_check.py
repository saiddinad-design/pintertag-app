"""scripts/goal_check.py, offline."""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import goal_check  # noqa: E402

APP = "org.example.app"
TRACE = {"id": "anna-20261125T120000", "steps": [
    {"id": "s1", "action": {"kind": "launchApp", "appId": APP, "clearState": True},
     "checkpoints": [{"id": "a", "check": {"kind": "visible", "target": {"text": "Home"}}}]},
    {"id": "s2", "action": {"kind": "tapOn", "target": {"text": "Settings Tab 3 of 3"}},
     "checkpoints": [{"id": "b", "check": {"kind": "visible", "target": {"text": "Settings"}}},
                     {"id": "c", "check": {"kind": "visible", "target": {"text": "Dark  mode"}}}]},
    {"id": "s3", "action": {"kind": "swipe", "direction": "UP"}, "checkpoints": []}]}


def tree(*texts):
    nodes = "".join(f'<node text="{t}" content-desc="" bounds="[0,0][1,1]"/>' for t in texts)
    return f"<?xml version='1.0' encoding='UTF-8'?><hierarchy rotation=\"0\">{nodes}<node text=\"\" content-desc=\"Send&#10;Tab 2 of 3\"/></hierarchy>"


class GoalCheck(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        (self.dir / "traces" / "app" / "anna").mkdir(parents=True)
        (self.dir / "traces" / "app" / "anna" / "t.trace.json").write_text(json.dumps(TRACE))
        self.results = self.dir / "results" / "anna"
        self.results.mkdir(parents=True)

    def run_it(self, app=APP):
        printed = io.StringIO()
        with contextlib.redirect_stdout(printed):
            goal_check.main([str(self.results), "--persona", "anna", "--app-id", app, "--traces", str(self.dir / "traces")])
        return printed.getvalue()

    def test_reached_when_one_screen_shows_every_text_of_the_last_checked_step(self):
        (self.results / "01.xml").write_text(tree("Home"))
        (self.results / "02.xml").write_text(tree("Settings"))
        (self.results / "03.xml").write_text(tree("Settings", "Dark mode", "Language"))
        self.assertEqual(self.run_it(), "goal: anna-20261125T120000: screen of step s2 (2 texts), reached (first on screen 3 of 3)\n")

    def test_not_reached_when_the_texts_are_on_different_screens(self):
        (self.results / "01.xml").write_text(tree("Settings"))
        (self.results / "02.xml").write_text(tree("Dark mode"))
        printed = self.run_it()
        self.assertIn("not reached on 2 screens", printed)
        self.assertNotIn("Settings\n", printed.split(":", 2)[2])   # no text of the app

    def test_traces_of_another_app_are_left_out(self):
        (self.results / "01.xml").write_text(tree("Settings", "Dark mode"))
        self.assertEqual(self.run_it(app="com.other"), "")

    def test_spaces_and_line_breaks_count_as_one_space(self):
        self.assertIn("Send Tab 2 of 3", goal_check.texts_of(self._write(tree())))

    def _write(self, text):
        path = self.results / "x.xml"
        path.write_text(text)
        return path


if __name__ == "__main__":
    unittest.main()
