"""scripts/matrix.py (one job per persona), personas.json, and the workflow that reads both."""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PERSONAS = json.loads((ROOT / "personas.json").read_text(encoding="utf-8"))
WORKFLOW = (ROOT / ".github/workflows/agent-testers.yml").read_text(encoding="utf-8")
# Values `xcrun simctl ui <udid> content_size` accepts
IOS_TEXT_SIZES = {"extra-small", "small", "medium", "large", "extra-large", "extra-extra-large",
                  "extra-extra-extra-large", "accessibility-medium", "accessibility-large",
                  "accessibility-extra-large", "accessibility-extra-extra-large",
                  "accessibility-extra-extra-extra-large"}
COLOR_FILTERS = ("protanopia", "deuteranopia", "tritanopia")
NETWORK_CONDITIONS = ("slow", "flaky")


def matrix(platform, personas, cwd=ROOT):
    env = dict(os.environ, PLATFORM=platform, PERSONAS=personas)
    return subprocess.run([sys.executable, str(ROOT / "scripts/matrix.py")], cwd=cwd, env=env, capture_output=True, text=True)


def rows(platform, personas, cwd=ROOT):
    out = matrix(platform, personas, cwd=cwd)
    if out.returncode:
        raise AssertionError(out.stderr)
    key, _, value = out.stdout.strip().partition("=")
    assert key == platform, out.stdout
    return json.loads(value)


def job(name):
    """Text of one job of the workflow, up to the next job."""
    return re.search(rf"\n  {name}:\n(.*?)(?=\n  [a-z-]+:\n|\Z)", WORKFLOW, re.S).group(1)


