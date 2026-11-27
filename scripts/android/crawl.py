"""The map maker with no model: a robot that opens every control of the app once.

Usage: python3 scripts/android/crawl.py <results dir> --app-id <package> --persona <id>
                                       [--taps 150] [--minutes 15] [--depth 8]

It uses the tools an agent uses, so its taps are written as ECR traces the same way:
screen.py to look, adb (through scripts/android/shim/adb) to tap, type.py to type.
On each screen it fills the empty fields once with test values, then taps each control
not tried yet, depth first. A screen is new when it shares under 60% of its controls with
every screen seen (the dashboard's measure). To come back it presses Back; when Back does
not lead where it should, it starts the app again from a clean state and taps the way back.

Each start of the app is one folder, map-01, map-02... with its screens and its trace.json:
every trace starts with launchApp (clean state), so each one replays with no model.
At the top: findings.json ({"mode": "map", "robot": true, "screens_found": [...],
"blocked": [...]}) and report.md. "blocked" lists the screens with fields from which no
tap led anywhere and which answered only with an error, or not at all: a form the robot
could not pass (scripts/android/run_agent.sh can hand those to an agent, map=robot+agent).

It never taps a control whose name says it deletes, pays, buys or signs out, and it does
not scroll: a control below the fold is not opened (the agent can go further).
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from dashboard import similarity, screen_elements, title_of  # noqa: E402

SAME = 0.6
DANGER = re.compile(
    r"\b(delete|remove|supprimer|effacer|retirer|pay|payer|buy|acheter|purchase|checkout|order|commander|"
    r"log ?out|sign ?out|d[ée]connexion|se d[ée]connecter|reset|erase|unsubscribe|close account|report|signaler|"
    r"block|bloquer|uninstall|wipe)\b", re.I)
DANGER_EXACT = {"x", "×", "✕", "✖", "🗑"}
SKIP_FIELD = re.compile(r"search|recherch|find|filter|filtr", re.I)
SYSTEM = {"com.android.systemui"}
ERROR = re.compile(r"error|invalid|wrong|required|failed|incorrect|erreur|invalide|obligatoire|[ée]chec|incorrect", re.I)


def value_for(field):
    """A test value chosen from what a field says it wants. Search fields are left empty."""
    said = f"{field['label']} {field['id']}"
    if field["password"] or re.search(r"pass|mot de passe|pin\b", said, re.I):
        return "Map-test-123"
    if re.search(r"mail", said, re.I):
        return "map@example.com"
    if SKIP_FIELD.search(said):
        return None
    if re.search(r"phone|t[ée]l|mobile", said, re.I):
        return "0612345678"
    if re.search(r"zip|postal|code|age\b|number|num[ée]ro|amount|montant|qty|quantit|year|ann[ée]e", said, re.I):
        return "42"
    if re.search(r"name|nom|pr[ée]nom", said, re.I):
        return "Map Tester"
    return "Test"


def read_view(xml_text):
    """What the robot sees on a screen tree: its packages, its fields and the controls it can tap."""
    try:
        root = ET.fromstring(xml_text[xml_text.find("<"):]) if "<" in xml_text else ET.Element("hierarchy")
    except ET.ParseError:
        root = ET.Element("hierarchy")
    packages, fields, controls = set(), [], []

    def label_of(node):
        own = (node.get("text") or "").strip() or (node.get("content-desc") or "").strip()
        if own:
            return own.replace("\n", " ")   # a Flutter tab, "Send\nTab 2 of 3", read on one line as Maestro does
        for child in node.iter("node"):
            inner = (child.get("text") or "").strip() or (child.get("content-desc") or "").strip()
            if inner:
                return inner.replace("\n", " ")
        return ""

    for node in root.iter("node"):
        package = node.get("package") or ""
        if package in SYSTEM:
            continue
        if package:
            packages.add(package)
        bounds = [int(v) for v in re.findall(r"-?\d+", node.get("bounds", ""))]
        if len(bounds) != 4 or bounds[2] <= bounds[0] or bounds[3] <= bounds[1]:
            continue
        item = {"label": label_of(node)[:120], "id": (node.get("resource-id") or "").strip(),
                "centre": ((bounds[0] + bounds[2]) // 2, (bounds[1] + bounds[3]) // 2),
                "password": node.get("password") == "true"}
        if node.get("class", "").endswith("EditText"):
            fields.append(item)
        elif node.get("clickable") == "true":
            controls.append(item)
    # the same name more than once (a list of "x"): which one, counted top to bottom
    seen = {}
    for c in sorted(controls, key=lambda c: (c["centre"][1], c["centre"][0])):
        name = c["label"] or c["id"]
        c["which"] = seen.get(name, 0)
        seen[name] = c["which"] + 1
    return packages, fields, controls


def signature(fields, controls):
    """What identifies a screen for the robot: ids and names of its controls, and how many fields it has.
    A field's text is left out: it changes when the robot types."""
    found = {f"field:{i}" for i in range(len(fields))}
    for f in fields:
        if f["id"]:
            found.add("id:" + f["id"])
    for c in controls:
        if c["id"]:
            found.add("id:" + c["id"])
        if c["label"] and len(c["label"]) <= 40 and c["label"].strip("0123456789 :.,%"):
            found.add("label:" + c["label"])
    return found


