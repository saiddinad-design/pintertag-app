"""scripts/web/: what the agent reads after a screenshot, blocked hosts, gestures, and (with WEB_BROWSER_TEST=1
and Playwright installed) the browser itself on small local pages, one iPhone (WebKit) and one Android (Chromium)."""

import functools
import http.server
import importlib.util
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts" / "web"))
import browser  # noqa: E402
import screen  # noqa: E402

HAS_PLAYWRIGHT = importlib.util.find_spec("playwright") is not None


def state(**kw):
    s = {
        "w": 390,
        "h": 844,
        "scroll": 0,
        "max": 0,
        "url": "https://example.com/",
        "title": "Home",
        "tabs": 1,
        "events": [],
        "elements": [],
    }
    s.update(kw)
    return s


def el(kind, name, x, y, w=100, h=40, value="", options=()):
    return {
        "kind": kind,
        "name": name,
        "value": value,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "inline": False,
        "options": list(options),
    }


class Lines(unittest.TestCase):
    def test_header_and_elements(self):
        out = screen.lines(
            state(
                scroll=500,
                max=2000,
                elements=[
                    el("button", "Buy", 20, 100),
                    el("field", "E-mail", 20, 200, value="a@b.c"),
                    el("text", "Hello", 0, 300),
                ],
            ),
            "results/tom/01.png",
        )
        self.assertEqual(
            out[0], "screenshot: results/tom/01.png (390x844 CSS px; positions on the image = positions to tap)"
        )
        self.assertEqual(out[1], 'page: https://example.com/ "Home"')
        self.assertEqual(out[2], "scrolled 500 of 2000 px (25%)")
        self.assertIn('- button "Buy" centre=(70,120)', out)
        self.assertIn('- field "E-mail" value "a@b.c" centre=(70,220)', out)
        self.assertIn('- text "Hello" centre=(50,320)', out)

    def test_drop_down_lists_its_options(self):
        out = screen.lines(state(elements=[el("field", "Shop", 0, 0, value="de", options=["de", "fr"])]), "p.png")
        self.assertIn('- field "Shop" value "de" options "de | fr" centre=(50,20)', out)

    def test_short_page_tabs_and_events(self):
        out = screen.lines(
            state(tabs=2, events=["link to a blocked host, not loaded: https://shop.example/x"]), "p.png"
        )
        self.assertIn("the page itself does not scroll (a box on it may)", out)
        self.assertIn("2 tabs open, the newest in front (back closes it)", out)
        self.assertEqual(
            out[-2:], ["SINCE THE LAST SCREENSHOT:", "  link to a blocked host, not loaded: https://shop.example/x"]
        )

    def test_long_drop_down_says_how_many_more(self):
        out = screen.lines(state(elements=[el("field", "Land", 0, 0, options=[f"c{i}" for i in range(25)])]), "p.png")
        line = next(x for x in out if x.startswith("- field"))
        self.assertIn('| c19" and 5 more (choose takes any by its text)', line)

    def test_every_event_is_shown(self):
        out = screen.lines(state(events=[f"HTTP 404 /{i}" for i in range(30)]), "p.png")
        self.assertIn("  HTTP 404 /29", out)

    def test_same_line_listed_once(self):
        out = screen.lines(
            state(elements=[el("button", "Menu", 0, 0, value="Menu"), el("button", "Menu", 0, 0)]), "p.png"
        )
        self.assertEqual([x for x in out if x.startswith("- ")], ['- button "Menu" centre=(50,20)'])

    def test_accessibility_line(self):
        out = screen.lines(state(elements=[el("button", "", 10, 10, 20, 20)]), "p.png")
        self.assertTrue(out[-1].startswith("accessibility check"))


class BlockedHosts(unittest.TestCase):
    def test_host_and_subdomains_only(self):
        hosts = ["shop.example", "api.mixpanel.com"]
        self.assertTrue(browser.host_blocked("https://shop.example/dp/1", hosts))
        self.assertTrue(browser.host_blocked("https://www.shop.example/dp/1", hosts))
        self.assertTrue(browser.host_blocked("https://API.mixpanel.com/track", hosts))
        self.assertFalse(browser.host_blocked("https://notshop.example/", hosts))
        self.assertFalse(browser.host_blocked("https://mixpanel.com/", hosts))
        self.assertFalse(browser.host_blocked("data:text/html,shop.example", hosts))

    def test_a_final_dot_is_the_same_host(self):
        self.assertTrue(browser.host_blocked("https://www.shop.example./dp/1", ["shop.example"]))
        self.assertTrue(browser.host_blocked("https://shop.example/dp/1", ["shop.example."]))