class Matrix(unittest.TestCase):
    def test_all_takes_every_persona_of_the_platform(self):
        for platform in ("android", "ios", "web"):
            expected = [p["id"] for p in PERSONAS if p["platform"] == platform]
            self.assertEqual([r["persona"] for r in rows(platform, "all")], expected)

    def test_none_and_empty_skip_the_platform(self):
        self.assertEqual(rows("ios", "none"), [])
        self.assertEqual(rows("android", ""), [])

    def test_names_keep_their_order_and_spaces_are_ignored(self):
        names = [p["id"] for p in PERSONAS if p["platform"] == "android"][:3]
        self.assertEqual([r["persona"] for r in rows("android", " , ".join(reversed(names)))], names[::-1])

    def test_unknown_persona_stops_the_run(self):
        out = matrix("android", "nobody")
        self.assertNotEqual(out.returncode, 0)
        self.assertIn("Unknown personas: ['nobody']", out.stderr)

    def test_persona_of_the_other_platform_stops_the_run(self):
        ios_one = next(p["id"] for p in PERSONAS if p["platform"] == "ios")
        out = matrix("android", ios_one)
        self.assertNotEqual(out.returncode, 0)
        self.assertIn(ios_one, out.stderr)

    def test_accessibility_settings_default_to_off(self):
        ids = {"android": [], "ios": [], "web": []}
        for p in PERSONAS:
            d = p["device"]
            if not d.get("increase_contrast") and not d.get("reduce_motion") and not d.get("color_filter") and not d.get("network"):
                ids[p["platform"]].append(p["id"])
        for platform in ("android", "ios", "web"):
            for row in rows(platform, ids[platform][0]):
                self.assertEqual(row["increase_contrast"], "false")
                self.assertEqual(row["color_filter"], "")
                if platform == "android":
                    self.assertEqual(row["network"], "")
                if platform in ("ios", "web"):
                    self.assertEqual(row["reduce_motion"], "false")

    def test_accessibility_settings_reach_the_row(self):
        saw_color_filter = False
        for p in PERSONAS:
            d = p["device"]
            if not (d.get("increase_contrast") or d.get("reduce_motion") or d.get("color_filter")):
                continue
            with self.subTest(p["id"]):
                row = rows(p["platform"], p["id"])[0]
                self.assertEqual(row["increase_contrast"], "true" if d.get("increase_contrast") else "false")
                self.assertEqual(row["color_filter"], d.get("color_filter", ""))
                if p["platform"] in ("ios", "web"):
                    self.assertEqual(row["reduce_motion"], "true" if d.get("reduce_motion") else "false")
                if d.get("color_filter"):
                    saw_color_filter = True
        self.assertTrue(saw_color_filter, "expected at least one persona with color_filter")

    def test_color_filter_values_work_across_platforms_and_reject_bad_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            pfile = Path(tmp) / "personas.json"
            samples = [
                {"id": f"{plat}_{f}", "platform": plat, "device": {"color_filter": f}}
                for plat in ("android", "ios", "web")
                for f in COLOR_FILTERS
            ] + [
                {"id": "a_bad", "platform": "android", "device": {"color_filter": "monochrome"}},
                {"id": "a_int", "platform": "android", "device": {"color_filter": 0}},
                {"id": "i_bad", "platform": "ios", "device": {"color_filter": "grayscale"}},
            ]
            pfile.write_text(json.dumps(samples), encoding="utf-8")
            for plat in ("android", "ios", "web"):
                for f in COLOR_FILTERS:
                    row = rows(plat, f"{plat}_{f}", cwd=tmp)[0]
                    self.assertEqual(row["color_filter"], f)
            for plat, pid in (("android", "a_bad"), ("android", "a_int"), ("ios", "i_bad")):
                out = matrix(plat, pid, cwd=tmp)
                self.assertNotEqual(out.returncode, 0)
                self.assertIn("Unknown color_filter", out.stderr)

    def test_run_scripts_apply_the_accessibility_settings(self):
        ios = (ROOT / "scripts/ios/run_agent.sh").read_text(encoding="utf-8")
        android = (ROOT / "scripts/android/run_agent.sh").read_text(encoding="utf-8")
        web_run = (ROOT / "scripts/web/run_agent.sh").read_text(encoding="utf-8")
        self.assertIn('simctl ui "$UDID" increase_contrast enabled', ios)
        self.assertIn("com.apple.Accessibility ReduceMotionEnabled -bool true", ios)
        self.assertIn("settings put secure high_text_contrast_enabled 1", android)
        for script in (android, ios, web_run):
            self.assertIn("color filter $COLOR_FILTER", script)
        for plat in ("android", "ios", "web"):
            self.assertIn("COLOR_FILTER: ${{ matrix.color_filter }}", job(plat))
        # Before the app starts, so it reads them at launch
        self.assertLess(ios.index("increase_contrast"), ios.index("simctl launch"))
        self.assertLess(ios.index("ReduceMotionEnabled"), ios.index("simctl launch"))
        self.assertLess(android.index("high_text_contrast_enabled"), android.index("monkey -p"))
        # Web: browser context options, set before the page opens
        web = (ROOT / "scripts/web/browser.py").read_text(encoding="utf-8")
        self.assertIn('reduced_motion="reduce" if env.get("REDUCE_MOTION") == "true"', web)
        self.assertIn('contrast="more" if env.get("INCREASE_CONTRAST") == "true"', web)
        self.assertLess(web.index("reduced_motion="), web.index("new_page()"))

    def test_network_reaches_the_row_and_rejects_bad_values(self):
        with_net = [p for p in PERSONAS if p["device"].get("network")]
        self.assertTrue(with_net, "expected at least one persona with network")
        for p in with_net:
            row = rows(p["platform"], p["id"])[0]
            self.assertEqual(row["network"], p["device"]["network"])

        with tempfile.TemporaryDirectory() as tmp:
            pfile = Path(tmp) / "personas.json"
            samples = [
                {"id": f"a_{n}", "platform": "android", "device": {"network": n}}
                for n in NETWORK_CONDITIONS
            ] + [
                {"id": "a_default", "platform": "android", "device": {}},
                {"id": "a_empty", "platform": "android", "device": {"network": ""}},
                {"id": "a_bad", "platform": "android", "device": {"network": "offline"}},
                {"id": "a_int", "platform": "android", "device": {"network": 0}},
                {"id": "a_bool", "platform": "android", "device": {"network": True}},
                {"id": "i_slow", "platform": "ios", "device": {"network": "slow"}},
                {"id": "w_flaky", "platform": "web", "device": {"network": "flaky"}},
            ]
            pfile.write_text(json.dumps(samples), encoding="utf-8")
            for n in NETWORK_CONDITIONS:
                self.assertEqual(rows("android", f"a_{n}", cwd=tmp)[0]["network"], n)
            self.assertEqual(rows("android", "a_default", cwd=tmp)[0]["network"], "")
            self.assertEqual(rows("android", "a_empty", cwd=tmp)[0]["network"], "")
            for pid in ("a_bad", "a_int", "a_bool"):
                out = matrix("android", pid, cwd=tmp)
                self.assertNotEqual(out.returncode, 0)
                self.assertIn("Unknown network", out.stderr)
            for plat, pid in (("ios", "i_slow"), ("web", "w_flaky")):
                out = matrix(plat, pid, cwd=tmp)
                self.assertNotEqual(out.returncode, 0)
                self.assertIn("Android-only", out.stderr)

    def test_android_run_script_applies_network_condition(self):
        android = (ROOT / "scripts/android/run_agent.sh").read_text(encoding="utf-8")
        self.assertIn("NETWORK: ${{ matrix.network }}", job("android"))
        self.assertIn('adb emu network speed "$NET_SPEED"', android)
        self.assertIn('adb emu network delay "$NET_DELAY"', android)
        self.assertIn('slow)  NET_SPEED="edge"; NET_DELAY="edge"', android)
        self.assertIn('flaky) NET_SPEED="edge"; NET_DELAY="500:3000"', android)
        # The job log shows what the emulator applied
        self.assertIn("adb emu network status", android)
        # Applied after the APK is installed and before the app launches
        self.assertLess(android.index("adb install"), android.index("adb emu network speed"))
        self.assertLess(android.index("adb emu network delay"), android.index("monkey -p"))
        # Prompt says what the condition is for so normal loading time is not flagged as a bug
        self.assertIn("report spinners that never stop, double submits or errors with no message, not normal loading time", android)

    def test_rows_have_every_key_the_jobs_read(self):
        for platform in ("android", "ios", "web"):
            used = set(re.findall(r"matrix\.([a-z_]+)", job(platform)))
            for row in rows(platform, "all"):
                self.assertFalse(used - set(row), f"{platform} job reads {used - set(row)}, missing in {row}")