def control_key(c):
    return (c["label"], c["id"], c["which"]) if (c["label"] or c["id"]) else ("", "", c["centre"])


def dangerous(c):
    name = c["label"].strip()
    return name.lower() in DANGER_EXACT or bool(DANGER.search(name)) or bool(DANGER.search(c["id"].replace("_", " ")))


class Phone:
    """The real emulator, through the same tools as an agent. Taps go through the adb shim,
    which notes them in $ECR_ACTION_LOG (set for each start of the app)."""

    def __init__(self, app_id):
        self.app_id = app_id

    def adb(self, *args, quiet=False):
        env = dict(os.environ, **({"ECR_SHIM_QUIET": "1"} if quiet else {}))
        done = subprocess.run(["adb", *args], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True, errors="replace", check=False, timeout=120)
        return done.stdout or ""

    def look(self, folder, number):
        done = subprocess.run([sys.executable, "scripts/android/screen.py", str(folder), number], cwd=ROOT,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace", check=False, timeout=180)
        return done.stdout or ""

    def tap(self, x, y):
        self.adb("shell", "input", "tap", str(x), str(y))
        time.sleep(1.5)

    def back(self):
        self.adb("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(1.5)

    def type(self, text):
        subprocess.run([sys.executable, "scripts/android/type.py", text], cwd=ROOT, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, check=False, timeout=120)

    def hide_keyboard(self):
        if "mInputShown=true" in self.adb("shell", "dumpsys", "input_method", quiet=True):
            self.back()

    def restart(self):
        """A clean start, as launchApp with clearState does in the replay (and it allows every permission)."""
        self.adb("shell", "am", "force-stop", self.app_id, quiet=True)
        self.adb("shell", "pm", "clear", self.app_id, quiet=True)
        dump = self.adb("shell", "dumpsys", "package", self.app_id, quiet=True)
        wanted = re.search(r"requested permissions:(.*?)(?:install permissions:|runtime permissions:|\n\s*\n)", dump, re.S)
        for permission in re.findall(r"(android\.permission\.[A-Z_]+)", wanted.group(1) if wanted else ""):
            self.adb("shell", "pm", "grant", self.app_id, permission, quiet=True)
        self.adb("shell", "monkey", "-p", self.app_id, "-c", "android.intent.category.LAUNCHER", "1", quiet=True)
        for _ in range(15):   # a first start can take a while (a splash screen, a JavaScript bundle to load)
            time.sleep(3)
            self.adb("shell", "uiautomator", "dump", "/data/local/tmp/crawl.xml", quiet=True)
            packages, fields, controls = read_view(self.adb("exec-out", "cat", "/data/local/tmp/crawl.xml", quiet=True))
            if self.app_id in packages and (fields or controls):
                break


class Crawler:
    def __init__(self, phone, results, app_id, taps=150, minutes=15.0, depth=8, clock=time.monotonic):
        self.phone, self.results, self.app_id = phone, Path(results), app_id
        self.budget, self.depth, self.clock = taps, depth, clock
        self.began = clock()
        self.deadline = self.began + minutes * 60
        self.screens, self.issues, self.left_app = [], [], []
        self.taps, self.starts, self.number = 0, 0, 0
        self.folder, self.filled, self.view, self.here = None, set(), None, None

    # ---------- seeing ----------
    def look(self):
        self.number += 1
        number = f"{self.number:02d}"
        printed = self.phone.look(self.folder, number)
        xml_path = self.folder / f"{number}.xml"
        try:
            xml_text = xml_path.read_text(encoding="utf-8")
        except OSError:
            xml_text = ""
        packages, fields, controls = read_view(xml_text)
        if "ERRORS SINCE LAST SCREENSHOT" in printed:
            self.issues.append({"title": "An error or a crash was logged", "severity": "major",
                                "screens": [f"{self.folder.name}/{number}"], "folder": self.folder.name})
        texts = set(re.findall(r'text="([^"]+)"', xml_text))
        self.view = {"number": number, "packages": packages, "fields": fields, "controls": controls, "texts": texts,
                     "signature": signature(fields, controls), "xml": xml_path}
        return self.view

    def in_app(self, view=None):
        view = view or self.view
        return self.app_id in view["packages"]

    def match(self, view=None):
        view = view or self.view
        best, score = None, 0.0
        for screen in self.screens:
            s = similarity(view["signature"], screen["signature"])
            if s > score:
                best, score = screen, s
        return best if score >= SAME else None

    def add(self, parent, step):
        view = self.view
        name = title_of(screen_elements(view["xml"])) or next((c["label"] for c in view["controls"] if c["label"]), "")
        name = name or f"Screen {len(self.screens) + 1}"
        if any(s["name"] == name for s in self.screens):
            name = f"{name} ({len(self.screens) + 1})"
        screen = {"index": len(self.screens), "name": name, "signature": view["signature"], "parent": parent,
                  "path": (parent["path"] + [step]) if parent else [], "tried": set(), "done": False,
                  "fields": len(view["fields"]), "leads": set(), "pending": None, "answered": False, "seen": [f"{self.folder.name}/{view['number']}"]}
        self.screens.append(screen)
        return screen

    def arrive(self, parent=None, step=None):
        """Which screen the robot is on now, added when it is new and not too deep."""
        if not self.in_app():
            self.here = None
            return None
        screen = self.match()
        if screen is None and (parent is None or len(parent["path"]) < self.depth):
            screen = self.add(parent, step)
        elif screen is not None:
            where = f"{self.folder.name}/{self.view['number']}"
            if where not in screen["seen"]:
                screen["seen"].append(where)
        self.here = screen
        return screen

    # ---------- acting ----------
    def out_of_budget(self):
        return self.taps >= self.budget or self.clock() >= self.deadline

    def tap(self, control):
        self.taps += 1
        self.phone.tap(*control["centre"])

    def start(self):
        """A new start of the app from a clean state: a new folder and a new trace."""
        self.starts += 1
        self.folder = self.results / f"map-{self.starts:02d}"
        self.folder.mkdir(parents=True, exist_ok=True)
        os.environ["ECR_ACTION_LOG"] = str(self.folder / "actions.tsv")
        (self.folder / "actions.tsv").write_text("", encoding="utf-8")
        self.number, self.filled = 0, set()
        self.phone.restart()
        self.look()

    def fill(self, screen):
        """The empty fields of this screen, once per start of the app, with test values."""
        self.filled.add(screen["index"])
        typed = False
        for field in self.view["fields"]:
            value = value_for(field)
            if value is None:
                continue
            self.tap(field)
            self.phone.type(value)
            self.phone.hide_keyboard()
            typed = True
        if typed:
            self.look()
            self.arrive(screen["parent"], screen["path"][-1] if screen["path"] else None)

    def find(self, step):
        same = [c for c in self.view["controls"] if control_key(c) == step["key"]]
        if same:
            return same[0]
        named = [c for c in self.view["controls"] if step["label"] and c["label"] == step["label"]]
        return named[0] if named else None

    def go_to(self, target):
        """Back while it leads up towards the target, else a clean start and the target's path."""
        ancestors, s = [], self.here
        while s is not None:
            ancestors.append(s)
            s = s["parent"]
        if target in ancestors and self.here is not target:
            for _ in range(ancestors.index(target) + 1):
                self.phone.back()
                self.look()
                if not self.in_app() or self.match() is None:
                    break
                self.arrive()
                if self.here is target:
                    return True
        if self.here is target:
            return True
        self.start()
        self.arrive()
        for step in target["path"]:
            if self.here is None or self.out_of_budget():
                return False
            if self.here["index"] not in self.filled and self.here["fields"]:
                self.fill(self.here)
            control = self.find(step)
            if control is None:
                return False
            self.tap(control)
            self.look()
            self.arrive()
        if self.here is target and target["index"] not in self.filled and target["fields"]:
            self.fill(target)
        return self.here is target

    def next_target(self):
        """The nearest screen not finished: an ancestor first, then any other one."""
        for screen in self.screens:   # every control seen on it was opened: no need to go back there
            if screen["pending"] == 0 and screen is not self.here:
                screen["done"] = True
        s = self.here["parent"] if self.here else None
        while s is not None:
            if not s["done"]:
                return s
            s = s["parent"]
        left = [s for s in self.screens if not s["done"]]
        return min(left, key=lambda s: len(s["path"])) if left else None

    def run(self):
        self.start()
        self.arrive()
        if self.here is None:
            self.issues.append({"title": "The app did not open on a screen of its own", "severity": "critical",
                                "screens": [f"{self.folder.name}/{self.view['number']}"]})
            return
        while not self.out_of_budget():
            screen = self.here
            if screen is None:   # outside the app, or a screen too deep to keep
                target = self.next_target()
                if target is None or not self.go_to(target):
                    if target is not None:
                        target["done"] = True
                    if target is None:
                        break
                continue
            if screen["index"] not in self.filled and self.view["fields"]:
                self.fill(screen)
                if self.here is not screen:
                    continue
            control = next((c for c in self.view["controls"]
                            if control_key(c) not in screen["tried"] and not dangerous(c)), None)
            if control is None:
                screen["done"] = True
                target = self.next_target()
                if target is None:
                    break
                if not self.go_to(target):
                    target["done"] = True
                    if self.here is None:
                        self.start()
                        self.arrive()
                continue
            key = control_key(control)
            screen["tried"].add(key)
            screen["pending"] = sum(1 for c in self.view["controls"] if control_key(c) not in screen["tried"] and not dangerous(c))
            step = {"key": key, "label": control["label"], "id": control["id"]}
            before = self.view["texts"]
            self.tap(control)
            self.look()
            appeared = self.view["texts"] - before
            if appeared and not any(ERROR.search(t) for t in appeared):
                screen["answered"] = True   # the screen took the tap (a task added, a message sent): not a dead end
            if not self.in_app():
                self.left_app.append({"screen": screen["name"], "control": control["label"] or control["id"] or "unnamed"})
                self.phone.back()
                self.look()
            reached = self.arrive(screen, step)
            if reached is not None and reached is not screen:
                screen["leads"].add(reached["index"])

    # ---------- writing ----------
    def report(self, persona):
        def path_of(screen):
            names, s = [], screen["parent"]
            while s is not None:
                names.append(s["name"])
                s = s["parent"]
            return " > ".join(reversed(names)) or "(launch)"

        # a form the robot could not pass: no tap led anywhere, and the screen only answered with errors, or not at all
        blocked = [s for s in self.screens if s["fields"] and not s["leads"] and not s["answered"]]
        found = [{"name": s["name"], "screens": s["seen"], "path": path_of(s)} for s in self.screens]
        summary = {"mode": "map", "robot": True, "issues": self.issues, "screens_found": found,
                   "blocked": [{"name": s["name"], "path": path_of(s), "screens": s["seen"]} for s in blocked],
                   "left_app": self.left_app, "taps": self.taps, "starts": self.starts,
                   "finished": not self.out_of_budget(), "seconds": round(self.clock() - self.began)}
        (self.results / "findings.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        for n in range(1, self.starts + 1):   # each start of the app is a map maker's path on the map
            folder = self.results / f"map-{n:02d}"
            own = [dict(f, screens=[x.split("/", 1)[1] for x in f["screens"] if x.startswith(folder.name + "/")]) for f in found]
            (folder / "findings.json").write_text(json.dumps({
                "mode": "map", "robot": True,
                "issues": [dict(i, screens=[x.split("/", 1)[1] for x in i["screens"]]) for i in self.issues if i.get("folder") == folder.name],
                "screens_found": [f for f in own if f["screens"]]}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        lines = [f"# Map of the app, by the robot ({persona})", "",
                 f"{len(self.screens)} screens found with {self.taps} taps and {self.starts} starts of the app"
                 + ("." if summary["finished"] else ", before the budget ran out: some controls were not opened."), "",
                 "## Screens", ""]
        lines += [f"- **{f['name']}**: from {f['path']}, seen on {', '.join(f['screens'])}" for f in found]
        if blocked:
            lines += ["", "## Forms the robot could not pass", "",
                      "With test values in every field, no control of these screens led anywhere:", ""]
            lines += [f"- **{b['name']}**: from {b['path']}" for b in summary["blocked"]]
        if self.left_app:
            lines += ["", "## Controls that leave the app", ""]
            lines += [f"- {x['control']} on {x['screen']}" for x in self.left_app]
        if self.issues:
            lines += ["", "## Errors", ""] + [f"- {i['title']} ({', '.join(i['screens'])})" for i in self.issues]
        lines += ["", "Not opened by design: controls that delete, pay, buy or sign out, and anything below the fold (no scrolling)."]
        (self.results / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("results")
    parser.add_argument("--app-id", required=True)
    parser.add_argument("--persona", required=True)
    parser.add_argument("--taps", type=int, default=150)
    parser.add_argument("--minutes", type=float, default=15)
    parser.add_argument("--depth", type=int, default=8)
    args = parser.parse_args(argv)
    results = Path(args.results)
    results.mkdir(parents=True, exist_ok=True)
    crawler = Crawler(Phone(args.app_id), results, args.app_id, args.taps, args.minutes, args.depth)
    crawler.run()
    summary = crawler.report(args.persona)
    for n in range(1, crawler.starts + 1):
        subprocess.run([sys.executable, "scripts/ecr_trace.py", str(results / f"map-{n:02d}"), "--persona", args.persona,
                        "--app-id", args.app_id], cwd=ROOT, check=False)
    # public log: counts only, no screen names (they may come from a private app)
    print(f"map: {len(summary['screens_found'])} screens, {summary['taps']} taps, {summary['starts']} starts of the app, "
          f"{len(summary['blocked'])} forms not passed{'' if summary['finished'] else ', budget used up'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
