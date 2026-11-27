"""A tester with no model, to check on a real phone that a path written as a trace replays.

Usage: python3 scripts/android/replay_check.py <results dir> --ecr <checkout of explore-compile-replay>

Follows a fixed path on Tiny Todo (demo-app) with the tools an agent uses: screen.py to
look, adb to tap (through scripts/android/shim/adb, which notes each tap), type.py to type.
Then scripts/ecr_trace.py writes the trace and scripts/ecr_replay.py replays it. Exits 1
when the trace is not the one expected or when the replay does not pass.

Everything is printed: the demo app holds no data and the account is made up.
Run by .github/workflows/replay-check.yml, with no model and no secret.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
APP_ID = "com.example.tinytodo"
# (what to do, the name on the screen or the text to type, which one when several share the name)
# Like an agent, the tester looks once and then taps several times from what it saw:
# it looks again only when the name it wants was not on the last look, or on "look".
STEPS = [
    ("tap", "Name", 0), ("type", "Anna", 0),
    ("tap", "Email", 0), ("type", "anna@example.com", 0),
    ("tap", "Password", 0), ("type", "only-for-this-test", 0),
    ("hide", "", 0),                     # the keyboard, with Back, as an agent does
    ("tap", "Continue", 0),              # a button and its label share this name
    ("tap", "New task", 0), ("type", "Buy milk", 0),
    ("tap", "New task", 0),              # same place, but the field now shows the typed text
    ("tap", "Add", 0),
    ("hide", "", 0),
    ("tap", "x", 1),                     # four tasks, four "x": the second one deletes "Call the plumber"
    ("look", "", 0),                     # the list moved
    ("tap", "Buy apples", 0),            # the three tasks that must be left: a replay that deleted another one stops here
    ("tap", "Pay the rent", 0),
    ("tap", "Book the dentist", 0),
    ("tap", "Buy milk", 0),              # a text that was typed: stored under its name, not as text
    ("tap", "Search", 0), ("type", "Apples", 0),   # the search is case-sensitive: the list is now empty
    ("type", "", 0),                     # the field is emptied, as an agent does with type.py ""
    ("hide", "", 0),
    ("tap", "Buy apples", 0),            # back on the screen only if the replay emptied the field too
    ("tap", "Search", 0), ("type", "milk", 0),
    ("keys", "KEYCODE_MOVE_END", 0), ("keys", "67 67 67 67", 0),   # emptied by hand: to the end, then four deletes
    ("hide", "", 0),
    ("tap", "Pay the rent", 0),
    ("tap", "New task", 0), ("type", "Water the plants on the balcony", 0),
    ("tap", "New task", 0),              # at its centre, so in the middle of the long text: type.py still erases all of it
    ("type", "Feed the cat", 0),
    ("tap", "Add", 0),
    ("hide", "", 0),
    ("tap", "Feed the cat", 0),          # the task has this name only if the replay erased the whole long text too
]
SEEN = re.compile(r'^- (\w+) "(.*)" centre=\((\d+),(\d+)\)$')


def run(*args):
    done = subprocess.run(args, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace", check=False)
    return done.returncode, done.stdout or ""


def look(results, number):
    """What screen.py shows an agent: [(name, x, y)] in the order it prints them."""
    _, printed = run(sys.executable, "scripts/android/screen.py", str(results), f"{number:02d}")
    return [(found.group(2), int(found.group(3)), int(found.group(4))) for found in map(SEEN.match, printed.splitlines()) if found]


def follow(results):
    screens, seen = 0, []
    for kind, value, which in STEPS:
        if kind == "type":
            run(sys.executable, "scripts/android/type.py", value)
            continue
        if kind == "keys":
            run("adb", "shell", "input", "keyevent", *value.split())
            continue
        if kind in ("hide", "look"):
            if kind == "hide" and "mInputShown=true" in run("adb", "shell", "dumpsys", "input_method")[1]:
                run("adb", "shell", "input", "keyevent", "KEYCODE_BACK")
            seen = []
            continue
        named = [(x, y) for name, x, y in seen if name == value]
        for attempt in (1, 2):
            if len(named) > which:
                break
            if attempt == 2:   # the keyboard may be over it: an agent presses Back, so does this
                run("adb", "shell", "input", "keyevent", "KEYCODE_BACK")
            screens += 1
            seen = look(results, screens)
            named = [(x, y) for name, x, y in seen if name == value]
        if len(named) <= which:
            sys.exit(f'check: "{value}" is not on screen {screens:02d}')
        run("adb", "shell", "input", "tap", str(named[which][0]), str(named[which][1]))
    left = [name for name, _, _ in look(results, screens + 1)]
    if "Call the plumber" in left or "Buy milk" not in left or "Feed the cat" not in left:
        sys.exit("check: the path did not do what was planned (a task added, another one deleted)")


def replayed_otherwise(results, trace, ecr, folder, change):
    """Replays the same path with one thing written as it once was, and returns the line of the replay.
    For the record only: it never fails the check."""
    other = results / folder
    other.mkdir(exist_ok=True)
    changed = json.loads(json.dumps(trace))
    change(changed)
    (other / "trace.json").write_text(json.dumps(changed, indent=2) + "\n", encoding="utf-8")
    (other / "trace.params.json").write_text((results / "trace.params.json").read_text(encoding="utf-8"), encoding="utf-8")
    return run(sys.executable, "scripts/ecr_replay.py", str(other), "--ecr", ecr)[1].strip()


def counted_the_old_way(results, trace, ecr):
    """The trace once counted every element with the name, in the order of the file.
    Replays the same path with that count for "Continue" and says where it stops."""
    sys.path.insert(0, str(ROOT / "scripts"))
    import ecr_trace
    step = next((s for s in trace["steps"] if s["action"].get("target") == {"text": "Continue"}), None)
    trees = [ecr_trace.read_screen(path) for path in sorted(results.glob("*.xml"))]
    tree = next((nodes for nodes in trees if any("Continue" in node["names"] for node in nodes)), None)
    if step is None or tree is None:
        return
    every = [node for node in tree if "Continue" in node["names"]]
    print(f'check: "Continue" names {len(every)} elements of the tree, {len(ecr_trace.found_by(tree, "text", "Continue"))} for the replay')
    if len(every) < 2:
        return

    def change(changed):
        next(s for s in changed["steps"] if s["id"] == step["id"])["action"]["target"]["index"] = len(every) - 1
    print(f"check: counted the old way, {replayed_otherwise(results, trace, ecr, 'old-count', change)}")


def tapped_at_the_centre(results, trace, ecr):
    """The trace once let every tap of the replay land on the centre of its element.
    Replays the same path that way: the long text is then erased from its middle."""
    def change(changed):
        for step in changed["steps"]:
            step["action"].pop("at", None)
    print(f"check: every tap at the centre, {replayed_otherwise(results, trace, ecr, 'at-the-centre', change)}")


def taps(trace, **target):
    return [step for step in trace["steps"] if step["action"].get("target") == target]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("results")
    parser.add_argument("--ecr", required=True)
    args = parser.parse_args(argv)
    results = Path(args.results)
    results.mkdir(parents=True, exist_ok=True)

    follow(results)
    code, printed = run(sys.executable, "scripts/ecr_trace.py", str(results), "--persona", "anna", "--app-id", APP_ID)
    print(printed.strip())
    if code != 0 or not (results / "trace.json").exists():
        sys.exit("check: no trace was written")
    trace = json.loads((results / "trace.json").read_text(encoding="utf-8"))
    for step in trace["steps"]:
        print(f"  {step['id']}: {json.dumps(step['action'], ensure_ascii=False)}")

    problems = []
    for kind, wanted in (("inputText", "type"), ("tapOn", "tap")):
        planned = sum(1 for step, value, _ in STEPS if step == wanted and value)
        if sum(1 for step in trace["steps"] if step["action"]["kind"] == kind) != planned:
            problems.append(f"the trace does not have {planned} {kind} steps")
    if not [step for step in trace["steps"] if step["action"] == {"kind": "eraseText", "characters": 4}]:
        problems.append("the four deletes after a move to the end are not stored as four characters erased")
    if not taps(trace, text="Continue"):
        problems.append('the tap on "Continue" is not stored by its name alone')
    if not taps(trace, text="x", index=1):
        problems.append('the tap on the second "x" is not stored as the second one')
    by_typed_text = [step for step in trace["steps"] if isinstance(step["action"].get("target", {}).get("text"), dict)]
    if len(by_typed_text) != 4:
        problems.append("the four taps on a typed text are not stored under its name")
    before_an_erase = [before for before, step in zip(trace["steps"], trace["steps"][1:])
                       if step["action"]["kind"] == "eraseText" and before["action"]["kind"] == "tapOn"]
    planned = sum(1 for (before, _, _), (kind, _, _) in zip(STEPS, STEPS[1:]) if before == "tap" and kind == "type")
    if len(before_an_erase) != planned or not all(step["action"].get("at") for step in before_an_erase):
        problems.append(f"the {planned} taps that open a field before it is emptied do not say where its text ends")
    if sum(1 for step in trace["steps"] if "at" in step["action"]) != len(before_an_erase):
        problems.append("a tap that opens no field says where in its element it lands")
    if "\ttree\t" not in (results / "actions.tsv").read_text(encoding="utf-8"):
        problems.append("no tree was saved before a tap that followed no screenshot")
    if "Buy milk" in json.dumps(trace) or "only-for-this-test" in json.dumps(trace):
        problems.append("a typed text is in the trace")

    code, printed = run(sys.executable, "scripts/ecr_replay.py", str(results), "--ecr", str(Path(args.ecr).resolve()))
    print(printed.strip())
    try:
        result = json.loads((results / "replay.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        result = {"status": "no result"}
    if result.get("status") != "pass":
        problems.append(f"the replay did not pass: {json.dumps(result)}")
        try:
            print((results / "replay.txt").read_text(encoding="utf-8")[-6000:])
        except OSError:
            pass
    else:
        counted_the_old_way(results, trace, str(Path(args.ecr).resolve()))
        tapped_at_the_centre(results, trace, str(Path(args.ecr).resolve()))
    for problem in problems:
        print(f"check: {problem}")
    print("check: FAILED" if problems else f"check: ok, {len(trace['steps'])} steps written from the taps and replayed with no model")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
