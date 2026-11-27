"""scripts/ecr_trace.py and the notes it reads, offline: a stand-in for the real adb,
screen trees written by hand, no phone."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import ecr_trace as tracer  # noqa: E402

LOGIN = """<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" resource-id="" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]">
    <node text="Sign in" resource-id="app:id/title" class="android.widget.TextView" clickable="false" bounds="[40,200][1040,320]" />
    <node text="" resource-id="app:id/password" class="android.widget.EditText" clickable="true" bounds="[40,400][1040,520]" />
    <node text="Sign in" resource-id="app:id/submit" class="android.widget.Button" clickable="true" bounds="[40,600][1040,720]" />
    <node text="" content-desc="Help" resource-id="" class="android.widget.ImageButton" clickable="true" bounds="[940,40][1040,140]" />
    <node text="Costs ${price}" resource-id="app:id/promo" class="android.widget.TextView" bounds="[40,800][1040,900]" />
  </node>
</hierarchy>
"""
APP = LOGIN.replace("<node ", '<node package="com.example.todo" ')   # what a real phone writes: the app of each element
LAUNCHER = """<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" package="com.google.android.apps.nexuslauncher" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]">
    <node text="Phone" package="com.google.android.apps.nexuslauncher" clickable="true" bounds="[40,2000][240,2200]" />
  </node>
</hierarchy>
"""
PERSONA = {"id": "anna", "profile": "Retired teacher.", "goal": "Create an account.", "locale": "en-GB",
           "device": {"name": "Small phone, Android 11", "font_scale": 1.3, "theme": "light"}}
NOW = "2026-11-25T12:00:00Z"


class Build(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        (self.dir / "01.xml").write_text(LOGIN, encoding="utf-8")
        self.screen = f"0\tscreen\t{self.dir / '01.xml'}\t1080\t2400"

    def actions(self, *lines):
        trace, values, skipped = tracer.build([self.screen, *lines], PERSONA, "com.example.todo", NOW)
        return [s["action"] for s in trace["steps"][1:]], values, skipped

    def test_first_step_launches_the_app_from_a_clean_state(self):
        trace, _, _ = tracer.build([], PERSONA, "com.example.todo", NOW)
        self.assertEqual(trace["steps"][0]["action"], {"kind": "launchApp", "appId": "com.example.todo", "clearState": True})
        self.assertEqual(trace["schema"], "ecr.trace/0")
        self.assertEqual(trace["id"], "anna-20261125T120000")
        self.assertEqual(trace["persona"]["context"], {"platform": "android", "device": "Small phone, Android 11", "fontScale": 1.3, "theme": "light"})

    def test_tap_is_stored_by_name_with_an_index_when_the_name_is_not_unique(self):
        actions, _, _ = self.actions("1\tadb\tshell\tinput\ttap\t500\t660", "1\tadb\tshell\tinput\ttap\t990\t90")
        self.assertEqual(actions, [
            {"kind": "tapOn", "target": {"text": "Sign in", "index": 1}},   # the button, not the title
            {"kind": "tapOn", "target": {"text": "Help"}},                  # a content description is a name
        ])

    def test_tap_without_a_name_falls_back_to_the_id_then_to_a_point(self):
        actions, _, _ = self.actions("1\tadb\tshell\tinput\ttap\t500\t460", "1\tadb\tshell\tinput tap 540 1800",
                                     "1\tadb\tshell\tinput\ttap\t500\t850")
        self.assertEqual(actions, [
            {"kind": "tapOn", "target": {"id": "app:id/password"}},
            {"kind": "tapOn", "target": {"point": "50%,75%"}},              # the command given as one string
            {"kind": "tapOn", "target": {"id": "app:id/promo"}},            # a name with ${ cannot be replayed as text
        ])

    def test_an_icon_with_no_name_inside_a_card_that_has_one_is_tapped_where_the_finger_was(self):
        (self.dir / "01.xml").write_text("""<hierarchy rotation="0">
  <node text="" resource-id="" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]">
    <node text="" content-desc="Pixel 4" resource-id="" class="android.view.View" bounds="[40,400][1040,800]">
      <node text="" resource-id="" class="android.widget.ImageView" bounds="[900,440][1000,540]" />
    </node>
  </node>
</hierarchy>""", encoding="utf-8")
        actions, _, _ = self.actions("1\tadb\tshell\tinput\ttap\t950\t490", "1\tadb\tshell\tinput\ttap\t300\t700",
                                     "1\tadb\tshell\tinput\tswipe\t950\t490\t950\t490\t800")
        self.assertEqual(actions, [
            {"kind": "tapOn", "target": {"text": "Pixel 4"}, "at": "91%,22%"},   # the centre of the card is not the icon
            {"kind": "tapOn", "target": {"text": "Pixel 4"}},                    # on the card itself: its centre says it
            {"kind": "longPressOn", "target": {"text": "Pixel 4"}, "at": "91%,22%"},
        ])

    def test_the_id_of_a_whole_screen_names_nothing(self):
        # A Flutter app draws itself in one view: its buttons have no id, and one with no name
        # leaves only the id of the window under the finger.
        (self.dir / "01.xml").write_text("""<hierarchy rotation="0">
  <node text="" resource-id="android:id/content" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]">
    <node text="" resource-id="" class="io.flutter.embedding.android.FlutterView" bounds="[0,0][1080,2400]">
      <node text="" content-desc="Send" resource-id="" class="android.view.View" bounds="[400,2200][680,2360]" />
      <node text="" resource-id="app:id/toolbar" class="android.view.View" bounds="[0,80][1080,240]" />
    </node>
  </node>
