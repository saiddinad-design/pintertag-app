"""Replaces the focused field's content. adb cannot type accents: they are
stripped. Usage: python3 scripts/android/type.py "text" """
import os, re, subprocess, sys, unicodedata

t = unicodedata.normalize("NFKD", sys.argv[1]).encode("ascii", "ignore").decode()
log = os.environ.get("ECR_ACTION_LOG")
if log:  # one note for the whole typing, instead of one per key (see scripts/android/shim/adb)
    try:
        with open(log, "a", encoding="utf-8") as f:
            f.write("0\ttype\t" + t.replace("\t", " ").replace("\n", " ") + "\n")
    except OSError:
        pass
env = dict(os.environ, ECR_SHIM_QUIET="1")
subprocess.run(["adb", "shell", "input", "keyevent", "KEYCODE_MOVE_END"], env=env)
subprocess.run(["adb", "shell", "input", "keyevent", *(["67"] * 40)], env=env)  # 40 backspaces
e = re.sub(r"([\\'\"`$&|;<>()*~#])", r"\\\1", t).replace(" ", "%s")
subprocess.run(["adb", "shell", "input", "text", e], env=env)
print("typed: check it on the next screenshot")
