"""Checks on a real phone that the robot of scripts/android/crawl.py maps Tiny Todo (demo-app).

Usage: python3 scripts/android/map_check.py <results dir> --ecr <checkout of explore-compile-replay>

The robot must find the two screens of the app (the sign-up form, which it has to fill
to pass, and the list of tasks), must not delete a task, and each start of the app it
wrote as a trace must replay with no model. Exits 1 otherwise.
Everything is printed: the demo app holds no data and the values typed are made up.
Run by .github/workflows/map-check.yml, with no model and no secret.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
APP_ID = "com.example.tinytodo"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("results")
    parser.add_argument("--ecr", required=True)
    args = parser.parse_args(argv)
    results = Path(args.results)
    subprocess.run([sys.executable, "scripts/android/crawl.py", str(results), "--app-id", APP_ID, "--persona", "anna",
                    "--taps", "60", "--minutes", "10"], cwd=ROOT, check=False)
    problems = []
    try:
        summary = json.loads((results / "findings.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        sys.exit("check: the robot wrote no findings.json")
    print((results / "report.md").read_text(encoding="utf-8"))
    names = [s["name"] for s in summary["screens_found"]]
    if not any("account" in n.lower() for n in names):
        problems.append("the sign-up form is not on the map")
    if not any("tasks" in n.lower() for n in names):
        problems.append("the list of tasks is not on the map: the robot did not pass the sign-up form")
    if len(names) != 2:
        problems.append(f"Tiny Todo has two screens, the robot found {len(names)}")
    if summary["blocked"]:
        problems.append("the robot says it could not pass a form")
    last = sorted(results.glob("map-*/[0-9]*.xml"))   # the screenshots, not the trees the shim saves before a tap
    if last and "Call the plumber" not in last[-1].read_text(encoding="utf-8", errors="replace") \
            and any("tasks" in n.lower() for n in names):
        problems.append('a task was deleted ("x" must never be tapped)')
    traces = sorted(results.glob("map-*/trace.json"))
    if not traces:
        problems.append("no trace was written")
    for trace in traces:
        steps = json.loads(trace.read_text(encoding="utf-8"))["steps"]
        print(f"{trace.parent.name}: {len(steps)} steps")
        for step in steps:
            print(f"  {step['id']}: {json.dumps(step['action'], ensure_ascii=False)}")
        done = subprocess.run([sys.executable, "scripts/ecr_replay.py", str(trace.parent), "--ecr", str(Path(args.ecr).resolve())],
                              cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
        print(done.stdout.strip())
        try:
            status = json.loads((trace.parent / "replay.json").read_text(encoding="utf-8")).get("status")
        except (OSError, ValueError):
            status = "no result"
        if status != "pass":
            problems.append(f"the path of {trace.parent.name} did not replay ({status})")
            try:
                print((trace.parent / "replay.txt").read_text(encoding="utf-8")[-4000:])
            except OSError:
                pass
    for problem in problems:
        print(f"check: {problem}")
    print("check: FAILED" if problems else f"check: ok, {len(names)} screens mapped with {summary['taps']} taps, "
          f"{len(traces)} paths replayed with no model")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
