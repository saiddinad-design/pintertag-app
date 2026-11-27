"""Screenshot of the mobile browser page + visible elements (scripts/web/browser.py must run).
Usage: python3 scripts/web/screen.py <dir> <NN>
The PNG is in CSS pixels, so a position read on the image goes straight to
`bash scripts/web/gesture.sh tap X Y`. Also prints the address, how far the page is
scrolled, what went wrong since the previous screenshot (page errors, failed requests,
links to blocked hosts, new tabs) and an accessibility check (controls with no name,
touch targets under 24 CSS px)."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import a11y
import color_filter

KINDS = ("field", "button", "text")


def lines(state, png):
    """What the agent reads after the screenshot, from the browser's answer."""
    w, h = state["w"], state["h"]
    out = [
        f"screenshot: {png} ({w}x{h} CSS px; positions on the image = positions to tap)",
        f'page: {state["url"]} "{state["title"][:70]}"',
    ]
    if state["max"]:
        out.append(f"scrolled {state['scroll']} of {state['max']} px ({round(100 * state['scroll'] / state['max'])}%)")
    else:
        out.append("the page itself does not scroll (a box on it may)")
    if state.get("tabs", 1) > 1:
        out.append(f"{state['tabs']} tabs open, the newest in front (back closes it)")
    seen = set()
    for e in state["elements"]:
        if e["kind"] not in KINDS:
            continue
        cx, cy = round(e["x"] + e["w"] / 2), round(e["y"] + e["h"] / 2)
        extra = f' value "{e["value"][:40]}"' if e["value"] and e["value"] != e["name"] else ""
        if e.get("options"):  # a drop-down list: headless browsers draw no picker, `choose` picks one
            shown, rest = e["options"][:20], len(e["options"]) - 20
            extra += f' options "{" | ".join(shown)}"' + (f" and {rest} more (choose takes any by its text)" if rest > 0 else "")
        line = f'- {e["kind"]} "{(e["name"] or e["value"])[:70]}"{extra} centre=({cx},{cy})'
        if line not in seen:  # nested elements often read the same
            seen.add(line)
            out.append(line)
    check = a11y.web(state["elements"], w, h)
    if check:
        out.append(check)
    if state.get("events"):
        out.append("SINCE THE LAST SCREENSHOT:")
        out.extend("  " + e for e in state["events"])
    return out


if __name__ == "__main__":
    from browser import call

    out_dir, nn = Path(sys.argv[1]), sys.argv[2]
    out_dir.mkdir(parents=True, exist_ok=True)
    png = out_dir / f"{nn}.png"
    state = call("screen", str(png.resolve()))
    if state.get("error"):
        raise SystemExit(f"no screenshot: {state['error']}")
    if os.environ.get("COLOR_FILTER"):
        from PIL import Image

        with Image.open(png) as raw_img:
            color_filter.apply(raw_img.convert("RGB")).save(png)
    print("\n".join(lines(state, png)))
