"""scripts/dashboard.py, offline: the demo run, the screen groups, what the server serves and writes (comments only)."""
import json
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import dashboard  # noqa: E402
import dashboard_demo  # noqa: E402


class Run(unittest.TestCase):
    def setUp(self):
        self.root = dashboard_demo.write(Path(tempfile.mkdtemp()))
        self.addCleanup(shutil.rmtree, self.root, True)

    def test_every_tester_of_the_demo_has_a_valid_path(self):
        run = dashboard.load_run(self.root)
        self.assertEqual(sorted(p["trace"]["persona"]["id"] for p in run["personas"]), ["anna", "kenji", "lucas", "lucia", "map"])
        for p in run["personas"]:
            self.assertTrue(p["screens"])
            self.assertTrue(all("_tokens" not in s for s in p["screens"].values()))
            self.assertIn("lastScreen", p["trace"]["evidence"])

    def test_the_tablet_shows_the_same_screens_in_its_own_shape(self):
        run = dashboard.load_run(self.root)
        by = {p["trace"]["persona"]["id"]: p for p in run["personas"]}
        lucia = by["lucia"]
        self.assertEqual(lucia["trace"]["persona"]["context"]["device"], "Pixel Tablet, Android 14")
        self.assertEqual(next(s["evidence"]["size"] for s in lucia["trace"]["steps"] if "evidence" in s), [1600, 2400])
        self.assertEqual(lucia["screens"]["01"]["group"], by["anna"]["screens"]["01"]["group"])   # the welcome screen, wider
        taps = [s["action"]["target"] for s in lucia["trace"]["steps"] if s["action"]["kind"] == "tapOn"]
        self.assertIn({"text": "Get started"}, taps)

    def test_the_same_screen_in_two_languages_is_one_group(self):
        run = dashboard.load_run(self.root)
        by = {p["trace"]["persona"]["id"]: p for p in run["personas"]}
        self.assertEqual(by["anna"]["screens"]["01"]["group"], by["lucas"]["screens"]["01"]["group"])   # English and French welcome
        self.assertNotEqual(by["anna"]["screens"]["01"]["group"], by["anna"]["screens"]["02"]["group"])
        self.assertEqual(run["groups"][by["anna"]["screens"]["02"]["group"]]["title"], "Create your account")

    def test_typed_texts_never_reach_the_page(self):
        for p in dashboard.load_run(self.root)["personas"]:
            self.assertNotIn("S3cret-pass", json.dumps(p))

    def test_check_trace(self):
        trace = json.loads(next(self.root.rglob("trace.json")).read_text())
        self.assertEqual(dashboard.check_trace(trace), [])
        broken = json.loads(json.dumps(trace))
        broken["steps"][2]["id"] = broken["steps"][1]["id"]
        self.assertIn("two steps have the same id", dashboard.check_trace(broken))
        moved = json.loads(json.dumps(trace))
        moved["steps"].reverse()
        self.assertIn("the first step of a mobile trace must be launchApp", dashboard.check_trace(moved))
        self.assertEqual(dashboard.check_trace([]), ["the trace is not a JSON object"])

    def test_the_map_maker_is_marked_and_finds_a_screen_no_persona_reached(self):
        run = dashboard.load_run(self.root)
        mapper = [p for p in run["personas"] if p["mapper"]]
        self.assertEqual([p["trace"]["persona"]["id"] for p in mapper], ["map"])
        groups = lambda ps: {s["group"] for p in ps for s in p["screens"].values()}
        others = [p for p in run["personas"] if not p["mapper"]]
        only_mapped = groups(mapper) - groups(others)
        self.assertEqual([run["groups"][g]["title"] for g in only_mapped], ["Help"])

    def test_two_runs_open_together_with_distinct_keys(self):
        other = dashboard_demo.write(Path(tempfile.mkdtemp()))
        self.addCleanup(shutil.rmtree, other, True)
        run = dashboard.load_run([self.root, other])
        keys = [p["key"] for p in run["personas"]]
        self.assertEqual(len(keys), 10)
        self.assertEqual(len(set(keys)), 10)
        self.assertTrue(all(k.startswith(("1:", "2:")) for k in keys))
        self.assertIn(other.resolve(), dashboard.locate([self.root, other], keys[-1]).parents)
        self.assertIsNone(dashboard.locate([self.root, other], "3:android-anna/results/anna"))
        self.assertIsNone(dashboard.locate([self.root, other], "1:../.."))
        bad = json.loads(json.dumps(trace))
        bad["steps"][1]["checkpoints"] = [{"id": "c", "check": {"kind": "looksNice", "target": {"text": "OK"}}}]
        self.assertIn("check c must say visible or notVisible, of a text or an id", dashboard.check_trace(bad))

    def test_the_map_maker_is_marked_and_finds_a_screen_no_persona_reached(self):
        run = dashboard.load_run(self.root)
        mapper = [p for p in run["personas"] if p["mapper"]]
        self.assertEqual([p["trace"]["persona"]["id"] for p in mapper], ["map"])
        groups = lambda ps: {s["group"] for p in ps for s in p["screens"].values()}
        others = [p for p in run["personas"] if not p["mapper"]]
        only_mapped = groups(mapper) - groups(others)
        self.assertEqual([run["groups"][g]["title"] for g in only_mapped], ["Help"])

    def test_two_runs_open_together_with_distinct_keys(self):
        other = dashboard_demo.write(Path(tempfile.mkdtemp()))
        self.addCleanup(shutil.rmtree, other, True)
        run = dashboard.load_run([self.root, other])
        keys = [p["key"] for p in run["personas"]]
        self.assertEqual(len(keys), 10)
        self.assertEqual(len(set(keys)), 10)
        self.assertTrue(all(k.startswith(("1:", "2:")) for k in keys))
        self.assertIn(other.resolve(), dashboard.locate([self.root, other], keys[-1]).parents)
        self.assertIsNone(dashboard.locate([self.root, other], "3:android-anna/results/anna"))
        self.assertIsNone(dashboard.locate([self.root, other], "1:../.."))


