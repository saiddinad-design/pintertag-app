"""Replaces the focused field's content in the mobile browser: tap the field first.
The text is inserted as is, so accents and symbols survive. "" empties the field.
Usage: python3 scripts/web/type.py "text" """

import sys

from browser import call

r = call("type", sys.argv[1])
if r.get("error"):
    print("failed: " + r["error"])
elif not r.get("focused"):
    print("failed: no field has the focus, tap the field first")
else:
    print("typed: check it on the next screenshot")
