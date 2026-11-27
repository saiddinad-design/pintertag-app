"""One screen in other forms: the free rules of the map (layout without texts, a fresh start)
and the merges Claude proposes on demand (scripts/merge_screens.py), offline."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from xml.sax.saxutils import quoteattr

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import dashboard  # noqa: E402
import merge_screens  # noqa: E402


def tree(*nodes):
    body = "".join(f'<node class="android.view.{kind}" package="app" text={quoteattr(text)} content-desc="" resource-id="" '
                   f'clickable="{str(tap).lower()}" bounds="[0,{i * 100}][500,{i * 100 + 90}]"/>'
                   for i, (kind, text, tap) in enumerate(nodes))
    return f'<?xml version="1.0"?><hierarchy><node class="android.widget.FrameLayout" package="app" bounds="[0,0][1080,1920]">{body}</node></hierarchy>'


HOME_EN = tree(("View", "Home", False), ("Button", "Send", True), ("Button", "Receive", True), ("Button", "Settings", True))
HOME_JA = tree(("View", "ホーム", False), ("Button", "送信", True), ("Button", "受信", True), ("Button", "設定", True))
FORM_EN = tree(("View", "Write to us", False), ("EditText", "Message", True), ("EditText", "Email", True),
               ("CheckBox", "Copy to me", True), ("Button", "Send", True), ("Button", "Cancel", True))
HELP_EN = tree(("View", "Help", False), ("Button", "Contact", True), ("Button", "FAQ", True), ("Button", "Terms", True))
TABLET = tree(("View", "Home", False), ("ScrollView", "", False), ("Button", "Send", True), ("Switch", "Receive", True),
              ("CheckBox", "Quick save", True), ("Button", "Settings", True), ("ImageView", "", False))


def tester(root, name, locale, screens, fresh=True):
    folder = root / name / "results" / name
    folder.mkdir(parents=True)
    steps = [{"id": "s1", "action": {"kind": "launchApp", "appId": "app", "clearState": fresh}}]
    for i, xml in enumerate(screens, 1):
        nn = f"{i:02d}"
        (folder / f"{nn}.xml").write_text(xml, encoding="utf-8")
        (folder / f"{nn}.png").write_bytes(b"png")
        steps.append({"id": f"s{i + 1}", "action": {"kind": "back"}, "evidence": {"screen": nn}})
    (folder / "trace.json").write_text(json.dumps({"schema": "ecr.trace/0", "app": {"id": "app"}, "steps": steps,
                                                   "persona": {"id": name, "locale": locale, "context": {"device": "Pixel 7"}},
                                                   "evidence": {"lastScreen": nn}}), encoding="utf-8")


class FreeRules(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())

    def groups(self):
        run = dashboard.load_run(self.root)
        return run, {p["key"].split("/")[0]: {nn: s["group"] for nn, s in p["screens"].items()} for p in run["personas"]}

    def test_one_screen_in_two_languages_with_no_ids_is_one_card(self):
        tester(self.root, "anna", "en-GB", [HOME_EN, FORM_EN])
        tester(self.root, "kenji", "ja-JP", [HOME_JA], fresh=False)
        _, g = self.groups()
        self.assertEqual(g["anna"]["01"], g["kenji"]["01"])
        self.assertNotEqual(g["anna"]["01"], g["anna"]["02"])

    def test_one_tester_two_screens_with_the_same_layout_stay_apart(self):
        tester(self.root, "anna", "en-GB", [HOME_EN, HELP_EN])
        _, g = self.groups()
        self.assertNotEqual(g["anna"]["01"], g["anna"]["02"])

    def test_the_first_screen_after_a_fresh_start_is_one_card_on_a_tablet_too(self):
        tester(self.root, "anna", "en-GB", [HOME_EN])
        tester(self.root, "lucia", "es-ES", [TABLET])
        _, g = self.groups()
        self.assertEqual(g["anna"]["01"], g["lucia"]["01"])

    def test_a_tablet_screen_further_in_stays_its_own_card(self):
        tester(self.root, "anna", "en-GB", [FORM_EN, HOME_EN])
        tester(self.root, "lucia", "es-ES", [FORM_EN, TABLET])
        _, g = self.groups()
        self.assertNotEqual(g["anna"]["02"], g["lucia"]["02"])


class ClaudePass(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        tester(self.root, "anna", "en-GB", [FORM_EN, HOME_EN])
        tester(self.root, "lucia", "es-ES", [FORM_EN, TABLET])
        run = dashboard.load_run(self.root)
        self.by = {p["key"].split("/")[0]: p for p in run["personas"]}
        self.home, self.tablet = self.by["anna"]["screens"]["02"]["group"], self.by["lucia"]["screens"]["02"]["group"]

    def test_dry_run_calls_nothing(self):
        with mock.patch.object(merge_screens.subprocess, "run") as run:
            self.assertEqual(merge_screens.main([str(self.root), "--dry-run"]), 0)
        run.assert_not_called()

    def test_merges_go_to_the_notes_and_reach_the_map(self):
        answer = json.dumps({"result": json.dumps({"same": [[self.home, self.tablet], ["g1", "nope"]]}), "total_cost_usd": 0.03})
        with mock.patch.object(merge_screens.shutil, "which", return_value="claude"), \
             mock.patch.object(merge_screens.subprocess, "run", return_value=mock.Mock(stdout=answer)) as run:
            self.assertEqual(merge_screens.main([str(self.root)]), 0)
        sent = run.call_args.kwargs["input"]
        self.assertIn("es-ES", sent)
        self.assertNotIn(".png", sent)
        notes = json.loads((self.root / "lucia/results/lucia/trace.notes.json").read_text())
        self.assertEqual(notes["sameAs"]["02"], {"key": "anna/results/anna", "nn": "02", "by": "claude"})

    def test_a_merge_made_by_hand_stays(self):
        path = self.root / "lucia/results/lucia/trace.notes.json"
        path.write_text(json.dumps({"screens": {}, "sameAs": {"02": {"key": "anna/results/anna", "nn": "01", "by": "you"}}}))
        run = dashboard.load_run(self.root)
        self.assertEqual(merge_screens.apply([self.root], run, [[self.home, self.tablet]]), 0)
        self.assertEqual(json.loads(path.read_text())["sameAs"]["02"]["by"], "you")


if __name__ == "__main__":
    unittest.main()
