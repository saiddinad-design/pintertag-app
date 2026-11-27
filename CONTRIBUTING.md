# Contributing

Thanks for helping. Open an issue before you start, to say what you want to build: two people won't work on the same thing, and we can agree on the shape before you write code. Small pull requests get merged faster than big ones.

## Before you open a pull request

- Run the tests. They are offline and need no phone: `python3 -m unittest discover -s tests -q`.
- Scripts run on GitHub's macOS runners too: keep them working with the bash 3.2 of macOS (no `mapfile`, expand empty arrays as `${ARR[@]+"${ARR[@]}"}`) and with Python 3.9.
- The logs of a public repo are public. Never print a report, a screenshot path with user data, a key or a secret value: print counts and statuses only, like [scripts/build/args.sh](scripts/build/args.sh) and [scripts/agent_status.py](scripts/agent_status.py) do.
- [skills/mobile-agent-testers/SKILL.md](skills/mobile-agent-testers/SKILL.md) and [plugins/mobile-agent-testers/skills/setup/SKILL.md](plugins/mobile-agent-testers/skills/setup/SKILL.md) must stay identical (a test checks it).
- Say how you tested. If you ran it on real emulators or simulators, a link to the run helps.

The README exists in seven languages (translations in [i18n/](i18n/)). Change the English one; the translations can follow in the same pull request or a later one.

## Ideas, and where each one starts

### Other agent CLIs (OpenCode, Codex CLI, Gemini CLI, Goose...)

The agent is one command per platform: the `claude -p` call in [scripts/ios/run_agent.sh](scripts/ios/run_agent.sh) and [scripts/android/run_agent.sh](scripts/android/run_agent.sh). Everything else is plain: the tools are scripts (`screen.py`, `gesture.sh` or `adb`, `type.py`) and the mission is a Markdown brief ([AGENT_BRIEF.md](AGENT_BRIEF.md), or a file of [briefs/](briefs/)).

A good shape: an `agent` input in [.github/workflows/agent-testers.yml](.github/workflows/agent-testers.yml) (default: Claude Code), and one sourced script that builds the command for each CLI, next to [scripts/llm_env.sh](scripts/llm_env.sh).

The CLI must be able to run shell commands headless, limited to the tools of the brief (today's allowlist is in `--allowedTools`), read the PNG that `screen.py` writes, write two files under `results/<persona>/`, and stop on its own. [scripts/agent_status.py](scripts/agent_status.py) reads Claude Code's JSON output to say how a run ended: add the new CLI's output there, with tests.

Test it offline with a stand-in for the CLI on `PATH`, like [tests/test_build_args.py](tests/test_build_args.py) does for `flutter`.

### Web apps

The web platform lives in `scripts/web/`. `browser.py` keeps one page open between tool calls. Every command to it carries a per-run key from a file only the user can read, so the site under test cannot drive the browser. Open ideas:

- Text size, with browser zoom or a minimum font size. Start in `personas.json`.
- A slow network persona. Start in `browser.py`, where the page is opened.
- Native momentum scrolling and touch events beyond a tap on WebKit. Start in `cmd_scroll` and `cmd_swipe` in `scripts/web/browser.py`.
- Real Safari through the iOS Simulator on the macOS runners, as a new platform in `scripts/matrix.py`.

Test offline with `python3 -m unittest tests.test_web`. With Playwright and its browsers installed, `WEB_BROWSER_TEST=1` also runs a real-browser test on a local HTML page.

### Physical Android phones

On a self-hosted runner with a phone plugged in over USB. [scripts/android/run_agent.sh](scripts/android/run_agent.sh) assumes an emulator: it changes the language with `adb root`, which retail phones refuse, and the workflow starts the emulator with android-emulator-runner. A `device: physical` option would skip both and use the phone that `adb devices` lists.

### New personas

Personas are a few lines in [personas.json](personas.json); the run scripts apply their settings to the phone (text size, dark mode, language and location today). Increased contrast, reduced motion, color blindness filters and Android network conditions are in (`increase_contrast`, `reduce_motion`, `color_filter`, `network`). Ideas still open, asked for by users: a slow or flaky network on iOS.

On Android, these are `adb shell settings put` calls (`secure high_text_contrast_enabled`, the `global` animation scales) and the emulator console for the network (`adb emu network speed` and `network delay`). On iOS, check what `xcrun simctl ui` supports in the Xcode of the runner. A color filter is applied to the screenshot itself, in [scripts/color_filter.py](scripts/color_filter.py): Android does not show its own filter in screenshots. Add a test in [tests/test_matrix.py](tests/test_matrix.py) for the new fields.

### Findings to issues

[scripts/summarize.py](scripts/summarize.py) writes `SUMMARY.md` on your machine, after [scripts/collect.sh](scripts/collect.sh) decrypts the results. [scripts/draft_issues.py](scripts/draft_issues.py) turns those findings into draft GitHub issues with `gh issue create` (dry-run by default; opt-in with `--create --repo OWNER/REPO`). [scripts/notify.py](scripts/notify.py) posts a short version to a Slack or Discord webhook when `SUMMARY_WEBHOOK_URL` is set. It must stay on your machine: the results are private, never upload them from the runner.

### Other CI

The workflow is written for GitHub Actions (job matrix, macOS runners, android-emulator-runner). The build scripts, the persona tools and the encryption ([scripts/encrypt_results.sh](scripts/encrypt_results.sh)) are portable: a GitLab CI, Bitrise or Codemagic version would reuse them.

### More build systems

Framework detection is in [scripts/build/detect.sh](scripts/build/detect.sh), and each framework is one `case` in [scripts/build/android.sh](scripts/build/android.sh) and [scripts/build/ios.sh](scripts/build/ios.sh). Unity or Godot would each be one more case, tested with a stand-in for the build tool.

### Translations

Translations live in `i18n/<language>/`, with the same tree as the root: `i18n/es/README.md`, `i18n/es/docs/faq.md`. Copy [README.md](README.md) to `i18n/<language>/README.md`, keep the headings in the same order, point links to code and images back to the root (`../../personas.json`), and add the language to the line of languages at the top of every README. The configuration, examples and FAQ pages have translations too. `tests/test_i18n_links.py` checks that every relative link of a page leads to a file that exists.

### Model comparison

The demo app has [11 planted bugs](demo-app/BUGS.md), so it makes a small benchmark. Run the same personas with different models (the `model` and `llm_base_url` inputs, see [docs/cheaper-models.md](docs/cheaper-models.md)) and publish what each one found and cost, as a page of [docs/runs/](docs/runs/) with its JSON data.

## After your pull request merges

Show it. Post what you built on Reddit, X, LinkedIn or your blog, in your own words: you did the work, it is yours to present. [docs/share.md](docs/share.md) has the video and the images you can reuse, a badge, and a list where you add your link. Drop the link on [Discord](https://discord.gg/WuaCANscr8) too, so the others see it.

## Questions

Open an issue, or a thread in [Discussions](https://github.com/pierridotite/mobile-agent-testers/discussions).
