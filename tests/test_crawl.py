"""The map maker with no model (scripts/android/crawl.py), on a made-up app with no phone."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from xml.sax.saxutils import quoteattr

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts" / "android"))
import crawl  # noqa: E402

APP = "com.example.shop"


def node(cls, text="", bounds=(0, 0, 100, 100), clickable=False, package=APP, rid="", password=False, children=""):
    x1, y1, x2, y2 = bounds
    return (f'<node class="{cls}" package="{package}" text={quoteattr(text)} content-desc="" resource-id="{rid}" '
            f'clickable="{str(clickable).lower()}" password="{str(password).lower()}" bounds="[{x1},{y1}][{x2},{y2}]">{children}</node>')


class FakeShop:
    """An app with a sign-up form, a home, settings, help and a contact form whose Send does nothing.
    Back goes up a stack; Back on the home leaves the app, as on Android after a sign-up, so the
    robot has to start the app again to open "Terms" on the sign-up form."""

    SCREENS = {
        "signup": ("Create your account", ["Name", "Email", "Password"], ["Continue", "Terms"]),
        "terms": ("Terms of use", [], []),
        "home": ("Your tasks", ["Search"], ["Settings", "x", "Delete all", "Open the website"]),
        "settings": ("Settings", [], ["Help", "Log out"]),
        "help": ("Help", [], ["Contact us", "Notes"]),
        "notes": ("Your notes", ["Note"], ["Save"]),
        "contact": ("Write to us", ["Message"], ["Send"]),
    }

    def __init__(self):
        self.restarts, self.taps = 0, []
        self.restart()

    def restart(self):
        self.restarts += 1
        self.stack, self.values, self.focus, self.outside, self.said = ["signup"], {}, None, False, {}

    def layout(self):
        if self.outside:
            return [], []
        title, fields, controls = self.SCREENS[self.stack[-1]]
        placed_fields = [(f, (0, 200 + 100 * i, 1000, 280 + 100 * i)) for i, f in enumerate(fields)]
        placed_controls = [(c, (0, 600 + 100 * i, 1000, 680 + 100 * i)) for i, c in enumerate(controls)]
        return placed_fields, placed_controls

    def xml(self):
        if self.outside:
            body = node("android.widget.FrameLayout", "Browser", package="com.android.chrome")
        else:
            title = self.SCREENS[self.stack[-1]][0]
            fields, controls = self.layout()
            body = node("android.widget.TextView", title, (0, 50, 1000, 120))
            if self.stack[-1] in self.said:
                body += node("android.widget.TextView", self.said[self.stack[-1]], (0, 130, 1000, 190))
            body += "".join(node("android.widget.EditText", self.values.get((self.stack[-1], f), f), b, True,
                                 password=f == "Password") for f, b in fields)
            body += "".join(node("android.view.ViewGroup", "", b, True, children=node("android.widget.TextView", c, b))
                            for c, b in controls)
        status = node("android.widget.FrameLayout", "12:00", package="com.android.systemui")
        return f'<?xml version="1.0"?><hierarchy rotation="0">{status}{node("android.widget.FrameLayout", package="com.android.chrome" if self.outside else APP, children=body)}</hierarchy>'

    def look(self, folder, number):
        (Path(folder) / f"{number}.xml").write_text(self.xml(), encoding="utf-8")
        return ""

    def tap(self, x, y):
        fields, controls = self.layout()
        hit = next((name for name, (x1, y1, x2, y2) in fields + controls if x1 <= x <= x2 and y1 <= y <= y2), None)
        self.taps.append(hit)
        here = self.stack[-1] if self.stack else None
        if hit in [f for f, _ in fields]:
            self.focus = (here, hit)
        elif hit == "Continue" and "@" in self.values.get(("signup", "Email"), "") and self.values.get(("signup", "Password")):
            self.stack = ["home"]
        elif hit in ("Delete all", "x", "Log out"):
            raise AssertionError(f"the robot tapped {hit!r}")
        elif hit == "Terms":
            self.stack.append("terms")
        elif hit == "Settings":
            self.stack.append("settings")
        elif hit == "Help":
            self.stack.append("help")
        elif hit == "Contact us":
            self.stack.append("contact")
        elif hit == "Notes":
            self.stack.append("notes")
        elif hit == "Save":
            self.said["notes"] = "Saved"
        elif hit == "Send":
            self.said["contact"] = "Something went wrong"
        elif hit == "Open the website":
            self.outside = True

    def back(self):
        if self.outside:
            self.outside = False
        elif len(self.stack) > 1:
            self.stack.pop()
        else:
            self.outside, self.stack = True, ["gone"]
            self.SCREENS.setdefault("gone", ("", [], []))

    def type(self, text):
        if self.focus:
            self.values[self.focus] = text

    def hide_keyboard(self):
        pass


class CrawlTest(unittest.TestCase):
    def crawl(self, **budget):
        phone = FakeShop()
        folder = Path(tempfile.mkdtemp())
        crawler = crawl.Crawler(phone, folder, APP, **budget)
        crawler.run()
        return phone, folder, crawler, crawler.report("anna")

    def test_every_screen_is_found_without_a_dangerous_tap(self):
        phone, folder, crawler, summary = self.crawl()
        names = [s["name"] for s in summary["screens_found"]]
        self.assertEqual(names, ["Create your account", "Your tasks", "Settings", "Help", "Write to us", "Your notes", "Terms of use"])
        self.assertTrue(summary["finished"])
        self.assertEqual(summary["screens_found"][4]["path"], "Create your account > Your tasks > Settings > Help")
        self.assertNotIn("Search", phone.taps)   # a search field is left empty

    def test_a_form_that_answers_only_with_an_error_is_blocked(self):
        # "Your notes" leads nowhere either, but it answers "Saved": the robot passed it
        _, _, _, summary = self.crawl()
        self.assertEqual([b["name"] for b in summary["blocked"]], ["Write to us"])

    def test_leaving_the_app_is_noted_and_the_robot_comes_back(self):
        _, _, _, summary = self.crawl()
        self.assertEqual(summary["left_app"], [{"screen": "Your tasks", "control": "Open the website"}])

    def test_back_out_of_the_app_starts_it_again_in_a_new_folder(self):
        phone, folder, crawler, summary = self.crawl()
        self.assertEqual(summary["starts"], 2)
        self.assertEqual(phone.restarts, 3)   # the fake starts once on its own
        for n in (1, 2):
            sub = json.loads((folder / f"map-0{n}" / "findings.json").read_text())
            self.assertEqual(sub["mode"], "map")
        self.assertTrue((folder / "report.md").read_text().startswith("# Map of the app"))

    def test_the_budget_stops_the_robot(self):
        _, _, crawler, summary = self.crawl(taps=3)
        self.assertFalse(summary["finished"])
        self.assertLessEqual(crawler.taps, 4)

    def test_values_follow_what_a_field_asks(self):
        field = lambda label, password=False: {"label": label, "id": "", "password": password}
        self.assertEqual(crawl.value_for(field("Email")), "map@example.com")
        self.assertEqual(crawl.value_for(field("", True)), "Map-test-123")
        self.assertIsNone(crawl.value_for(field("Rechercher")))
        self.assertEqual(crawl.value_for(field("Prénom")), "Map Tester")

    def test_dangerous_names(self):
        named = lambda label, rid="": {"label": label, "id": rid}
        for label in ("Delete account", "Supprimer", "x", "Log out", "Pay now"):
            self.assertTrue(crawl.dangerous(named(label)), label)
        for label in ("Settings", "Continue", "Payments history"):
            self.assertFalse(crawl.dangerous(named(label)), label)
        self.assertTrue(crawl.dangerous(named("", "btn_delete")))

    def test_typed_text_does_not_change_the_screen(self):
        shop = FakeShop()
        _, before_fields, before = (None, *crawl.read_view(shop.xml())[1:])
        shop.values[("signup", "Name")] = "Map Tester"
        _, after_fields, after = crawl.read_view(shop.xml())
        self.assertEqual(crawl.signature(before_fields, before), crawl.signature(after_fields, after))


if __name__ == "__main__":
    unittest.main()


class OneLineNamesTest(unittest.TestCase):
    def test_a_name_on_two_lines_is_read_on_one_as_maestro_does(self):
        sys.path.insert(0, str(ROOT / "scripts"))
        import dashboard
        xml = ('<?xml version="1.0"?><hierarchy><node class="android.view.View" package="x" text="" '
               'content-desc="Send&#10;Tab 2 of 3" resource-id="" clickable="true" bounds="[0,0][100,100]"/></hierarchy>')
        self.assertEqual(crawl.read_view(xml)[2][0]["label"], "Send Tab 2 of 3")
        path = Path(tempfile.mkdtemp()) / "01.xml"
        path.write_text(xml, encoding="utf-8")
        self.assertEqual(dashboard.screen_elements(path)[0]["label"], "Send Tab 2 of 3")


class MapStatsTest(unittest.TestCase):
    def test_screens_the_agent_adds_and_what_each_one_cost(self):
        sys.path.insert(0, str(ROOT / "scripts"))
        import map_stats
        phone, folder, crawler, _ = CrawlTest().crawl()
        agent = folder / "agent"
        agent.mkdir()
        shop = FakeShop()
        (agent / "01.xml").write_text(shop.xml(), encoding="utf-8")            # the sign-up form, already found
        shop.SCREENS["thanks"] = ("Message sent", [], ["Back to help", "Rate us"])
        shop.stack = ["thanks"]
        (agent / "02.xml").write_text(shop.xml(), encoding="utf-8")            # behind the contact form
        (agent / "findings.json").write_text(json.dumps({"mode": "map", "screens_found": [
            {"name": "Sign-up", "screens": ["01"]}, {"name": "Message sent", "screens": ["02"]}]}))
        out = folder / "agent-output.json"
        out.write_text(json.dumps({"num_turns": 12, "total_cost_usd": 0.05, "result": "private"}))
        result = map_stats.stats(folder, out)
        self.assertEqual([s["name"] for s in result["screens"] if s["found_by"] == "agent"], ["Message sent"])
        self.assertEqual(result["blocked"], ["Write to us"])
        self.assertEqual(result["agent"], {"num_turns": 12, "total_cost_usd": 0.05})
        self.assertEqual(result["robot"]["taps"], crawler.taps)