</hierarchy>""", encoding="utf-8")
        actions, _, _ = self.actions("1\tadb\tshell\tinput\ttap\t972\t360", "1\tadb\tshell\tinput\ttap\t540\t1200",
                                     "1\tadb\tshell\tinput\ttap\t540\t2280", "1\tadb\tshell\tinput\ttap\t100\t160")
        self.assertEqual(actions, [
            {"kind": "tapOn", "target": {"point": "90%,15%"}},
            {"kind": "tapOn", "target": {"point": "50%,50%"}},   # even at its centre: the id says nothing of what is there
            {"kind": "tapOn", "target": {"text": "Send"}},
            {"kind": "tapOn", "target": {"id": "app:id/toolbar"}},   # an id that names one part of the screen is kept
        ])

    def test_a_name_on_several_lines_is_a_name_the_replay_finds(self):
        # What Flutter says of a tab: its label, a line break, its place. Maestro matches it with a space.
        (self.dir / "01.xml").write_text("""<hierarchy rotation="0">
  <node text="" resource-id="android:id/content" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]">
    <node text="" content-desc="Receive&#10;Tab 1 of 3" resource-id="" class="android.view.View" clickable="true" bounds="[0,2200][360,2360]" />
    <node text="" content-desc="Send&#10;Tab 2 of 3" resource-id="" class="android.view.View" clickable="true" bounds="[360,2200][720,2360]" />
    <node text="" content-desc="Quick Save&#10;Off" resource-id="" class="android.view.View" bounds="[100,1200][500,1300]" />
    <node text="" content-desc="Quick Save&#10;Off" resource-id="" class="android.view.View" bounds="[100,1400][500,1500]" />
  </node>
</hierarchy>""", encoding="utf-8")
        actions, _, _ = self.actions("1\tadb\tshell\tinput\ttap\t540\t2280", "1\tadb\tshell\tinput\ttap\t300\t1450")
        self.assertEqual(actions, [
            {"kind": "tapOn", "target": {"text": "Send Tab 2 of 3"}},
            {"kind": "tapOn", "target": {"text": "Quick Save Off", "index": 1}},
        ])

    def test_the_public_line_counts_how_taps_are_found_and_shows_no_name(self):
        actions, _, _ = self.actions("1\tadb\tshell\tinput\ttap\t500\t660", "1\tadb\tshell\tinput\ttap\t500\t460",
                                     "1\tadb\tshell\tinput\ttap\t540\t1800", "1\tadb\tshell\tinput\tswipe\t500\t1500\t500\t500")
        line = tracer.found_how([{"action": a} for a in actions])
        self.assertEqual(line, "3 taps: 1 by name, 1 by id, 1 by position, 0 at a place inside the element")

    def test_typed_text_never_reaches_the_trace(self):
        trace, values, _ = tracer.build([self.screen, "0\ttype\tS3cret-pass", "0\ttype\tanna@example.com", "0\ttype\tS3cret-pass"],
                                        PERSONA, "com.example.todo", NOW)
        self.assertEqual(values, {"TEXT_1": "S3cret-pass", "TEXT_2": "anna@example.com"})
        self.assertEqual([p["name"] for p in trace["params"]], ["TEXT_1", "TEXT_2"])
        self.assertTrue(all(p["secret"] for p in trace["params"]))
        stored = json.dumps(trace)
        self.assertNotIn("S3cret-pass", stored)
        self.assertNotIn("anna@example.com", stored)
        self.assertEqual([s["action"] for s in trace["steps"][1:3]],
                         [{"kind": "eraseText"}, {"kind": "inputText", "text": {"param": "TEXT_1"}}])

    def test_a_tap_on_a_typed_text_shown_on_the_screen_keeps_it_out_of_the_trace(self):
        (self.dir / "02.xml").write_text(LOGIN.replace('text="Sign in" resource-id="app:id/submit"', 'text="Buy milk today" resource-id="app:id/submit"')
                                         .replace('content-desc="Help"', 'content-desc="Buy milk"'), encoding="utf-8")
        trace, values, _ = tracer.build([self.screen, "0\ttype\tBuy milk", f"0\tscreen\t{self.dir / '02.xml'}\t1080\t2400",
                                         "0\tadb\tshell\tinput\ttap\t500\t660", "0\tadb\tshell\tinput\ttap\t990\t90"],
                                        PERSONA, "com.example.todo", NOW)
        self.assertEqual(values, {"TEXT_1": "Buy milk"})
        self.assertEqual([s["action"]["target"] for s in trace["steps"][3:]],
                         [{"id": "app:id/submit"},                 # the name holds the typed text: the id is used
                          {"text": {"param": "TEXT_1"}}])          # the name is the typed text: stored under its name
        self.assertNotIn("Buy milk", json.dumps(trace))

    def test_same_names_are_counted_the_way_the_replay_counts_them(self):
        # React Native: a button carries the text of its label as its description, so both share a name.
        # Maestro keeps the deepest element of each, then counts from the top of the screen, then from the left.
        (self.dir / "03.xml").write_text("""<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" resource-id="" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]">
    <node text="" content-desc="Add" resource-id="" class="android.view.ViewGroup" clickable="true" bounds="[40,2000][1040,2140]">
      <node text="Add" resource-id="" class="android.widget.TextView" bounds="[480,2040][600,2100]" />
    </node>
    <node text="" content-desc="Delete" resource-id="row-delete" class="android.view.ViewGroup" clickable="true" bounds="[900,900][1040,1000]">
      <node text="Delete" resource-id="" class="android.widget.TextView" bounds="[920,920][1020,980]" />
    </node>
    <node text="" content-desc="Delete" resource-id="app:id/row-delete" class="android.view.ViewGroup" clickable="true" bounds="[900,600][1040,700]">
      <node text="Delete" resource-id="" class="android.widget.TextView" bounds="[920,620][1020,680]" />
    </node>
    <node text=" padded " resource-id="app:id/padded" class="android.widget.TextView" bounds="[40,1200][1040,1300]" />
  </node>