class Gestures(unittest.TestCase):
    def test_unknown_gesture_stops_before_the_browser(self):
        r = subprocess.run(["bash", "scripts/web/gesture.sh", "fly"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)
        self.assertIn("unknown gesture: fly", r.stdout)

    def test_key_file_follows_runner_temp(self):
        old = os.environ.get("RUNNER_TEMP")
        os.environ["RUNNER_TEMP"] = "/tmp/run-1"
        try:
            self.assertEqual(browser.key_file(), f"/tmp/run-1/web-browser-{browser.PORT}.key")
        finally:
            if old is None:
                del os.environ["RUNNER_TEMP"]
            else:
                os.environ["RUNNER_TEMP"] = old

    def test_positions_must_be_numbers(self):
        with self.assertRaises(SystemExit):
            browser.numbers(["10", "x"])


PAGES = {
    "index.html": """<!doctype html><meta name=viewport content="width=device-width">
<body style="margin:0;font:16px sans-serif">
<h1>Shop</h1>
<p>Read the <a href="/terms">terms</a> before you buy anything from this little shop.</p>
<div style="padding-left:20px"><a href="/menu" style="font-size:10px">&#9776;</a><span>Little shop, a long tagline beside the menu</span></div>
<button style="width:200px;height:48px">Buy now</button>
<button style="width:20px;height:20px"></button>
<label><input type=radio name=size value=s style="position:absolute;opacity:0">Small</label>
<label>E-mail <input type=email style="width:250px;height:40px"></label>
<select aria-label="Country" style="height:44px"><option value=de>Germany</option><option value=fr>France</option>
<option value=ch disabled>Switzerland</option></select>
<input type=submit value="Send order">
<a href="https://shop.example/item" target="_blank" style="display:block;padding:12px">Open the shop</a>
<button style="position:absolute;top:0;left:0;width:50px;height:50px">Hidden</button>
<div style="position:absolute;top:0;left:0;width:60px;height:60px;background:#fff"></div>
<div style="height:3000px"></div>
<script>setTimeout(() => fetch('/data.txt', {signal: AbortSignal.timeout(1500)})
  .then(() => { document.title = 'fetched'; }, () => { document.title = 'timed out'; }), 500);</script>
</body>""",
    "data.txt": "ok",
    # The whole screen takes the touch itself (a drawing, a map): a phone does not scroll the page there
    "trap.html": """<!doctype html><meta name=viewport content="width=device-width">
<body style="margin:0"><div style="touch-action:none;height:150vh;background:#ddd"></div><div style="height:200vh"></div>
</body>""",
    # A box at the bottom of its own scrolling: the finger's scroll goes on to the page
    "inner.html": """<!doctype html><meta name=viewport content="width=device-width">
<body style="margin:0"><div id=box style="overflow-y:auto;height:100vh"><div style="height:120vh">x</div></div>
<div style="height:200vh"></div><script>box.scrollTop = 99999</script></body>""",
    # No mobile viewport tag: the phone shows a 980 px wide layout zoomed out
    "wide.html": """<!doctype html><body style="margin:0">
<button onclick="this.textContent='tapped'" style="position:absolute;left:700px;top:300px;width:200px;height:80px">Tap me</button>
</body>""",
}


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def centre(output, prefix):
    line = next(x for x in output.splitlines() if x.startswith(prefix))
    return line.split("centre=(")[1].rstrip(")").split(",")


@unittest.skipUnless(
    HAS_PLAYWRIGHT and os.environ.get("WEB_BROWSER_TEST") == "1",
    "a real browser: WEB_BROWSER_TEST=1 with Playwright and its browsers installed",
)
class RealBrowser(unittest.TestCase):
    """One device per engine, on local pages: what the agent sees, types, chooses, taps and scrolls."""

    def run_device(self, device):
        tmp = Path(tempfile.mkdtemp())
        for name, text in PAGES.items():
            (tmp / name).write_text(text, encoding="utf-8")
        quiet = type("Quiet", (http.server.SimpleHTTPRequestHandler,), {"log_message": lambda *a: None})
        site = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(quiet, directory=str(tmp)))
        threading.Thread(target=site.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{site.server_address[1]}"
        env = dict(
            os.environ,
            WEB_PORT=str(free_port()),
            WEB_DEVICE=device,
            WEB_URL=base + "/index.html",
            BLOCK_HOSTS="shop.example",
            RUNNER_TEMP=str(tmp),
        )
        srv = subprocess.Popen(
            [sys.executable, "scripts/web/browser.py", "serve"],
            cwd=ROOT,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        def tool(*a):
            cmd = ["bash", *a] if a[0].endswith(".sh") else [sys.executable, *a]
            r = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True)
            return r.stdout + r.stderr

        seen = {}
        try:
            for _ in range(60):
                if (
                    subprocess.run(
                        [sys.executable, "scripts/web/browser.py", "ping"], cwd=ROOT, env=env, capture_output=True
                    ).returncode
                    == 0
                ):
                    break
                time.sleep(1)
            time.sleep(3)  # no tool calls: the page's own request must still go through
            seen["first"] = tool("scripts/web/screen.py", str(tmp), "01")
            self.assertTrue((tmp / "01.png").exists())
            country = centre(seen["first"], '- field "Country')
            seen["choose"] = tool("scripts/web/gesture.sh", "choose", *country, "France")
            seen["choose_off"] = tool("scripts/web/gesture.sh", "choose", *country, "Switzerland")
            tool("scripts/web/gesture.sh", "tap", *centre(seen["first"], '- button "Buy now"'))
            seen["type_button"] = tool("scripts/web/type.py", "x")
            tool("scripts/web/gesture.sh", "tap", *centre(seen["first"], '- field "E-mail'))
            seen["typed"] = tool("scripts/web/type.py", "zoë@example.com")
            seen["after"] = tool("scripts/web/screen.py", str(tmp), "02")
            tool("scripts/web/gesture.sh", "tap", *centre(seen["first"], '- button "Open the shop"'))
            seen["blocked"] = tool("scripts/web/screen.py", str(tmp), "03")
            tool("scripts/web/gesture.sh", "back")
            tool("scripts/web/gesture.sh", "scroll", "down")
            seen["scrolled"] = tool("scripts/web/screen.py", str(tmp), "04")
            seen["file_url"] = tool("scripts/web/gesture.sh", "url", (tmp / "trap.html").as_uri())
            seen["other_site"] = tool("scripts/web/gesture.sh", "url", "https://example.org/")
            tool("scripts/web/gesture.sh", "url", base + "/trap.html")
            seen["trap_gesture"] = tool("scripts/web/gesture.sh", "scroll", "down")
            seen["trap"] = tool("scripts/web/screen.py", str(tmp), "05")
            tool("scripts/web/gesture.sh", "url", base + "/inner.html")
            tool("scripts/web/gesture.sh", "scroll", "down")
            seen["inner"] = tool("scripts/web/screen.py", str(tmp), "06")
            tool("scripts/web/gesture.sh", "url", base + "/wide.html")
            seen["wide"] = tool("scripts/web/screen.py", str(tmp), "07")
            tool("scripts/web/gesture.sh", "tap", *centre(seen["wide"], '- button "Tap me"'))
            seen["wide_tapped"] = tool("scripts/web/screen.py", str(tmp), "08")
            # What a page could send to 127.0.0.1: no key, refused
            bare = urllib.request.Request(f"http://127.0.0.1:{env['WEB_PORT']}/", data=b'{"do": "stop"}')
            try:
                urllib.request.urlopen(bare, timeout=10)
                seen["no_key"] = 200
            except urllib.error.HTTPError as e:
                seen["no_key"] = e.code
            return seen
        finally:
            subprocess.run([sys.executable, "scripts/web/browser.py", "stop"], cwd=ROOT, env=env, capture_output=True)
            srv.wait(timeout=30)
            site.shutdown()

    def check(self, device):
        seen = self.run_device(device)
        first = seen["first"]
        self.assertIn("page: http", first)
        self.assertIn('"fetched"', first)  # the page's request went through while no tool was calling
        self.assertIn('- text "Shop"', first)
        self.assertIn('- button "Buy now"', first)
        self.assertIn('- button "Send order"', first)  # an input button is named by its value
        self.assertIn('- button "Small" value "off"', first)  # the label, not the hidden radio
        self.assertIn('- field "Country" value "Germany" options "Germany | France | Switzerland"', first)
        self.assertNotIn('"Hidden"', first)  # covered by another element
        self.assertIn("1 control with no name", first)  # the 20 px button with no text
        self.assertNotIn('"terms"', first.split("accessibility check")[1])  # link inside text: not a small target
        self.assertIn('"☰"', first.split("accessibility check")[1])  # a menu link beside other blocks is one
        self.assertIn("chosen: France", seen["choose"])
        self.assertIn("this option is disabled", seen["choose_off"])
        self.assertIn("no field has the focus", seen["type_button"])
        self.assertIn("typed", seen["typed"])
        self.assertIn('value "France"', seen["after"])
        self.assertIn('value "zoë@example.com"', seen["after"])
        self.assertIn("link to a blocked host, not loaded: https://shop.example/item", seen["blocked"])
        self.assertNotIn("scrolled 0 of", seen["scrolled"])
        self.assertIn("url takes an http or https address", seen["file_url"])
        self.assertIn("pages of the site under test only", seen["other_site"])
        self.assertIn("scrolled 0 of", seen["trap"])  # the finger was on a touch-action: none element
        self.assertNotIn("scrolled 0 of", seen["inner"])  # the box was at its end: the page scrolled on
        self.assertIn('- button "tapped"', seen["wide_tapped"])  # zoomed-out page: the image position hits
        self.assertEqual(seen["no_key"], 403)
        return seen

    def test_iphone_on_webkit(self):
        seen = self.check("iPhone 15")
        self.assertIn("the page did not scroll", seen["trap_gesture"])

    def test_android_on_chromium(self):
        self.check("Pixel 7")

    def test_web_personas_use_playwright_device_names(self):
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            for p in json.loads((ROOT / "personas.json").read_text(encoding="utf-8")):
                if p["platform"] == "web":
                    self.assertIn(p["device"]["emulate"], pw.devices, p["id"])


if __name__ == "__main__":
    unittest.main()
