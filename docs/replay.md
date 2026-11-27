# Replay the path of a tester (experimental)

Two runs never take the same path. So when a tester finds a bug, the path that led to it is worth keeping.

Each Android tester now leaves two more files in its results, next to `report.md`:

- `trace.json`: what the agent did, step by step. A tap is stored with the name of the element that was under the finger, not with its coordinates, so the path still replays when the layout moves. It also names the model that explored, when the run says it.
- `trace.params.json`: every text the agent typed (an e-mail, a password). The trace only holds their names, `TEXT_1`, `TEXT_2`. **Do not commit this file.**

Nothing changes for the agent: same tools, same brief. The taps are noted by a pass-through in front of `adb` ([scripts/android/shim/adb](../scripts/android/shim/adb)), and [scripts/ecr_trace.py](../scripts/ecr_trace.py) writes the trace when the agent is done. An agent often taps several times after one screenshot: the pass-through then saves the screen tree again just before the tap (`tree-N.xml`), so each tap is named after what was under the finger at that moment. It costs a second or two per tap.

To see these paths on a map of the app, comment each screen and add checks before compiling: [docs/dashboard.md](dashboard.md).

## From a trace to a test that reruns with no model

The trace is in the format of [Explore-Compile-Replay](https://github.com/pierridotite/explore-compile-replay), which compiles it to a [Maestro](https://maestro.dev) flow:

```bash
bash scripts/collect.sh <run id>                       # decrypts the results into runs/<run id>/
git clone https://github.com/pierridotite/explore-compile-replay && cd explore-compile-replay && pnpm install
pnpm ecr compile ../runs/<run id>/anna/trace.json --adapter packages/adapter-maestro/src/index.ts
maestro test -e TEXT_1="..." ../runs/<run id>/anna/anna-<date>.flow.yaml
```

## Replay it right after the run

With `-f replay_path=true`, each Android tester's path is replayed on the same phone as soon as the agent is done, with no model:

```bash
gh workflow run agent-testers.yml -f android_personas=anna -f ios_personas=none -f replay_path=true
```

The run page says how it went in one line, for example `replay: pass, 22 steps with no model in 41 s` or `replay: stopped at step 7 of 22 (target_not_found, tapOn by name, after tapOn by name, eraseText, inputText), after 38 s`: the step, why, its kind and the kinds of the three steps before it. It never prints a text of your app. Three more files join the encrypted results: the compiled flow (`anna-<date>.flow.yaml`), `replay.json` (the status, the step where it stopped and why) and `replay.txt` (everything the tools printed), plus what Maestro kept in `replay-debug/`.

The replay runs with the model keys taken out of its environment ([scripts/ecr_replay.py](../scripts/ecr_replay.py)), and a replay that stops never fails the run. It adds a few minutes to each tester: installing Maestro, then the replay itself.

When the agent leaves the app (Back on its first screen, Home) and opens it again with adb (`monkey -p`, `am start`), the trace opens it again too, with its data kept (`launchApp` with no `clearState`), and the line of the trace counts these returns. Before, the trace had no step for it, and the replay stayed on the home screen. After Home, the replay starts the app again where the agent brought it back, so a screen the app kept only in memory can be missing.

When a replay stops, the app may have shown something else the second time (an account that now exists, a list that is no longer empty), or the trace missed something the agent did. Tell us which line you got in an issue: it shows what the trace still misses.

## Replay kept traces many times

A trace kept in the repository can be replayed many times on the phone of a persona, with no agent and no model key in the job:

```bash
gh workflow run agent-testers.yml -f android_personas=malik -f ios_personas=none \
  -f replay_traces=traces/demo-app -f replay_times=20
```

Each `traces/<app>/<persona>/NAME.trace.json` is checked by `ecr validate`, then replayed `replay_times` times by [scripts/replay_set.py](../scripts/replay_set.py), from a fresh start of the app each time when the trace begins with `launchApp` and `clearState`. The last replay of each trace runs in a group of processes that reach the phone and nothing else: the job first checks that this group cannot reach the internet, and says so on the run page when it cannot. The texts a trace types come from `NAME.params.json` next to it (public, test data only) and from the `REPLAY_PARAMS` secret, which wins ([traces/README.md](../traces/README.md)).

The run page gets one line per trace: how many replays gave what the trace recorded, their results, the one with the network closed, the median time, the steps, how the taps are found again and the start of the trace's SHA-256. A public artifact, `replays-<persona>`, holds `replays.json`: every replay with its result, its time, the type and the step of a stop, the SHA-256 of each trace and of its compiled flow, the commits of the app and of Explore-Compile-Replay, and no text of the app. What the tools printed joins the encrypted results.

Each replay that does not give what its trace recorded gets a line of its own: where it stopped, after how long, and what the phone showed then, in words that hold no text of the app ([scripts/device_state.py](../scripts/device_state.py)): the kind of window in front (the app, the home screen, a window that does not respond), whether the app was still running, how long it took to show its first screen, whether the system logged a window that stopped responding or a crash of the app, and how busy the phone and the runner were. The start time of the app is kept for every replay, and the single replay after an exploration says the same when it does not pass. A count of unstable replays is only useful with its causes.

When the replay stopped at a step or a check that looks for an element, the line also says whether the keyboard was open, whether that element is on the screen (by its name, written differently, inside a longer name, fewer times than the trace counts, or not at all), and what now stands where the element was when the agent tapped it. An element of the same size with another name points to a name that changes from one fresh start to the next, like the device name that LocalSend draws at random on its first start and shows on a button of its settings. The name itself is never printed.

A build from source can give another APK from one run to the next: LocalSend did, at the same commit. To replay on the same bytes, keep the APK of a run with [keep-apk.yml](../.github/workflows/keep-apk.yml) within 3 days, before its artifact expires. It decrypts the APK, checks its SHA-256 and attaches it, with the license files of the app, to a pre-release on an existing tag. The APK becomes public, so do it only for an open source app whose license lets you share it. Later runs take it with `-f android_build="curl -fsSL -o app.apk <its URL>" -f apk_path=app.apk`, and their run page prints the same SHA-256.

Before each replay of a trace that starts with `launchApp` and `clearState`, the harness stops the app and clears its data itself, then reads the system log from that moment. Maestro does the same at the first step of the flow, yet on some emulators a replay found the app on the screen where the replay before it ended, with no new start in the log: 5 of 20 replays of the demo traces in one run, 0 of 20 in another. Replays that follow each other on one phone must start like separate runs of a CI. The run page says how often the replay cleared the app again by itself.

## Ask the agent to repair a step

When the app changed and a kept trace no longer replays as recorded, the agent can propose a new action for the step where it stopped. This uses your model credit:

```bash
gh workflow run agent-testers.yml -f android_personas=malik -f ios_personas=none \
  -f replay_traces=traces/demo-app -f replay_times=3 -f repair=3
```

For each trace that did not replay as recorded, [scripts/repair.py](../scripts/repair.py) replays it once more so that the phone shows the screen where it stops, takes a screenshot, and gives the agent the prompt of [briefs/repair.md](../briefs/repair.md): the steps of the trace without their checks, the type and the step of the stop, and the screen. The agent answers with one step id and one action, or with no action when one action is not enough. `ecr repair` replays the trace with it and accepts it only if the replay then gives what the trace recorded; otherwise the reason goes into the next prompt, at most `repair` times (3 at most). An accepted trace is replayed 3 more times, and its checks are compared with the ones before. A check that fails is never repaired: it is a regression or an intended change, and a person decides.

The run page gets one line per attempt: where the trace stopped, the step and the kind of the proposed action, accepted or the reason of the refusal, the 3 replays after, and the cost of the agent. The proposals hold texts of the app, so they join the encrypted results (`repairs-private.json`); add `, public` (`-f repair="3, public"`) to print them too, for an open-source app only. A typed text is never printed.

After an exploration, when the repository keeps traces for that persona and app (`traces/<app>/<persona>/`), the run page also says, for each of them, whether the agent reached the screen its last checks name ([scripts/goal_check.py](../scripts/goal_check.py)), with no text of the app.

## What it is today

- **Experimental.** A path of 44 steps on Tiny Todo, the demo app, followed by a script with the tools of an agent, is written as a trace and replays from end to end on an Android 11 emulator with no model: the [Replay check](../.github/workflows/replay-check.yml) workflow, started by hand, free. Two paths of real agents have replayed from end to end so far, with no model: the 37 steps of the map maker ([briefs/map.md](../briefs/map.md)) in 91 s, and the 25 steps of a tester in 72 s. Before them, the path of a tester (72 steps) stopped at step 12, because the trace did not count elements that share a name the way Maestro does, and another one (62 steps) stopped at step 58, on a tap by name. Its trace is encrypted, so the cause is not known for sure. Two things the trace missed that day are now in it: a field the agent empties, and where a tap lands before a field is emptied. The check replays the path as it was once written, to show where each of these stops it. Two paths are not a rate: how often a tester's path replays is not measured yet, and both are shorter than the one that stopped at step 58.
- The agent's waits are not in the trace. Maestro waits for each element by itself, which may not be enough on a slow screen.
- **A path, with no check of its own.** The trace of an agent has no checks: replayed as it is, it only fails when a step no longer finds its target. The checks are added by a person in the [dashboard](dashboard.md), on a screen or from a finding of the report, where a finding becomes a check recorded as a known bug.
- **Android only.** iOS comes next.
- An element with no name and no id is stored as a point on the screen, in percent. It breaks on another screen size. An id that covers half of the screen or more is not used either: in an app that draws itself in one view, as Flutter does, it is the only id under the finger and it says nothing of what was tapped.
- When the finger was on something with no name inside an element that has one (an icon in a card), the tap is replayed at the same place inside that element (`at`), not on its centre.
- **A real app is not there yet.** On LocalSend, a Flutter app, the paths of four testers (9 to 19 steps) stopped at step 3 or 4, and 25 of the 27 paths of the map robot at step 3, each on a tap by name that followed a tap stored by id. Two short paths of the robot (4 and 6 steps) replayed. The traces are encrypted, so the cause is inferred: Flutter names a tab on two lines (`Send`, then `Tab 2 of 3`), the trace refused a name on several lines and fell back to the only id under the finger, the one of the whole window, replayed on its centre. Both are changed: a name on several lines is kept with a space for each line break, as Maestro matches it, and the id of a whole window is never a target. Since then, on LocalSend, the path of a tester (8 steps, 4 taps all found by name) replayed from end to end with no model in 32 s, and so did 20 of the 24 paths of the map robot, from 4 to 41 steps. The 4 others stopped on a tap by name, three of them just after a tap stored as a point.
- The tools write their screen dumps and screen recordings in `/data/local/tmp` on the phone, where the app cannot see them. They used to write them in its shared storage: on LocalSend, an agent picked its own screen dump in the file picker of the system, and its path stopped at that tap on a phone that only replays.
- When several elements share a name, the trace says which one was tapped, counted as Maestro counts them: only the deepest element of each (a button and its label are one), from the top of the screen, then from the left.
- A swipe keeps its direction and its two ends, in percent of the screen. The replay moves the finger between the same two points at Maestro's own speed, so a long list may still stop on another row.
- The agent's `type.py` empties a field from its end. Maestro erases before the cursor and has no way to move it. So the tap that opens a field before it is emptied is replayed where the text ends (`"at": "97%,90%"` of the field, its left end for a language written from right to left) and not on its centre. When the text is longer than the field, part of it may stay.
- A trace written since this change needs a clone of Explore-Compile-Replay that knows `at`: run `git pull` in an older one.
- Before each Back, the pass-through asks the phone whether the keyboard is open. A Back pressed while it is open only closes it, so the trace writes `hideKeyboard`, which the replay does only while a keyboard is on the screen. After typing, the keyboard of a replay may already be closed, and Back would then leave the screen: on LocalSend, 3 of the 43 paths of a run of the map robot stopped just after such a Back. The flows of these traces need Explore-Compile-Replay at `f89aa13` or later.
- A command the trace cannot hold (a key outside Back, Enter, Home and Backspace, a drag) is left out and counted on the `trace:` line of the run, with its kind. A second `trace:` line counts how the taps are found again: by name, by id, by position.
- Typed texts stay out of the trace, also when the agent taps one: a tap on a task it just added is stored as `TEXT_1`. When the name only holds a typed text (its e-mail in a greeting), the tap is stored by the id of the element, or as a point.
