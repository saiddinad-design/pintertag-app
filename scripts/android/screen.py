"""Screenshot of the emulator + list of visible elements.
Usage: python3 scripts/android/screen.py <dir> <NN>
Saves <dir>/<NN>.png at HALF size (cheaper to read) and prints each element
with its centre in REAL screen pixels, ready for `adb shell input tap X Y`.
Also prints crashes logged since the previous call, and an accessibility check
(controls with no name, touch targets under 48 dp) when the screen fails it."""
import io, os, re, subprocess, sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import a11y  # noqa: E402
import color_filter  # noqa: E402


def adb(*a, raw=False):
    r = subprocess.run(["adb", *a], capture_output=True, timeout=60)
    return r.stdout if raw else r.stdout.decode("utf-8", "replace")


def elements(root, w, h):
    """Visible elements of a uiautomator tree, one formatted line each, in real screen pixels."""
    out = []
    for n in root.iter("node"):
        text = " ".join((n.get("text") or "").split())
        desc = " ".join((n.get("content-desc") or "").split())
        edit = n.get("class", "").endswith("EditText")
        b = re.findall(r"-?\d+", n.get("bounds", ""))
        if not (text or desc or edit) or len(b) != 4:
            continue
        x1, y1, x2, y2 = map(int, b)
        if x2 <= x1 or y2 <= y1:
            continue
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        if not (0 <= cx <= w and 0 <= cy <= h):
            continue
        kind = "field" if edit else ("button" if n.get("clickable") == "true" else "text")
        out.append(f'- {kind} "{(text or desc)[:70]}" centre=({cx},{cy})')
    return out


def main(argv=None):
    from PIL import Image

    args = sys.argv[1:] if argv is None else argv
    out, nn = Path(args[0]), args[1]
    out.mkdir(parents=True, exist_ok=True)
    png = adb("exec-out", "screencap", "-p", raw=True)
    png = png[png.find(b"\x89PNG"):] if b"\x89PNG" in png else png  # foldables print a warning first
    img = color_filter.apply(Image.open(io.BytesIO(png)).convert("RGB"))
    w, h = img.size
    img.resize((w // 2, h // 2)).save(out / f"{nn}.png")
    print(f"screenshot: {out}/{nn}.png (screen {w}x{h}; image is half size: multiply positions read on it by 2)")
    # Out of the shared storage: the app could show it in a file picker, and a path that picks it would not replay
    adb("shell", "uiautomator", "dump", "/data/local/tmp/ui.xml")
    xml = adb("exec-out", "cat", "/data/local/tmp/ui.xml")
    try:
        root = ET.fromstring(xml[xml.find("<"):])
    except ET.ParseError:
        root = ET.Element("hierarchy")
    try:  # kept for scripts/ecr_trace.py, which turns the taps of this run into a replayable trace
        (out / f"{nn}.xml").write_text(xml[xml.find("<"):] if "<" in xml else "", encoding="utf-8")
        log = os.environ.get("ECR_ACTION_LOG")
        if log:
            with open(log, "a", encoding="utf-8") as f:
                f.write(f"0\tscreen\t{out / (nn + '.xml')}\t{w}\t{h}\n")
    except Exception:  # noting the screen must never break seeing it
        pass
    for line in elements(root, w, h):
        print(line)
    try:
        memo = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "density_dpi"
        if not memo.exists():
            dpi = re.findall(r"\d+", adb("shell", "wm", "density"))
            memo.write_text(dpi[-1] if dpi else "160")  # last one = override, if any
        check = a11y.android(root, int(memo.read_text()), w, h)
        if check:
            print(check)
    except Exception:  # the check must never break seeing the screen
        pass
    crash = adb("logcat", "-d", "-b", "crash") + adb("logcat", "-d", "AndroidRuntime:E", "ReactNativeJS:E", "*:S")
    adb("logcat", "-c")
    lines = [x for x in crash.splitlines() if x.strip() and not x.startswith("-----")]
    if lines:
        print("ERRORS SINCE LAST SCREENSHOT:\n" + "\n".join(lines[-15:]))


if __name__ == "__main__":
    main()