class Export(unittest.TestCase):
    def test_the_static_demo_has_the_page_the_run_and_every_screen(self):
        out = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, out, True)
        root = dashboard_demo.write(out / "run")
        dashboard.export(root, out / "site")
        run = json.loads((out / "site" / "api" / "run").read_text())
        self.assertTrue(run["static"])
        for name in ("index.html", "app.js", "style.css", "api/run.json"):
            self.assertTrue((out / "site" / name).exists(), name)
        for p in run["personas"]:
            for screen in p["screens"].values():
                self.assertTrue((out / "site" / screen["url"]).is_file())
        self.assertNotIn(str(root), json.dumps(run))   # no local path in a public file

    def test_a_real_run_is_never_exported(self):
        with self.assertRaises(SystemExit):
            dashboard.main(["runs/x", "--export", "site"])


class Server(unittest.TestCase):
    def setUp(self):
        self.root = dashboard_demo.write(Path(tempfile.mkdtemp()))
        self.addCleanup(shutil.rmtree, self.root, True)
        self.anna = self.root / "android-anna" / "results" / "anna"
        (self.anna / "trace.params.json").write_text('{"TEXT_1": "S3cret-pass"}')
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), dashboard.make_handler(dashboard.App(self.root)))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def get(self, path):
        try:
            with urllib.request.urlopen(self.base + path) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def post(self, path, body, header=True):
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", **({"X-Dashboard": "1"} if header else {})})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_the_page_and_the_run(self):
        self.assertEqual(self.get("/")[0], 200)
        self.assertEqual(self.get("/app.js")[0], 200)
        code, body = self.get("/api/run")
        self.assertEqual(code, 200)
        self.assertEqual(len(json.loads(body)["personas"]), 5)
        self.assertNotIn(b"S3cret-pass", body)

    def test_only_screenshots_are_served(self):
        key = "android-anna/results/anna"
        self.assertEqual(self.get(f"/api/screen?persona={key}&name=01.svg")[0], 200)
        for name in ("trace.params.json", "trace.json", "../../../anna/01.svg", "report.md"):
            self.assertEqual(self.get(f"/api/screen?persona={key}&name={name}")[0], 404, name)
        self.assertEqual(self.get("/api/screen?persona=../../etc&name=01.png")[0], 404)
        self.assertEqual(self.get("/trace.params.json")[0], 404)

    def test_notes_and_the_guard_against_other_sites(self):
        key = "android-anna/results/anna"
        notes = {"steps": {"s2": [{"id": "c1", "text": "Too small", "at": "2026-11-25T12:00:00Z", "resolved": False}]}, "trace": []}
        self.assertEqual(self.post(f"/api/notes?persona={key}", notes, header=False)[0], 403)
        self.assertFalse((self.anna / "trace.notes.json").exists())
        self.assertEqual(self.post(f"/api/notes?persona={key}", notes)[0], 200)
        saved = json.loads((self.anna / "trace.notes.json").read_text())
        self.assertEqual(saved["schema"], dashboard.NOTES_SCHEMA)
        self.assertEqual(saved["steps"]["s2"][0]["text"], "Too small")
        notes["screens"] = {"03": [{"id": "c2", "text": "Empty list says nothing", "at": "2026-11-25T12:00:00Z", "resolved": False}]}
        self.assertEqual(self.post(f"/api/notes?persona={key}", notes)[0], 200)
        saved = json.loads((self.anna / "trace.notes.json").read_text())
        self.assertEqual(saved["screens"]["03"][0]["text"], "Empty list says nothing")
        self.assertEqual(self.post("/api/notes?persona=../../..", notes)[0], 404)

    def test_a_check_is_saved_and_the_explored_trace_kept_once(self):
        key = "android-anna/results/anna"
        explored = json.loads((self.anna / "trace.json").read_text())
        edited = json.loads(json.dumps(explored))
        edited["steps"][2].setdefault("checkpoints", []).append(
            {"id": "s3-check1", "check": {"kind": "notVisible", "target": {"text": "Save"}}, "observed": "failed"})
        self.assertEqual(self.post(f"/api/trace?persona={key}", edited), (200, {"ok": True, "checkedByEcr": False}))
        self.assertEqual(json.loads((self.anna / "trace.json").read_text()), edited)
        self.assertEqual(json.loads((self.anna / "trace.explored.json").read_text()), explored)
        edited["steps"][2]["checkpoints"][-1]["observed"] = "held"
        self.assertEqual(self.post(f"/api/trace?persona={key}", edited)[0], 200)
        self.assertEqual(json.loads((self.anna / "trace.explored.json").read_text()), explored)   # still the explored one

    def test_only_checks_can_change(self):
        key = "android-anna/results/anna"
        before = (self.anna / "trace.json").read_text()
        moved = json.loads(before)
        moved["steps"][1]["intent"] = "Something else"
        code, body = self.post(f"/api/trace?persona={key}", moved)
        self.assertEqual(code, 422)
        self.assertIn("only checks can change: the steps must stay as explored", body["problems"])
        self.assertEqual(self.post(f"/api/trace?persona={key}", {"schema": "ecr.trace/0", "steps": []})[0], 422)
        self.assertEqual(self.post(f"/api/compile?persona={key}", json.loads(before))[0], 404)
        self.assertEqual((self.anna / "trace.json").read_text(), before)


if __name__ == "__main__":
    unittest.main()
