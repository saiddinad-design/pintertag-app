# The map of your app's screens (experimental)

Each Android tester leaves its path in `trace.json` ([docs/replay.md](replay.md)). The dashboard draws every screen of the app as a map, puts the paths of the testers on it, and lets you comment each screen or turn what is wrong on it into a check that the replay verifies.

<a href="https://pierridotite.github.io/mobile-agent-testers/"><img src="../assets/dashboard.png" alt="The map of LocalSend: every screen as a card, read left to right from the launch, a colored line for each tester, dashed lines where only the robot went, an overview on the right" width="900"></a>

[Try the demo online](https://pierridotite.github.io/mobile-agent-testers/), on LocalSend, a real open-source app, or [watch the video](../assets/dashboard-demo.mp4).

```bash
bash scripts/collect.sh <run id>                 # decrypts the results into runs/<run id>/
python3 scripts/dashboard.py runs/<run id>       # opens http://127.0.0.1:8765
python3 scripts/dashboard.py --demo              # the runs in dashboard/demo-data (LocalSend), else a made-up run
python3 scripts/dashboard.py runs/<map run> runs/<run id>   # several runs on one map
```

Python 3.9 or later, nothing to install. The page runs in your browser and the results never leave your machine: the server listens on `127.0.0.1` only and never serves `trace.params.json`, the texts the agent typed.

## First, find every screen

ECR starts by exploring. Here, that is the job of the map maker, and it has three forms, chosen with the `map` input of the workflow (one persona is enough: its phone settings are kept):

| `map` | Who explores | Model cost |
| --- | --- | --- |
| `robot` | A robot with no model ([scripts/android/crawl.py](../scripts/android/crawl.py)): on each screen it fills the empty fields with test values, then taps each control once, depth first, and comes back with Back. When Back does not lead back, it starts the app again from a clean state and taps the way there. | None |
| `robot+agent` | The robot first. When it met a form it could not pass (fields filled, no control led anywhere, and the screen answered only with an error or not at all), an agent with [briefs/map.md](../briefs/map.md) is called for those forms only, with the robot's report in hand. | Only for the forms the robot could not pass |
| `none`, with `brief: briefs/map.md` | An agent explores every screen alone, breadth first. | The whole exploration |

The robot never taps a control whose name says it deletes, pays, buys or signs out (in English and French), leaves search fields empty, and does not scroll: a control below the fold is not opened. Each start of the app is a folder (`map-01`, `map-02`...) with its own trace, which starts with `launchApp` on a clean state, so each one replays with no model. `robot+agent` is the recommended form: exploring with a classic explorer and calling a model only where it stalls is known to cost less (LLMDroid, FSE 2025). Each map run writes `map-stats.json`: who found each screen first (robot or agent), the forms handed over, the robot's time and taps, the agent's turns and cost, kept apart. The run's log only says how many screens, taps and starts of the app, and how many forms it could not pass. The list of screens is in `report.md` and `findings.json` (`"robot": true`), with the rest of the encrypted results.

`gh workflow run map-check.yml` checks the robot on the demo app, on an emulator, with no model and no secret: it must pass the sign-up form, find both screens, never delete a task, and its paths must replay.

Open its run together with the persona runs. The map then shows every screen of the app, and the screens no persona reached are marked "No persona came here": a part of the app the testers never saw, or never found.

## The map

- **One card per screen**, with the screenshot, how many testers came, how many taps, and the findings seen there. Screenshots of the same screen are grouped across languages, text sizes and devices, for free: by the ids of their elements, else by their layout without the texts, and the first screen after a fresh start is one card for every tester. On a run of LocalSend (Flutter, no ids) in 10 languages, 107 screenshots make 20 cards instead of 50.
- **Same screen in another form**: what the rules leave apart (a tablet that lays a screen out its own way, iOS and Android), you merge on the screen's panel, and Separate undoes it. On demand, `python3 scripts/merge_screens.py runs/<run id>` asks Claude which cards are one screen in another form: one call on your own Claude login (Sonnet, a few cents for about 50 cards), with the cards' titles and element names, no screenshot (`--dry-run` calls nothing). Its merges show "merged by Claude" and can be separated too. Merges go to `trace.notes.json` (`sameAs`); traces never change.
- **Arrows** from one screen to the next, one lane per tester in its own color, side by side when several went the same way. The chips at the top left name each color; a click on one shows only that tester's path, "robot" shows the robot's. Each card has a dot per tester who saw it. A dashed gray arrow is a way only the map maker took, and a dashed card a screen no tester reached. The cards read left to right from the launch, three high.
- **A heat map on each screen** ("Heat map" menu): the real taps of the testers (the default), an estimate of where people would look and tap, both, or none (the estimate fills in where testers tapped little). The estimate weighs each control by its size and by how often testers tapped it on other screens. A file `NN.saliency.json` next to a screenshot (`{"points": [[x, y, weight], ...]}`, x and y from 0 to 1), from a saliency model of your choice, replaces it.
- **The side panel**: with no screen selected, an overview of the run (screens, testers, screens no tester reached, findings). Click a screen to see its screenshots, the findings and the testers who came; comments, checks, where testers came from and went next, and merging fold below. Esc goes back to the overview. "How to read this map" opens a short help, also shown on the first visit.
- **Checks on a screen**: "Add a check", click an element on the screen, then say whether it must be visible or must not be. From a finding, "Make it a test" does the same, marked as a known bug. See below.
- **One tester's path**: click its chip, or "Show path" in the panel. Its lane keeps its color, the others fade, and the panel lists its screens in order. The cards then show that tester's screenshots, in the shape of its phone or tablet.
- **One device**: pick it in "Device" (shown when the run has several). The cards show the screenshots taken on that device, in its shape, and the heat map counts only the taps made on it, so a button easy to reach on a phone and missed on a tablet stands out. A screen nobody reached on that device fades. The map can only show the devices that ran: add a persona on a tablet (Lucia, Pixel Tablet) to see that shape. The demo has one.

Drag to move the map, scroll or use + and − to zoom, Fit shows it whole. Comments on a screen go to `trace.notes.json` of the first persona who saw it, under `screens`. Undo and redo with Ctrl+Z and Ctrl+Shift+Z, save with Ctrl+S.

## From a finding to a test

A trace recorded from an agent is a path with no check: replayed, it only proves that the taps still work. The checks come from here. A check added on a screen becomes an oracle of the step that led to that screen, in `checkpoints` of `trace.json`: `visible` or `notVisible`, of an element found by its name or its id, never by a position or by its rank among elements with the same name: "visible" holds when any element with that name is on the screen, "not visible" when none is. "Known bug" records it as `observed: "failed"`: the compiled flow is red until the bug is fixed, then "Fixed" keeps the check as a guard ([Explore-Compile-Replay](https://github.com/pierridotite/explore-compile-replay), "a defect is a test").

Only checks can change. The steps stay as the agent explored them, the server refuses a trace whose steps differ, and the first save keeps the explored trace as `trace.explored.json`. Step ids never change. No check is verified when you write it: the first replay on the unchanged app does ([docs/replay.md](replay.md)).

To check each save with the real command (Node 22.18 or later):

```bash
git clone https://github.com/pierridotite/explore-compile-replay ../explore-compile-replay
(cd ../explore-compile-replay && pnpm install)
python3 scripts/dashboard.py runs/<run id> --ecr ../explore-compile-replay
```

A save is then refused if `ecr validate` finds the trace invalid. Use a clone of Explore-Compile-Replay at `f6bcf4b` or later: traces now hold `at` on taps and `from`/`to` on swipes, which an older clone refuses. Then `ecr compile` turns it into a Maestro flow that replays on every build with no model.

`trace.notes.json` also counts, per trace, the checks added and the seconds spent adding them (`effort`), the human time that a test costs.

## The online demo

`python3 scripts/dashboard.py --demo --export site/` writes the page and the demo runs as static files that any web host can serve. With no server, edits stay in the page and Save downloads the edited files. Only the demo can be exported: a real run is private. The demo is static files only: no model is ever called and its workflow reads no key or secret.

To show a public app instead of the made-up one, pack its collected runs with `python3 scripts/demo_pack.py runs/<run id> --app <public source URL> --name <app name>`. It writes `dashboard/demo-data/` with only the screenshots, screen trees, traces and short findings (never the typed texts, the reports or the agent's output); `--demo` and the online demo then open those runs. Look at every screenshot before you push it.

## Limits

- Android only, like the traces.
- The robot does not scroll, does not guess what a form wants beyond the name of its fields, and counts a screen as new when it shares under 60% of its controls with every screen seen: a screen whose controls change with its data may be counted twice.
- The estimated heat map is a guess from the screen's controls, not a model trained on eye tracking. Use real taps, or a saliency file, when it matters.
- Screenshots are grouped by the ids of their elements, else by their layout without texts. Two screens of one template (two articles, two settings pages laid out alike) can share a card for testers in different languages; a tester's own screenshots with other button names stay apart. A screen in two states (a list scrolled, a keyboard open) can be two cards.
- The page has been tried on the demo run and on traces written by the offline tests. Not yet on a run on a real emulator.
