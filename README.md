<div align="center">

<img src="assets/logo.svg" alt="" width="96" height="96">

# mobile-agent-testers

**20 AI testers on 20 different phones, in parallel, on GitHub's free runners.**

[![Tests](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml/badge.svg)](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml)
[![Stars](https://img.shields.io/github/stars/pierridotite/mobile-agent-testers?style=flat)](https://github.com/pierridotite/mobile-agent-testers/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![iOS + Android](https://img.shields.io/badge/platforms-iOS%20%2B%20Android-blue)
![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-orange)

**[Examples](docs/examples.md)** · **[Dashboard demo](https://pierridotite.github.io/mobile-agent-testers/)** · **[Compare](docs/compare.md)** · **[FAQ](docs/faq.md)** · **[Personas](personas.json)** · **[Contributing](CONTRIBUTING.md)**

<sub>English · [简体中文](i18n/zh-CN/README.md) · [日本語](i18n/ja/README.md) · [Español](i18n/es/README.md) · [Português](i18n/pt-BR/README.md) · [Tiếng Việt](i18n/vi/README.md) · [Türkçe](i18n/tr/README.md)</sub>

<a href="https://www.linkedin.com/in/pierre-raffalli/"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/linkedin-follow-dark.svg"><img src="assets/linkedin-follow-light.svg" alt="Follow Pierre Raffalli on LinkedIn" width="160" height="54"></picture></a>
<a href="https://discord.gg/WuaCANscr8"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/discord-join-dark.svg"><img src="assets/discord-join-light.svg" alt="Join us on Discord" width="160" height="54"></picture></a><br>
<a href="https://trendshift.io/repositories/371956?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-371956" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/371956/daily?language=Python" alt="pierridotite%2Fmobile-agent-testers | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/371956?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-371956" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/371956/daily" alt="pierridotite%2Fmobile-agent-testers | Trendshift" width="250" height="55"/></a>

</div>

<p align="center"><a href="assets/launch-video.mp4"><img src="assets/launch-video.gif" alt="Launch video, 26 seconds. First, real screen recordings of 20 AI testers using LocalSend at the same time: 10 Android emulators and 10 iOS Simulators in 14 languages, each phone showing how many issues it reported, 103 in all. Then the dashboard's map of the demo app: every screen, one colored lane per tester, a bug turned into a test, and a path replayed with no model. Opens the video with sound." width="100%"></a><br>
<sub>The phones are real screen recordings of the LocalSend run; the map is the dashboard on the <a href="demo-app/">demo app</a>. <a href="assets/launch-video.mp4">Video with sound (MP4)</a> · <a href="assets/localsend-20.mp4">The 20 phones, full recording</a> · <a href="docs/runs/localsend-20.md">The run, device by device</a></sub></p>

No test scripts to write. Each tester is a Claude Code agent with its own iOS
Simulator or Android emulator on GitHub Actions. It plays a persona (iPhone SE
in Swedish at the largest text size, Pixel 7 at 200%, iPad in German, Arabic
right to left...), uses your app like a new user (or runs through the feature you
point it at) and writes a bug report with screenshots. Flutter, React Native, Expo, native Kotlin and Swift, Kotlin
Multiplatform, Capacitor and .NET MAUI.

GitHub's runners are free for public repos. You only pay for the model, with your
Claude subscription or API key: about $0.15 to $0.55 per phone in [these runs](docs/runs/).

## Quick start

```bash
gh repo create my-testers --public --template pierridotite/mobile-agent-testers --clone
cd my-testers && ./setup.sh           # key pair + secrets + Claude token (Windows: .\setup.ps1)
gh workflow run agent-testers.yml     # demo: 2 Android + 2 iOS testers, ~20 min
bash scripts/collect.sh <run id>      # decrypts reports, writes runs/<id>/SUMMARY.md
```

Then on your own app:

```bash
gh workflow run agent-testers.yml -f source_repo=you/app -f app_id=com.you.app \
  -f android_personas=anna,malik -f ios_personas=clara,jonas
```

Or let Claude set it up for you: `/plugin marketplace add pierridotite/mobile-agent-testers`, then `/plugin install mobile-agent-testers@mobile-agent-testers`.

Every input (builds, briefs, bug reports, cheaper models, build arguments, video) and the supported frameworks: [docs/configuration.md](docs/configuration.md).

<details>
<summary>What the demo run finds</summary>

The demo app has [11 deliberate bugs](demo-app/BUGS.md). In [one run](docs/runs/), the 4 demo testers found 9 of them (2 to 7 minutes per agent, about 21 minutes for the whole run, builds included), plus real issues nobody planted (a button under the Android nav bar, no data kept after a relaunch). Model usage: $0.87 for the 4.

</details>

## What it does

Each persona explores your app like a new user and reports what gets in the way, with numbered screenshots. A run can also follow one feature end to end, reproduce a bug report, write an improvement report, compare two versions or test a website on phones. One use per run, set with the inputs above.

<details>
<summary>The six uses, one by one</summary>

| Use | What you get |
|---|---|
| **Explore like new users** (default) | Each persona tries to reach its goal and reports what gets in the way, with numbered screenshots. |
| **Run one feature end to end** | Your brief sends every agent through a whole mechanic: taps, swipes, typing, relaunches, deep links. [AnkiDroid's](briefs/ankidroid.md) found the Back field of a new card hidden behind the keyboard. |
| **Reproduce a bug report** | Each phone answers yes, no or unclear, with screenshots ([brief](briefs/reproduce.md)). |
| **Get an improvement report** | Where each persona hesitated, what it expected, what to change first ([brief](briefs/improve.md)). |
| **Compare two versions** | The same personas on two branches or builds, then one table of goals, scores and issues ([how](docs/compare-versions.md)). |
| **Test a website on phones** | The same personas in a phone's browser, on any site or web app. It runs on free Linux runners ([configuration](docs/configuration.md)). |

</details>

Any Anthropic-compatible model works, from Claude Haiku to OpenRouter, DeepSeek, Kimi, GLM, MiniMax or Qwen; findings are only as good as the model's reading of screenshots ([docs/cheaper-models.md](docs/cheaper-models.md)). Maestro or Appium run the tests you write; these agents look for what nobody thought to test ([how it compares](docs/compare.md)).

## See every screen on one map

<a href="https://pierridotite.github.io/mobile-agent-testers/"><img src="assets/dashboard.png" alt="The map of LocalSend: every screen as a card, read left to right from the launch, a colored line for each tester, dashed lines where only the robot went, an overview on the right" width="100%"></a>

Every screen the testers reached, with the path of each one in its own color and a heat map of where they tapped. Pick a device in the Device menu to see the screens in its shape (phone or tablet) and its own heat map. Comment a screen, or turn what is wrong on it into a check.

<p align="center"><a href="https://pierridotite.github.io/mobile-agent-testers/"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/demo-try-dark.svg"><img src="assets/demo-try-light.svg" alt="Try the live demo in your browser" width="190" height="54"></picture></a></p>

On your own run: `python3 scripts/dashboard.py runs/<id>`. It runs on your machine and the results never leave it ([docs/dashboard.md](docs/dashboard.md)).

## Every bug becomes a test

A tester that finds a bug took a path no script would have written. Each Android tester keeps that path as a trace, with each tap named after the element under the finger. With `-f replay_path=true`, the path replays on the same phone right after the agent, with no model. A check added on the map makes the bug part of the test: the replay says `bug` while it is there and `fixed` once it is gone ([docs/replay.md](docs/replay.md)).

The traces follow Explore-Compile-Replay, my open format that compiles an agent's path into a [Maestro](https://maestro.dev) flow. Android only for now; ECR is an early draft.

<p align="center"><a href="https://github.com/pierridotite/explore-compile-replay"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/ecr-button-dark.svg"><img src="assets/ecr-button-light.svg" alt="Explore-Compile-Replay: every bug becomes a test" width="320" height="54"></picture></a></p>

## Real runs

Open-source apps, with nothing planted. On [LocalSend](https://github.com/localsend/localsend) (Flutter, 100k stars), 20 phones in 14 languages found 46 distinct bugs in 69 minutes, for $4.62 of model usage. One is a blocker: on an iPhone SE in Swedish at the largest text size, you can't send a text message at all.

<details>
<summary>The three runs: LocalSend, AnkiDroid, Flutter's animations sample</summary>

| App | Phones | What the agents found | Time, model usage |
|---|---|---|---|
| [LocalSend](https://github.com/localsend/localsend) (Flutter, 100k stars) | 20: 10 Android, 10 iOS, 14 languages | 46 distinct bugs, 1 blocker: on an iPhone SE in Swedish at the largest text size, you can't send a text message at all | 69 min, $4.62 |
| [AnkiDroid](https://github.com/ankidroid/Anki-Android) (Kotlin, 12k stars, release APK) | 10 Android | 43 distinct issues, among them answer buttons cut in half at 200% font and "Get started" left in English in three languages | under 10 min, $4.69 |
| [Flutter's animations sample](https://github.com/flutter/packages/tree/main/packages/animations/example) | 1 Android, 1 iOS | The same typo, reported by both agents on their own, and an app that ignores dark mode | 19 min, $0.47 |

</details>

34 of LocalSend's 46 bugs had nothing to do with text size or accessibility: broken flows, silent failures, missing translations, tablet layouts. Screenshots, every finding and the commands to run them again: [docs/examples.md](docs/examples.md).

## Contributing

[Issues are ready to take](https://github.com/pierridotite/mobile-agent-testers/issues/9), some of them [good first issues](https://github.com/pierridotite/mobile-agent-testers/labels/good%20first%20issue): new personas, another agent CLI, GitLab CI, translations. Comment on the one you take so two people don't build the same thing. [CONTRIBUTING.md](CONTRIBUTING.md) says where each one starts and how to test it offline. Merged a pull request, or ran it on your app? [Show your work](docs/share.md). Questions: [Discord](https://discord.gg/WuaCANscr8).

## Hosted version for teams (exploring)

The workflow here stays free, open source and complete. I'm exploring a hosted version for teams with private apps: macOS runners included (on a private repo, GitHub counts each macOS minute ten times) and a web dashboard to share the reports with the whole team, product managers included.

Would that help your team? [Answer three questions](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=teams.yml) or [write to me on LinkedIn](https://www.linkedin.com/in/pierre-raffalli/). Already ran it on your app? [Tell me what it found and what got in the way](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=usage-feedback.yml).

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=pierridotite/mobile-agent-testers&type=Date)](https://star-history.com/#pierridotite/mobile-agent-testers&Date)

## Credits

[Claude Code](https://docs.claude.com/en/docs/claude-code) ·
[AXe](https://github.com/cameroncooke/axe) ·
[android-emulator-runner](https://github.com/ReactiveCircus/android-emulator-runner)

## Contributors

Thanks to everyone who has contributed. Want to help? [Start here](CONTRIBUTING.md).

<a href="https://github.com/pierridotite/mobile-agent-testers/graphs/contributors"><img src="https://contrib.rocks/image?repo=pierridotite/mobile-agent-testers" alt="Contributors" /></a>

Made by Pierre Raffalli · [LinkedIn](https://www.linkedin.com/in/pierre-raffalli/) · [GitHub](https://github.com/pierridotite) · [Discord](https://discord.gg/WuaCANscr8) · MIT license
