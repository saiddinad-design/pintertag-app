"""The mobile browser of the web platform: one Playwright page kept open between tool calls.

Each tool call (screen.py, gesture.sh, type.py) is a separate process, so the page, its
scroll position and its state live in this process, behind a small HTTP server on 127.0.0.1.
  python3 scripts/web/browser.py serve        start it (run_agent.sh does, settings from the env below)
  python3 scripts/web/browser.py ping | stop  check it, stop it
  python3 scripts/web/browser.py tap X Y      one gesture (what gesture.sh runs)
On iPhones (WebKit) Playwright has no touch scroll: scroll and swipe move what a finger would move,
from the element under it (touch-action respected), with script (scripts/web/page_js.py).
Env for serve: WEB_URL, WEB_DEVICE (a Playwright device name: iPhones run on WebKit, Android
phones on Chromium), LOCALE, GEO "lat,lon", THEME, REDUCE_MOTION, INCREASE_CONTRAST,
BLOCK_HOSTS, RECORD_VIDEO, PERSONA. WEB_PORT (default 9333) for both sides.
Requests and WebSockets to BLOCK_HOSTS are aborted; a link that tried to open one is reported with
its URL. Playwright routes only see the first URL of a redirect: the workflow also blocks the hosts
in /etc/hosts and the firewall.
Only the tools can drive it: each request carries the key that serve writes to a file of this user
(the site under test can reach 127.0.0.1 too, but cannot read that file)."""

import contextlib
import hmac
import json
import os
import re
import secrets
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener

from page_js import CHOOSE_JS, ELEMENTS_JS, PAN_JS, SELECT_FOCUSED_JS

PORT = int(os.environ.get("WEB_PORT", "9333"))
MAX_EVENTS = 40
LOCAL = build_opener(ProxyHandler({}))  # the browser is on this machine: never through an HTTP proxy


def host_blocked(url, hosts):
    """True if the URL's host is one of hosts or a subdomain of one (a final dot changes nothing)."""
    host = (urlsplit(url).hostname or "").lower().rstrip(".")
    return any(host == h or host.endswith("." + h) for h in (x.lower().rstrip(".") for x in hosts))


def numbers(args):
    """The numbers of a gesture's arguments (positions in CSS pixels)."""
    try:
        return [float(x) for x in args]
    except ValueError:
        raise SystemExit(f"positions must be numbers: {' '.join(args)}") from None


def key_file():
    """The file that holds the running browser's key (RUNNER_TEMP, else the user's temp folder)."""
    return os.path.join(os.environ.get("RUNNER_TEMP") or tempfile.gettempdir(), f"web-browser-{PORT}.key")


