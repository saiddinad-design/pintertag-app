"""scripts/android/screen.py: element parsing, off-screen/zero-size filtering, and label cleanup."""
import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

spec = importlib.util.spec_from_file_location("android_screen", ROOT / "scripts" / "android" / "screen.py")
android_screen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(android_screen)

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

SAMPLE_XML = """<hierarchy rotation="0">
  <node class="android.widget.Button" clickable="true" text="Hidden Left Card" bounds="[-900,400][-100,600]" />
  <node class="android.widget.Button" clickable="true" text="Partial Card" bounds="[-200,700][400,900]" />
  <node class="android.widget.Button" clickable="true" text="Invisible Ghost" bounds="[0,0][0,0]" />
  <node class="android.widget.Button" clickable="true" text="Inverted Box" bounds="[500,300][200,400]" />
  <node class="android.widget.Button" clickable="true" content-desc="Send&#10;Tab 2 of 3" bounds="[360,2100][720,2300]" />
  <node class="android.widget.Button" clickable="true" text="Below Fold" bounds="[100,2600][980,2800]" />
  <node class="android.widget.Button" clickable="true" text="Off Right" bounds="[1200,400][1800,600]" />
  <node class="android.widget.Button" clickable="true" text="Above Top" bounds="[100,-500][500,-100]" />
  <node class="android.widget.EditText" clickable="true" text="" bounds="[80,1000][1000,1120]" />
  <node class="android.widget.TextView" clickable="false" text="  Welcome&#13;&#10;  back  " bounds="[80,120][500,200]" />
  <node class="android.widget.Button" clickable="true" text="Continue" bounds="[100,1800][980,1960]" />
</hierarchy>"""

FAKE_ADB = """#!/usr/bin/env bash
if [ "$1" = "exec-out" ] && [ "$2" = "screencap" ]; then
  cat "$FAKE_PNG"
elif [ "$1" = "exec-out" ] && [ "$2" = "cat" ]; then
  cat "$FAKE_XML"
elif [ "$1" = "shell" ] && [ "$2" = "wm" ] && [ "$3" = "density" ]; then
  echo "Physical density: 420"
fi
"""


class AndroidScreenElements(unittest.TestCase):
    def test_negative_offscreen_zero_size_and_multiline_filtering(self):
        lines = android_screen.elements(ET.fromstring(SAMPLE_XML), 1080, 2400)
        self.assertEqual(lines, [
            '- button "Partial Card" centre=(100,800)',
            '- button "Send Tab 2 of 3" centre=(540,2200)',
            '- field "" centre=(540,1060)',
            '- text "Welcome back" centre=(290,160)',
            '- button "Continue" centre=(540,1880)',
        ])

    def test_negative_left_bounds_are_not_parsed_as_positive(self):
        xml = '<hierarchy><node clickable="true" text="Off Left" bounds="[-900,400][-100,600]"/></hierarchy>'
        self.assertEqual(android_screen.elements(ET.fromstring(xml), 1080, 2400), [])

    def test_partially_visible_negative_bounds_keep_true_centre(self):
        xml = '<hierarchy><node clickable="true" text="Peek" bounds="[-200,700][400,900]"/></hierarchy>'
        self.assertEqual(
            android_screen.elements(ET.fromstring(xml), 1080, 2400),
            ['- button "Peek" centre=(100,800)'],
        )

    def test_zero_size_and_inverted_bounds_are_skipped(self):
        xml = (
            '<hierarchy>'
            '<node clickable="true" text="Zero" bounds="[0,0][0,0]"/>'
            '<node clickable="true" text="Flat" bounds="[100,200][100,300]"/>'
            '<node clickable="true" text="Inverted" bounds="[400,200][100,300]"/>'
            '</hierarchy>'
        )
        self.assertEqual(android_screen.elements(ET.fromstring(xml), 1080, 2400), [])

    def test_whitespace_only_text_falls_back_to_content_desc(self):
        xml = '<hierarchy><node clickable="true" text="  &#10;  " content-desc="Open&#10;menu" bounds="[0,0][200,100]"/></hierarchy>'
        self.assertEqual(
            android_screen.elements(ET.fromstring(xml), 1080, 2400),
            ['- button "Open menu" centre=(100,50)'],
        )

    @unittest.skipUnless(HAS_PIL, "Pillow is not installed")
    def test_cli_with_stub_adb(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            bin_dir = tmp / "bin"
            bin_dir.mkdir()
            adb_bin = bin_dir / "adb"
            adb_bin.write_text(FAKE_ADB, encoding="utf-8")
            adb_bin.chmod(0o755)
            fake_png = tmp / "in.png"
            Image.new("RGB", (1080, 2400), (240, 240, 240)).save(fake_png)
            fake_xml = tmp / "ui.xml"
            fake_xml.write_text(SAMPLE_XML, encoding="utf-8")
            out_dir = tmp / "out"
            env = dict(
                os.environ,
                PATH=f"{bin_dir}:{os.environ['PATH']}",
                RUNNER_TEMP=str(tmp),
                FAKE_PNG=str(fake_png),
                FAKE_XML=str(fake_xml),
            )
            env.pop("COLOR_FILTER", None)
            env.pop("ECR_ACTION_LOG", None)
            done = subprocess.run(
                [sys.executable, str(ROOT / "scripts/android/screen.py"), str(out_dir), "01"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(done.returncode, 0, done.stderr)
            out_lines = done.stdout.splitlines()
            self.assertEqual(
                out_lines[0],
                f"screenshot: {out_dir}/01.png (screen 1080x2400; image is half size: multiply positions read on it by 2)",
            )
            self.assertEqual(out_lines[1:6], [
                '- button "Partial Card" centre=(100,800)',
                '- button "Send Tab 2 of 3" centre=(540,2200)',
                '- field "" centre=(540,1060)',
                '- text "Welcome back" centre=(290,160)',
                '- button "Continue" centre=(540,1880)',
            ])
            self.assertNotIn("Hidden Left Card", done.stdout)
            self.assertNotIn("Invisible Ghost", done.stdout)
            self.assertNotIn("Below Fold", done.stdout)
            with Image.open(out_dir / "01.png") as saved:
                self.assertEqual(saved.size, (540, 1200))
            self.assertTrue((out_dir / "01.xml").exists())


if __name__ == "__main__":
    unittest.main()