</hierarchy>
""", encoding="utf-8")
        tap = lambda x, y: f"0\tadb\tshell\tinput\ttap\t{x}\t{y}"  # noqa: E731
        trace, _, _ = tracer.build([f"0\tscreen\t{self.dir / '03.xml'}\t1080\t2400",
                                    tap(540, 2070), tap(100, 2010), tap(970, 950), tap(970, 650), tap(905, 605), tap(500, 1250)],
                                   PERSONA, "com.example.todo", NOW)
        steps = trace["steps"][1:]
        self.assertEqual([s["action"]["target"] for s in steps], [
            {"text": "Add"},                    # on the label: one element for the replay, so no index
            {"text": "Add"},                    # on the button around it: the same element
            {"text": "Delete", "index": 1},     # first in the file, second from the top
            {"text": "Delete", "index": 0},
            {"text": "Delete", "index": 0},     # on the edge of the button, outside its label
            {"id": "app:id/padded"},            # a name with spaces around it would not match: the id is used
        ])
        self.assertEqual(steps[1]["evidence"]["bounds"], [480, 2040, 600, 2100])   # the element the replay acts on
        nodes = tracer.read_screen(self.dir / "03.xml")
        self.assertEqual(len(tracer.found_by(nodes, "id", "row-delete")), 2)       # an id also matches without its prefix
        self.assertEqual(len(tracer.found_by(nodes, "id", "app:id/row-delete")), 1)

    def test_coming_back_to_the_app_with_adb_opens_it_again_in_the_trace(self):
        (self.dir / "01.xml").write_text(APP, encoding="utf-8")
        (self.dir / "02.xml").write_text(LAUNCHER, encoding="utf-8")
        trace, _, skipped = tracer.build([
            self.screen, "1\tadb\tshell\tinput\tkeyevent\tKEYCODE_BACK", f"2\tscreen\t{self.dir / '02.xml'}\t1080\t2400",
            "3\tadb\tshell\tmonkey\t-p\tcom.example.todo\t-c\tandroid.intent.category.LAUNCHER\t1",   # the agent comes back
            self.screen, "5\tadb\tshell\tinput\ttap\t990\t90",
            "6\tadb\tshell\tam start -n com.example.todo/.MainActivity",   # the app is in front: nothing changes
            "7\tadb\tshell\tam\tforce-stop\tcom.example.todo", "8\tadb\tshell\tmonkey\t-p\tcom.other.app\t1"], PERSONA, "com.example.todo", NOW)
        self.assertEqual([s["action"] for s in trace["steps"][1:]], [
            {"kind": "pressKey", "key": "Back"},
            {"kind": "launchApp", "appId": "com.example.todo"},   # its data is kept: no clearState
            {"kind": "tapOn", "target": {"text": "Help"}}])
        self.assertEqual(tracer.left_out(skipped), "am force-stop, monkey")

    def test_a_launch_is_named_in_words_of_adb_only(self):
        launch = lambda line: tracer.launch_of(line.split("\t"), "com.example.todo")  # noqa: E731
        self.assertEqual(launch("shell\tam\tstart\t-a\tandroid.intent.action.MAIN\t-p\tcom.example.todo"), "launch")
        self.assertEqual(launch("shell\tam start-activity com.example.todo/.Main"), "launch")
        self.assertEqual(launch("shell\tam\tstart\t-n\tcom.example.todos/.Main"), "am start")   # another app
        self.assertEqual(launch("shell\tam\tbroadcast\t-a\tA secret text"), "am broadcast")
        self.assertEqual(launch("shell\tam\tA secret text"), "am other")
        self.assertEqual(launch("shell\tam\tsecret"), "am other")   # only known commands are named
        self.assertEqual(launch("shell\tam"), "am")
        self.assertEqual(launch("shell\tmonkey\t-p"), "monkey")
        self.assertIsNone(launch("shell\tinput\ttap\t1\t2"))
        self.assertIsNone(launch("logcat\t-d"))

    def test_swipes_and_keys(self):
        actions, _, skipped = self.actions(
            "1\tadb\tshell\tinput\tswipe\t500\t1800\t500\t600\t400", "1\tadb\tshell\tinput\tswipe\t900\t1000\t100\t1010\t400",
            "1\tadb\tshell\tinput\tkeyevent\tKEYCODE_BACK", "1\tadb\tshell\tinput\tkeyevent\t66",
            "1\tadb\tshell\tinput\tkeyevent\tKEYCODE_VOLUME_UP")
        self.assertEqual(actions, [{"kind": "swipe", "direction": "UP", "from": "46%,75%", "to": "46%,25%"},   # the two ends, in percent of the screen
                                   {"kind": "swipe", "direction": "LEFT", "from": "83%,42%", "to": "9%,42%"},
                                   {"kind": "pressKey", "key": "Back"}, {"kind": "pressKey", "key": "Enter"}])
        self.assertEqual(len(skipped), 1)

    def test_a_back_that_closed_the_keyboard_is_written_as_hide_keyboard(self):
        actions, _, _ = self.actions(
            "1\ttype\tAnna",
            "1\tkeyboard\tshown", "1\tadb\tshell\tinput\tkeyevent\tKEYCODE_BACK",    # it only closed the keyboard
            "1\tkeyboard\thidden", "1\tadb\tshell\tinput\tkeyevent\t4",              # it left the screen
            "1\tkeyboard\tshown", "1\tadb\tshell\tinput keyevent 4 4",                 # the second one left the screen
            "1\tkeyboard\tshown", "1\tadb\tshell\tinput\tkeyevent\t66",              # not a Back
            "1\tadb\tshell\tinput\tkeyevent\t4")                                      # the note was for the command before
        self.assertEqual(actions, [
            {"kind": "eraseText"}, {"kind": "inputText", "text": {"param": "TEXT_1"}},
            {"kind": "hideKeyboard"},
            {"kind": "pressKey", "key": "Back"},
            {"kind": "hideKeyboard"}, {"kind": "pressKey", "key": "Back"},
            {"kind": "pressKey", "key": "Enter"},
            {"kind": "pressKey", "key": "Back"},
        ])

    def test_a_swipe_keeps_its_ends_only_when_they_still_say_its_direction(self):
        actions, _, _ = self.actions("1\tadb\tshell\tinput\tswipe\t500\t1000\t500\t1011")   # 11 pixels: the same percent
        self.assertEqual(actions, [{"kind": "swipe", "direction": "DOWN"}])
        trace, _, _ = tracer.build(["1\tadb\tshell\tinput\tswipe\t500\t1800\t500\t600"], PERSONA, "com.example.todo", NOW)
        self.assertEqual(trace["steps"][1]["action"], {"kind": "swipe", "direction": "UP"})          # no screen size known

    def test_a_tap_before_a_field_is_emptied_lands_where_its_text_ends(self):
        field, help_ = "1\tadb\tshell\tinput\ttap\t500\t460", "1\tadb\tshell\tinput\ttap\t990\t90"
        at_end = {"kind": "tapOn", "target": {"id": "app:id/password"}, "at": "97%,90%"}
        actions, _, _ = self.actions(field, "1\ttype\tS3cret-pass", field, help_, field, self.screen, "1\ttype\t",
                                     field, "1\tadb\tshell\tinput\tkeyevent\t123\t67\t67")
        self.assertEqual(actions, [
            at_end, {"kind": "eraseText"}, {"kind": "inputText", "text": {"param": "TEXT_1"}},
            {"kind": "tapOn", "target": {"id": "app:id/password"}},      # nothing is erased after it: the centre, as before
            {"kind": "tapOn", "target": {"text": "Help"}},
            at_end, {"kind": "eraseText"},                               # a screenshot in between changes nothing
            at_end, {"kind": "eraseText", "characters": 2},              # to the end then deletes, by hand
        ])
        actions, _, _ = self.actions("1\tadb\tshell\tinput tap 540 1800", "1\ttype\tx")
        self.assertEqual(actions[0], {"kind": "tapOn", "target": {"point": "50%,75%"}})   # a point has no inside

    def test_the_end_of_a_field_is_on_the_left_for_a_text_written_from_right_to_left_and_avoids_what_covers_it(self):
        lines = [self.screen, "1\tadb\tshell\tinput\ttap\t500\t460", "1\ttype\tx"]
        trace, _, _ = tracer.build(lines, dict(PERSONA, locale="ar-EG"), "com.example.todo", NOW)
        self.assertEqual(trace["steps"][1]["action"]["at"], "3%,90%")
        (self.dir / "01.xml").write_text(LOGIN.replace(   # a cross over the right end of the field
            '<node text="Costs', '<node text="" content-desc="Clear" resource-id="" class="android.widget.ImageButton" bounds="[940,400][1040,520]" />\n    <node text="Costs'), encoding="utf-8")
        trace, _, _ = tracer.build(lines, PERSONA, "com.example.todo", NOW)
        self.assertEqual(trace["steps"][1]["action"]["at"], "80%,90%")
        nodes = tracer.read_screen(self.dir / "01.xml")
        self.assertIsNone(tracer.end_of(nodes, None, 500, 460))
        self.assertIsNone(tracer.end_of(nodes, [40, 400, 40, 520], 500, 460))

    def test_a_tree_saved_just_before_a_tap_names_it_and_keeps_the_screenshot(self):
        (self.dir / "tree-3.xml").write_text(LOGIN.replace('text="Sign in" resource-id="app:id/submit"', 'text="Try again" resource-id="app:id/submit"'),
                                             encoding="utf-8")
        (self.dir / "tree-5.xml").write_text("cat: /data/local/tmp/ecr-tree.xml: No such file or directory", encoding="utf-8")
        trace, _, _ = tracer.build([self.screen, "0\tadb\tshell\tinput\ttap\t500\t660",
                                    f"0\ttree\t{self.dir / 'tree-3.xml'}", "0\tadb\tshell\tinput\ttap\t500\t660",
                                    f"0\ttree\t{self.dir / 'tree-5.xml'}", "0\tadb\tshell\tinput\ttap\t500\t660"],
                                   PERSONA, "com.example.todo", NOW)
        self.assertEqual([s["action"]["target"] for s in trace["steps"][1:]],
                         [{"text": "Sign in", "index": 1},   # named on the screenshot
                          {"text": "Try again"},              # named on the tree saved just before the tap
                          {"text": "Try again"}])             # a tree that cannot be read changes nothing
        self.assertEqual({s["evidence"]["screen"] for s in trace["steps"][1:]}, {"01"})   # the last screenshot, for tools

    def test_long_press_text_typed_with_adb_and_several_keys(self):
        actions, values, skipped = self.actions(
            "0\tadb\tshell\tinput\tswipe\t500\t660\t500\t660\t800",            # stays in place: a long press
            "0\tadb\tshell\tinput\ttouchscreen\ttap\t990\t90",                    # a source before the command
            "0\tadb\tshell\tinput\ttext\tBuy%smilk",
            "0\tadb\tshell\tinput text 'Call mum'",
            "0\tadb\tshell\tinput\tkeyevent\t67\t67\tKEYCODE_ENTER",
            "0\tadb\tshell\tinput\tkeyevent\tKEYCODE_TAB",
            "0\tadb\tshell\tinput\tkeyevent\t67\tKEYCODE_TAB",
            "0\tadb\tshell\tinput\tdraganddrop\t1\t2\t3\t4")
        self.assertEqual(actions, [
            {"kind": "longPressOn", "target": {"text": "Sign in", "index": 1}},
            {"kind": "tapOn", "target": {"text": "Help"}},
            {"kind": "inputText", "text": {"param": "TEXT_1"}},
            {"kind": "inputText", "text": {"param": "TEXT_2"}},
            {"kind": "pressKey", "key": "Backspace"}, {"kind": "pressKey", "key": "Backspace"}, {"kind": "pressKey", "key": "Enter"},
        ])
        self.assertEqual(values, {"TEXT_1": "Buy milk", "TEXT_2": "Call mum"})
        self.assertEqual(len(skipped), 3)
        self.assertEqual(tracer.left_out(skipped), "keyevent KEYCODE_TAB, draganddrop")
        self.assertEqual(tracer.left_out(["0\tadb\tshell\tinput\tsecret words here"]), "other")   # never a text

    def test_emptying_a_field_is_a_step_of_the_path(self):
        actions, values, skipped = self.actions(
            "0\ttype\tApples", "0\ttype\t",                                  # type.py "" empties the field
            "0\tadb\tshell\tinput\tkeyevent\tKEYCODE_MOVE_END",            # by hand: to the end, then three deletes
            "0\tadb\tshell\tinput\tkeyevent\t67\t67", "0\tadb\tshell\tinput\tkeyevent\tKEYCODE_DEL",
            "0\tadb\tshell\tinput\tkeyevent\t123\t67",                     # the same in one command
            "0\tadb\tshell\tinput\ttap\t990\t90",
            "0\tadb\tshell\tinput\tkeyevent\t67",                           # a delete with no move: a key
            "0\tadb\tshell\tinput\tkeyevent\tKEYCODE_MOVE_END",            # a move with no delete: left out
            "0\tadb\tshell\tinput\ttap\t990\t90")
        self.assertEqual(actions, [
            {"kind": "eraseText"}, {"kind": "inputText", "text": {"param": "TEXT_1"}},
            {"kind": "eraseText"},
            {"kind": "eraseText", "characters": 4},
            {"kind": "tapOn", "target": {"text": "Help"}},
            {"kind": "pressKey", "key": "Backspace"},
            {"kind": "tapOn", "target": {"text": "Help"}},
        ])
        self.assertEqual(tracer.left_out(skipped), "keyevent KEYCODE_MOVE_END")
        self.assertEqual(len(skipped), 1)

    def test_a_tap_uses_the_last_screen_seen_before_it(self):
        other = self.dir / "02.xml"
        other.write_text(LOGIN.replace('text="Sign in" resource-id="app:id/submit"', 'text="Create account" resource-id="app:id/submit"'), encoding="utf-8")
        actions, _, _ = self.actions("1\tadb\tshell\tinput\ttap\t500\t660", f"0\tscreen\t{other}\t1080\t2400",
                                     "1\tadb\tshell\tinput\ttap\t500\t660")
        self.assertEqual([a["target"] for a in actions], [{"text": "Sign in", "index": 1}, {"text": "Create account"}])

    def test_each_step_says_what_was_seen_for_tools_that_show_the_path(self):
        trace, _, _ = tracer.build([self.screen, "1\tadb\tshell\tinput\ttap\t500\t660", "0\ttype\thello",
                                    "1\tadb\tshell\tinput\tswipe\t500\t1800\t500\t600\t400", "1\tadb\tshell\tinput\ttap\t540\t1800"],
                                   PERSONA, "com.example.todo", NOW)
        self.assertNotIn("evidence", trace)   # no screenshot after the last action: the last screen is unknown
        after, _, _ = tracer.build([self.screen, "1\tadb\tshell\tinput\ttap\t500\t660", self.screen.replace("01.xml", "02.xml")],
                                   PERSONA, "com.example.todo", NOW)
        self.assertEqual(after["evidence"], {"lastScreen": "02"})
        seen = [s.get("evidence") for s in trace["steps"]]
        self.assertEqual(seen, [
            None,                                                                                          # launchApp: no screen yet
            {"screen": "01", "point": [500, 660], "bounds": [40, 600, 1040, 720], "size": [1080, 2400]},
            {"screen": "01"}, {"screen": "01"},                                                            # eraseText, inputText
            {"screen": "01", "from": [500, 1800], "to": [500, 600], "size": [1080, 2400]},
            {"screen": "01", "point": [540, 1800], "size": [1080, 2400]},                                  # no element: no bounds
        ])

    def test_an_unreadable_screen_or_line_does_not_stop_the_trace(self):
        (self.dir / "bad.xml").write_text("<hierarchy><node", encoding="utf-8")
        trace, _, _ = tracer.build([f"0\tscreen\t{self.dir / 'bad.xml'}\t1080\t2400", "garbage", "1\tadb\tshell\tinput\ttap\t540\t1200"],
                                   PERSONA, "com.example.todo", NOW)
        self.assertEqual(trace["steps"][1]["action"], {"kind": "tapOn", "target": {"point": "50%,50%"}})

    def test_the_trace_names_the_model_that_explored_when_the_run_says_it(self):
        output = self.dir / "agent-output.json"
        result = {"type": "result", "subtype": "success",
                  "modelUsage": {"small-model": {"outputTokens": 120}, "main-model": {"outputTokens": 9000}}}
        for printed in (result, [{"type": "system"}, result]):
            output.write_text(json.dumps(printed), encoding="utf-8")
            self.assertEqual(tracer.model_of(output), "main-model")
        for printed in ("", "not json", "{}", '{"modelUsage": {}}', '{"modelUsage": []}'):
            output.write_text(printed, encoding="utf-8")
            self.assertIsNone(tracer.model_of(output))
        self.assertIsNone(tracer.model_of(self.dir / "missing.json"))
        named, _, _ = tracer.build([self.screen], PERSONA, "com.example.todo", NOW, "main-model")
        self.assertEqual(named["provenance"], {"exploredAt": NOW, "agent": "mobile-agent-testers", "model": "main-model"})
        unnamed, _, _ = tracer.build([self.screen], PERSONA, "com.example.todo", NOW)
        self.assertNotIn("model", unnamed["provenance"])


class EndToEnd(unittest.TestCase):
    """The pass-through adb and type.py write the notes, trace.py reads them."""

    def test_notes_are_taken_and_the_real_adb_still_runs(self):
        work = Path(tempfile.mkdtemp())
        results = work / "results" / "anna"
        results.mkdir(parents=True)
        (results / "01.xml").write_text(LOGIN, encoding="utf-8")
        real = work / "real-adb"
        real.write_text('#!/usr/bin/env bash\necho "$*" >> "$FAKE_ADB_CALLS"\n')
        real.chmod(0o755)
        log = results / "actions.tsv"
        log.write_text(f"0\tscreen\t{results / '01.xml'}\t1080\t2400\n", encoding="utf-8")
        env = dict(os.environ, PATH=f"{ROOT / 'scripts/android/shim'}:{os.environ['PATH']}", ECR_REAL_ADB=str(real),
                   ECR_ACTION_LOG=str(log), FAKE_ADB_CALLS=str(work / "calls"))
        run = lambda *cmd: subprocess.run(cmd, env=env, cwd=ROOT, check=True, capture_output=True, text=True)  # noqa: E731
        run("adb", "shell", "input", "tap", "500", "460")
        run("python3", "scripts/android/type.py", "S3cret pass")
        run("adb", "shell", "input tap 500 660")
        run("adb", "logcat", "-d")                      # not an input: runs, is not noted
        run("adb", "shell", "input", "keyevent", "KEYCODE_BACK")

        calls = (work / "calls").read_text().splitlines()
        self.assertEqual(calls[0], "shell input tap 500 460")
        self.assertIn("shell input text S3cret%spass", calls)   # the real adb got every command, typing included
        self.assertIn("logcat -d", calls)
        self.assertEqual(len(log.read_text().splitlines()), 5)   # screen, tap, type, tap, key: the 42 keys of type.py are one note

        (work / "personas.json").write_text(json.dumps([PERSONA]))
        out = run("python3", "scripts/ecr_trace.py", str(results), "--persona", "anna", "--app-id", "com.example.todo",
                  "--personas", str(work / "personas.json"), "--now", NOW).stdout
        self.assertIn("6 steps, 1 typed texts kept apart, 0 commands left out", out)
        trace = json.loads((results / "trace.json").read_text())
        self.assertEqual([s["action"]["kind"] for s in trace["steps"]],
                         ["launchApp", "tapOn", "eraseText", "inputText", "tapOn", "pressKey"])
        self.assertEqual(json.loads((results / "trace.params.json").read_text()), {"TEXT_1": "S3cret pass"})
        self.assertNotIn("S3cret", (results / "trace.json").read_text())

    def test_a_tap_that_follows_no_screenshot_is_named_on_a_tree_saved_at_that_moment(self):
        work = Path(tempfile.mkdtemp())
        results = work / "results" / "anna"
        results.mkdir(parents=True)
        (results / "01.xml").write_text(LOGIN, encoding="utf-8")
        now = work / "now.xml"   # what the phone shows when the second tap comes
        now.write_text(LOGIN.replace('text="Sign in" resource-id="app:id/submit"', 'text="Try again" resource-id="app:id/submit"'), encoding="utf-8")
        real = work / "real-adb"
        real.write_text('#!/usr/bin/env bash\necho "$*" >> "$FAKE_ADB_CALLS"\n'
                        'case "$*" in "exec-out cat /data/local/tmp/ecr-tree.xml") cat "$FAKE_TREE" ;; esac\n')
        real.chmod(0o755)
        log = results / "actions.tsv"
        log.write_text(f"0\tscreen\t{results / '01.xml'}\t1080\t2400\n", encoding="utf-8")
        env = dict(os.environ, PATH=f"{ROOT / 'scripts/android/shim'}:{os.environ['PATH']}", ECR_REAL_ADB=str(real),
                   ECR_ACTION_LOG=str(log), FAKE_ADB_CALLS=str(work / "calls"), FAKE_TREE=str(now))
        run = lambda *cmd: subprocess.run(cmd, env=env, cwd=ROOT, check=True, capture_output=True, text=True)  # noqa: E731
        run("adb", "shell", "input", "tap", "500", "660")       # right after a screenshot: no tree is saved
        run("adb", "shell", "input", "tap", "500", "660")       # no screenshot since: the tree is saved first
        run("adb", "shell", "input", "keyevent", "KEYCODE_BACK")   # a key needs no tree

        kinds = [line.split("\t")[1] for line in log.read_text().splitlines()]
        self.assertEqual(kinds, ["screen", "adb", "tree", "adb", "adb"])
        calls = (work / "calls").read_text().splitlines()
        self.assertEqual(calls[0], "shell input tap 500 660")
        self.assertEqual(calls.count("shell input tap 500 660"), 2)   # the real adb got both taps
        trace, _, _ = tracer.build(log.read_text().splitlines(), PERSONA, "com.example.todo", NOW)
        self.assertEqual([s["action"].get("target") for s in trace["steps"][1:]], [{"text": "Sign in", "index": 1}, {"text": "Try again"}, None])

        env["FAKE_TREE"] = str(work / "missing.xml")             # the phone gives no tree: the tap still goes through
        run("adb", "shell", "input", "tap", "500", "660")
        self.assertEqual([line.split("\t")[1] for line in log.read_text().splitlines()][-1], "adb")
        self.assertEqual(list(results.glob("tree-*.xml")), [results / "tree-2.xml"])

    def test_a_launch_by_adb_is_noted_with_the_screen_it_left(self):
        work = Path(tempfile.mkdtemp())
        results = work / "results" / "kenji"
        results.mkdir(parents=True)
        (results / "01.xml").write_text(APP, encoding="utf-8")
        home = work / "home.xml"
        home.write_text(LAUNCHER, encoding="utf-8")
        real = work / "real-adb"
        real.write_text('#!/usr/bin/env bash\necho "$*" >> "$FAKE_ADB_CALLS"\n'
                        'case "$*" in "exec-out cat /data/local/tmp/ecr-tree.xml") cat "$FAKE_TREE" ;; esac\n')
        real.chmod(0o755)
        log = results / "actions.tsv"
        log.write_text(f"0\tscreen\t{results / '01.xml'}\t1080\t2400\n", encoding="utf-8")
        env = dict(os.environ, PATH=f"{ROOT / 'scripts/android/shim'}:{os.environ['PATH']}", ECR_REAL_ADB=str(real),
                   ECR_ACTION_LOG=str(log), FAKE_ADB_CALLS=str(work / "calls"), FAKE_TREE=str(home))
        run = lambda *cmd: subprocess.run(cmd, env=env, cwd=ROOT, check=True, capture_output=True, text=True)  # noqa: E731
        run("adb", "shell", "input", "keyevent", "KEYCODE_BACK")   # Back on the first screen: the app closes
        run("adb", "shell", "monkey", "-p", "com.example.todo", "-c", "android.intent.category.LAUNCHER", "1")   # no screenshot since
        run("adb", "shell", "input", "text", "I am back")          # a text is no launch: no tree is saved
        run("adb", "shell", "dumpsys", "window")                   # neither an input nor a launch: not noted

        kinds = [line.split("\t")[1] for line in log.read_text().splitlines()]
        self.assertEqual(kinds, ["screen", "adb", "tree", "adb", "adb"])
        calls = (work / "calls").read_text().splitlines()
        self.assertIn("shell monkey -p com.example.todo -c android.intent.category.LAUNCHER 1", calls)
        self.assertIn("shell dumpsys window", calls)
        (work / "personas.json").write_text(json.dumps([PERSONA]))
        out = run("python3", "scripts/ecr_trace.py", str(results), "--persona", "anna", "--app-id", "com.example.todo",
                  "--personas", str(work / "personas.json"), "--now", NOW).stdout
        self.assertIn("4 steps, 1 typed texts kept apart, 0 commands left out, the app opened again 1 time after the agent left it", out)
        trace = json.loads((results / "trace.json").read_text())
        self.assertEqual([s["action"]["kind"] for s in trace["steps"]], ["launchApp", "pressKey", "launchApp", "inputText"])

    def test_before_a_back_the_pass_through_notes_whether_the_keyboard_was_open(self):
        work = Path(tempfile.mkdtemp())
        results = work / "results" / "anna"
        results.mkdir(parents=True)
        (results / "01.xml").write_text(LOGIN, encoding="utf-8")
        real = work / "real-adb"   # answers like `dumpsys input_method` on a phone, with the state in $FAKE_SHOWN
        real.write_text('#!/usr/bin/env bash\necho "$*" >> "$FAKE_ADB_CALLS"\n'
                        'case "$*" in "shell dumpsys input_method") echo "  mServedInputConnection=null mInputShown=$FAKE_SHOWN" ;; esac\n')
        real.chmod(0o755)
        log = results / "actions.tsv"
        log.write_text(f"0\tscreen\t{results / '01.xml'}\t1080\t2400\n", encoding="utf-8")
        env = dict(os.environ, PATH=f"{ROOT / 'scripts/android/shim'}:{os.environ['PATH']}", ECR_REAL_ADB=str(real),
                   ECR_ACTION_LOG=str(log), FAKE_ADB_CALLS=str(work / "calls"), FAKE_SHOWN="true")
        run = lambda *cmd: subprocess.run(cmd, env=env, cwd=ROOT, check=True, capture_output=True, text=True)  # noqa: E731
        run("python3", "scripts/android/type.py", "Anna")
        run("adb", "shell", "input", "keyevent", "KEYCODE_BACK")   # closes the keyboard
        env["FAKE_SHOWN"] = "false"
        run("adb", "shell", "input keyevent 4")                    # leaves the screen
        run("adb", "shell", "input", "keyevent", "66")             # not a Back: the keyboard is not asked

        kinds = [line.split("\t")[1:3] for line in log.read_text().splitlines()]
        self.assertEqual(kinds, [["screen", str(results / "01.xml")], ["type", "Anna"], ["keyboard", "shown"], ["adb", "shell"],
                                 ["keyboard", "hidden"], ["adb", "shell"], ["adb", "shell"]])
        self.assertIn("shell input keyevent KEYCODE_BACK", (work / "calls").read_text().splitlines())   # the Back itself still runs
        trace, _, _ = tracer.build(log.read_text().splitlines(), PERSONA, "com.example.todo", NOW)
        self.assertEqual([s["action"] for s in trace["steps"][3:]],
                         [{"kind": "hideKeyboard"}, {"kind": "pressKey", "key": "Back"}, {"kind": "pressKey", "key": "Enter"}])

    def test_no_notes_writes_nothing_and_does_not_fail(self):
        work = Path(tempfile.mkdtemp())
        run = subprocess.run(["python3", "scripts/ecr_trace.py", str(work), "--persona", "anna", "--app-id", "x"],
                             cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0)
        self.assertFalse((work / "trace.json").exists())

    def test_the_tools_leave_no_file_where_the_app_can_see_it(self):
        # An agent on LocalSend sent its own screen dump, picked in the file picker of the system:
        # its path could not replay on a phone that only replays. The tools write in /data/local/tmp.
        tools = ["scripts/android/screen.py", "scripts/android/crawl.py", "scripts/android/shim/adb",
                 "scripts/android/run_agent.sh", "scripts/device_state.py"]
        for name in tools:
            with self.subTest(name):
                text = (ROOT / name).read_text(encoding="utf-8")
                self.assertNotIn("/sdcard", text)
                self.assertNotIn("/storage/", text)


if __name__ == "__main__":
    unittest.main()