def call(do, *args, timeout=90):
    """One command to the running browser, its JSON answer back."""
    body = json.dumps({"do": do, "args": list(args)}).encode()
    try:
        with open(key_file(), encoding="utf-8") as f:
            key = f.read().strip()
        req = Request(
            f"http://127.0.0.1:{PORT}/", data=body, headers={"Content-Type": "application/json", "X-Browser-Key": key}
        )
        with LOCAL.open(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except OSError as e:  # a timeout too (socket.timeout is no TimeoutError before Python 3.10)
        if isinstance(e, TimeoutError) or "timed out" in str(e):
            raise SystemExit(f"the browser did not answer within {timeout} s: the page may hang") from None
        raise SystemExit(f"the browser is not running ({e.__class__.__name__}): scripts/web/run_agent.sh starts it") from None


class Browser:
    """The persona's phone: one browser context, the newest tab in front."""

    def __init__(self, pw, env):
        device = dict(pw.devices[env.get("WEB_DEVICE", "iPhone 15")])
        self.engine = device.pop("default_browser_type")
        self.hosts = env.get("BLOCK_HOSTS", "").split()
        self.home = (urlsplit(env["WEB_URL"]).hostname or "").lower()
        self.events, self.pages, self.blocked_link = {}, [], False
        lat, _, lon = env.get("GEO", "48.8566,2.3522").partition(",")
        opts = dict(
            device,
            locale=env.get("LOCALE", "en-US"),
            color_scheme=env.get("THEME", "light"),
            reduced_motion="reduce" if env.get("REDUCE_MOTION") == "true" else "no-preference",
            contrast="more" if env.get("INCREASE_CONTRAST") == "true" else "no-preference",
            geolocation={"latitude": float(lat), "longitude": float(lon)},
            permissions=["geolocation"],
        )
        if env.get("RECORD_VIDEO") == "true":
            opts.update(
                record_video_dir=f"results/{env.get('PERSONA', 'web')}/video", record_video_size=device["viewport"]
            )
        self.browser = getattr(pw, self.engine).launch(headless=True)
        self.context = self.browser.new_context(**opts)
        if self.hosts:
            blocked = lambda url: host_blocked(url, self.hosts)  # noqa: E731
            self.context.route(blocked, self._block)
            self.context.route_web_socket(blocked, lambda ws: ws.close())
        self._watch(self.context.new_page(), opened=False)
        self.context.on("page", self._watch)  # after the first page: only tabs the site opens
        try:
            self.page.goto(env["WEB_URL"], wait_until="domcontentloaded", timeout=60000)
        except Exception as e:  # the tester sees it on the first screenshot and reports it
            self.note(f"the start page did not load: {str(e).splitlines()[0][:200]}")

    @property
    def page(self):
        return self.pages[-1]

    def note(self, text):
        """Keeps what went wrong since the last screenshot; the same message with other numbers is counted once."""
        key = re.sub(r"\d+", "#", text)
        if key in self.events:
            self.events[key][1] += 1
        elif len(self.events) < MAX_EVENTS:
            self.events[key] = [text[:300], 0]

    def events_out(self):
        """The notes since the last screenshot, then a fresh start."""
        out = [t + (f" (and {n} more like it)" if n else "") for t, n in self.events.values()]
        self.events = {}
        return out

    def _block(self, route):
        if route.request.is_navigation_request():
            self.note(f"link to a blocked host, not loaded: {route.request.url}")
            self.blocked_link = True  # a new tab opened only for it stays empty (close_empty_tabs)
        route.abort("blockedbyclient")

    def close_empty_tabs(self):
        """Closes the new tabs that only tried to open a blocked host (WebKit cannot even draw them)."""
        if not self.blocked_link:
            return
        self.blocked_link = False
        for tab in self.pages[1:]:
            if tab.url in ("", "about:blank") or tab.url.startswith("chrome-error:"):
                with contextlib.suppress(Exception):
                    tab.close()
                    self.note("the new tab it opened stayed empty and was closed")

    def to_input(self, x, y):
        """A screen position for an input event: WebKit takes the screen as it is, Chromium the page's own
        coordinates, which differ on a zoomed-out page (no mobile viewport tag)."""
        if self.engine != "chromium":
            return x, y
        s, ox, oy = self.page.evaluate(
            "() => { const v = window.visualViewport; return v ? [v.scale, v.offsetLeft, v.offsetTop] : [1, 0, 0]; }")
        return x / s + ox, y / s + oy

    def _watch(self, page, opened=True):
        self.pages.append(page)
        page.on("close", lambda p: p in self.pages and self.pages.remove(p))
        page.on("pageerror", lambda e: self.note(f"page error: {e}"))
        page.on("console", lambda m: m.type == "error" and self.note(f"console error: {m.text}"))
        page.on("response", lambda r: r.status >= 400 and self.note(f"HTTP {r.status} {r.url}"))
        page.on("requestfailed", self._failed)
        if opened:
            self.note("a new tab opened (back closes it)")

    def _failed(self, request):
        # A load the page or a navigation cancelled is not a failure; nor is a host blocked on purpose
        if host_blocked(request.url, self.hosts) or re.search(r"cancel|abort", request.failure or "", re.I):
            return
        self.note(f"request failed ({request.failure}): {request.url}")

    def pump(self, ms=20):
        """Lets Playwright handle the page's requests and events while no tool is calling."""
        with contextlib.suppress(Exception):
            self.page.wait_for_timeout(ms)

    def settle(self):
        with contextlib.suppress(Exception):
            self.page.wait_for_load_state("domcontentloaded", timeout=10000)

    def touch(self, points, hold=0.0):
        """Chromium only: real touch events through CDP, one finger along points [(x, y), ...]."""
        points = [self.to_input(x, y) for x, y in points]
        cdp = self.context.new_cdp_session(self.page)
        x, y = points[0]
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
        for x, y in points[1:]:
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y}]})
            self.pump()
        self.pump(int(hold * 1000))
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        cdp.detach()

    def drag(self, points, hold=0.0):
        """WebKit has no touch input in Playwright beyond a tap: a pointer drag (pointer events, no native scroll)."""
        m = self.page.mouse
        m.move(*points[0])
        m.down()
        for x, y in points[1:]:
            m.move(x, y)
        self.pump(int(hold * 1000))
        m.up()

    # One method per command; each returns its JSON answer, or None for {"ok": true} once the page settled.
    def cmd_ping(self, a):
        return {"ok": True, "engine": self.engine}

    def cmd_screen(self, a):
        if not a or not a[0].endswith(".png"):
            return {"error": "screen needs the path of a .png file"}
        self.settle()
        self.pump(300)
        p = self.page
        state = p.evaluate(ELEMENTS_JS)
        p.screenshot(path=a[0], scale="css", timeout=30000)
        state.update(url=p.url, title=p.title(), tabs=len(self.pages), engine=self.engine, events=self.events_out())
        return state

    def cmd_tap(self, a):
        x, y = numbers(a[:2])
        self.page.touchscreen.tap(*self.to_input(x, y))

    def cmd_long_press(self, a):
        x, y = numbers(a[:2])
        (self.touch if self.engine == "chromium" else self.drag)([(x, y)], hold=1.0)

    def cmd_swipe(self, a):
        x1, y1, x2, y2 = numbers(a[:4])
        steps = [(x1 + (x2 - x1) * i / 12, y1 + (y2 - y1) * i / 12) for i in range(13)]
        if self.engine == "chromium":
            self.touch(steps)
        elif self.page.evaluate(PAN_JS, [x1, y1, x1 - x2, y1 - y2]) != "scrolled":
            self.drag(steps)  # the page handles the finger itself (touch-action), or nothing scrolls there

    def cmd_scroll(self, a):
        p = self.page
        w, h = p.viewport_size["width"], p.viewport_size["height"]
        dy = round(h * 0.6) * (-1 if a and a[0] == "up" else 1)
        if self.engine == "chromium":  # a real touch scroll from the middle of the screen
            x, y = self.to_input(w // 2, h // 2)
            cdp = self.context.new_cdp_session(p)
            cdp.send(
                "Input.synthesizeScrollGesture",
                {"x": x, "y": y, "yDistance": -dy, "gestureSourceType": "touch", "speed": 1200},
            )
            cdp.detach()
        elif p.evaluate(PAN_JS, [w // 2, h // 2, 0, dy]) == "blocked":  # WebKit: no touch scroll in Playwright
            self.settle()
            return {
                "ok": True,
                "note": "the page did not scroll: the element under the finger takes the touch "
                "(CSS touch-action), as on a phone",
            }
        return None

    def cmd_choose(self, a):
        x, y = numbers(a[:2])
        out = self.page.evaluate(CHOOSE_JS, [x, y, a[2] if len(a) > 2 else ""])
        self.settle()
        return out

    def cmd_back(self, a):
        p = self.page
        can = p.evaluate("() => window.navigation ? navigation.canGoBack : history.length > 1")
        if len(self.pages) > 1 and not can:
            p.close()  # a tab the site opened, at its first page: back closes it, like on a phone
            return None
        p.go_back(timeout=15000)
        if p is self.pages[0] and p.url == "about:blank":  # the browser's empty start, not a page of the site
            p.go_forward(timeout=15000)
            return {"ok": True, "note": "there is no page to go back to: the site was opened here"}
        return None

    def cmd_enter(self, a):
        self.page.keyboard.press("Enter")

    def cmd_reload(self, a):
        self.page.reload(timeout=30000)

    def cmd_url(self, a):
        if not a or urlsplit(a[0]).scheme not in ("http", "https"):
            return {"error": "url takes an http or https address"}
        site = self.home[4:] if self.home.startswith("www.") else self.home
        if not host_blocked(a[0], [site]):  # same check: this host or a subdomain of it
            return {"error": f"url opens pages of the site under test only ({site}); follow its links to go elsewhere"}
        self.page.goto(a[0], wait_until="domcontentloaded", timeout=30000)
        return None

    def cmd_type(self, a):
        p = self.page
        if not p.evaluate(SELECT_FOCUSED_JS):
            return {"ok": False, "focused": False}
        if a and a[0]:
            p.keyboard.insert_text(a[0])
        else:
            p.keyboard.press("Backspace")
        return {"ok": True, "focused": True}

    def do(self, cmd, args):
        method = getattr(self, "cmd_" + cmd.replace("-", "_"), None)
        if method is None:
            return {"error": f"unknown command: {cmd}"}
        self.close_empty_tabs()
        out = method(args)
        if out is None:
            self.settle()
            out = {"ok": True}
        self.close_empty_tabs()
        return out

    def close(self):
        self.context.close()  # writes the video, if any
        self.browser.close()


def handler(b, key, done):
    """The HTTP handler: checks the key, runs one command, answers with JSON."""

    class Handler(BaseHTTPRequestHandler):
        timeout = 10  # a request that never completes must not hold the browser

        def do_POST(self):
            # A page in the browser can send requests to 127.0.0.1 as well: no key, no command
            if not hmac.compare_digest(self.headers.get("X-Browser-Key", ""), key):
                self.send_error(403)
                return
            try:
                req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                if req["do"] == "stop":
                    done.append(True)
                    out = {"ok": True}
                else:
                    out = b.do(req["do"], req.get("args", []))
            except (Exception, SystemExit) as e:  # the agent reads what went wrong and tries something else
                first = str(e).splitlines()[0][:200] if str(e) else ""
                out = {"error": f"{e.__class__.__name__}: {first}"}
            body = json.dumps(out).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    return Handler


def serve():
    from playwright.sync_api import sync_playwright

    server = HTTPServer(("127.0.0.1", PORT), BaseHTTPRequestHandler)  # first: a busy port stops here
    server.timeout = 0.05
    with sync_playwright() as pw:
        b, done, key = Browser(pw, os.environ), [], secrets.token_hex(16)
        server.RequestHandlerClass = handler(b, key, done)
        fd = os.open(key_file(), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(key)
        print(f"browser ready: {b.engine}, port {PORT}", flush=True)
        while not done:
            server.handle_request()
            b.pump()
        server.server_close()
        b.close()
        with contextlib.suppress(OSError):
            os.remove(key_file())


if __name__ == "__main__":
    if sys.argv[1:] == ["serve"]:
        serve()
    elif len(sys.argv) > 1:
        out = call(sys.argv[1], *sys.argv[2:])
        if out.get("error"):
            raise SystemExit(out["error"])
        if out.get("note") or out.get("chosen"):
            print(out.get("note") or f"chosen: {out['chosen']}")
    else:
        raise SystemExit(__doc__)