class Personas(unittest.TestCase):
    def test_ids_are_unique_and_simple(self):
        ids = [p["id"] for p in PERSONAS]
        self.assertEqual(len(ids), len(set(ids)))
        for pid in ids:
            self.assertRegex(pid, r"^[a-z][a-z0-9_-]*$")

    def test_each_persona_is_complete(self):
        for p in PERSONAS:
            with self.subTest(p["id"]):
                self.assertIn(p["platform"], ("android", "ios", "web"))
                for key in ("profile", "goal", "locale", "device"):
                    self.assertTrue(p.get(key), key)
                self.assertRegex(p["locale"], r"^[a-z]{2,3}(-[A-Za-z0-9]+)*$")
                lat, lon = p["geo"]
                self.assertTrue(-90 <= lat <= 90 and -180 <= lon <= 180)
                self.assertIn(p["device"]["theme"], ("light", "dark"))

    def test_devices_use_values_the_emulators_accept(self):
        for p in PERSONAS:
            d = p["device"]
            with self.subTest(p["id"]):
                for key in ("increase_contrast", "reduce_motion"):
                    if key in d:
                        self.assertIsInstance(d[key], bool, key)
                if p["platform"] == "android":
                    # Animations are off on every emulator already (disable-animations)
                    self.assertNotIn("reduce_motion", d)
                if "color_filter" in d:
                    self.assertIn(d["color_filter"], COLOR_FILTERS)
                if "network" in d:
                    self.assertEqual(p["platform"], "android")
                    self.assertIn(d["network"], NETWORK_CONDITIONS)
                if p["platform"] == "web":
                    # A Playwright device name (tests/test_web.py checks them when Playwright is installed)
                    self.assertTrue(d["emulate"] and d["name"])
                    self.assertNotIn("simulator", d)
                elif p["platform"] == "ios":
                    self.assertIn(d["text_size"], IOS_TEXT_SIZES)
                    self.assertTrue(d["simulator"].startswith(("iPhone", "iPad")))
                    self.assertIsInstance(d["ios"], int)
                else:
                    self.assertIn(d["android_api"], range(29, 37))
                    self.assertTrue(0.8 <= float(d["font_scale"]) <= 2.0)
                    self.assertTrue(d["profile"] and d["name"])


if __name__ == "__main__":
    unittest.main()
