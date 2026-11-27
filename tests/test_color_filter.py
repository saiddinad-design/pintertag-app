"""scripts/color_filter.py: color blindness simulation applied to screenshots before the agent reads them."""
import math
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import color_filter  # noqa: E402

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


def rgb_dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


class ColorFilter(unittest.TestCase):
    def test_matrices_preserve_neutral_grays_and_collapse_dichromatic_pairs(self):
        red, green, blue = (200, 40, 40), (40, 160, 40), (40, 80, 220)
        orig_rg = rgb_dist(red, green)
        orig_bg = rgb_dist(blue, green)

        for name in color_filter.FILTERS:
            # Neutral grays and white stay neutral (row sums ~= 1.0)
            for v in (0, 128, 255):
                self.assertEqual(color_filter.apply_rgb(v, v, v, name), (v, v, v))

        for name in ("protanopia", "deuteranopia"):
            r_sim = color_filter.apply_rgb(*red, name)
            g_sim = color_filter.apply_rgb(*green, name)
            b_sim = color_filter.apply_rgb(*blue, name)
            # Red and green move much closer and lose their opposing R-vs-G hue contrast
            self.assertLess(rgb_dist(r_sim, g_sim), orig_rg * 0.7)
            self.assertGreater(r_sim[0] - r_sim[1], -5)
            self.assertGreater(g_sim[0] - g_sim[1], -5)
            # Blue remains clearly distinct from green
            self.assertGreater(rgb_dist(b_sim, g_sim), 150)

        # Tritanopia collapses blue and green while keeping red distinct
        r_tri = color_filter.apply_rgb(*red, "tritanopia")
        g_tri = color_filter.apply_rgb(*green, "tritanopia")
        b_tri = color_filter.apply_rgb(*blue, "tritanopia")
        self.assertLess(rgb_dist(b_tri, g_tri), orig_bg * 0.4)
        self.assertGreater(rgb_dist(r_tri, g_tri), 180)

    def test_apply_passes_matrix_to_image_convert_and_noop_when_unset(self):
        class FakeImage:
            def __init__(self):
                self.calls = []

            def convert(self, mode, matrix=None):
                self.calls.append((mode, matrix))
                return ("converted", mode, matrix)

        img = FakeImage()
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("COLOR_FILTER", None)
            self.assertIs(color_filter.apply(img), img)
            self.assertEqual(img.calls, [])

        with mock.patch.dict(os.environ, {"COLOR_FILTER": "deuteranopia"}):
            res = color_filter.apply(img)
            self.assertEqual(res, ("converted", "RGB", color_filter.FILTERS["deuteranopia"]))

        with self.assertRaises(ValueError):
            color_filter.apply(img, "unknown")

    @unittest.skipUnless(HAS_PIL, "Pillow is not installed")
    def test_red_and_green_squares_on_a_small_image(self):
        # 4x2 image: left 2x2 square is red, right 2x2 square is green
        img = Image.new("RGB", (4, 2))
        red, green = (200, 40, 40), (40, 160, 40)
        for y in range(2):
            for x in range(2):
                img.putpixel((x, y), red)
                img.putpixel((x + 2, y), green)

        self.assertIs(color_filter.apply(img, ""), img)
        for name in ("protanopia", "deuteranopia"):
            filtered = color_filter.apply(img, name)
            left = filtered.getpixel((0, 0))
            right = filtered.getpixel((2, 0))
            self.assertNotEqual(left, red)
            self.assertNotEqual(right, green)
            self.assertLess(rgb_dist(left, right), rgb_dist(red, green) * 0.7)
            # Both squares now sit on the yellow-ochre axis (R >= G > B)
            self.assertGreater(left[0], left[2])
            self.assertGreater(right[0], right[2])

    def test_all_three_screen_scripts_wire_color_filter(self):
        for rel in ("scripts/android/screen.py", "scripts/ios/screen.py", "scripts/web/screen.py"):
            src = (ROOT / rel).read_text(encoding="utf-8")
            self.assertIn("import color_filter", src, rel)
            self.assertIn("color_filter.apply(", src, rel)

    def test_the_prompt_says_what_the_filter_is_for(self):
        # Without it, an agent reports the changed colors as a defect of the app
        for rel in ("scripts/android/run_agent.sh", "scripts/ios/run_agent.sh", "scripts/web/run_agent.sh"):
            src = (ROOT / rel).read_text(encoding="utf-8")
            self.assertIn("report what can only be told apart by color, not the changed colors themselves", src, rel)


if __name__ == "__main__":
    unittest.main()
