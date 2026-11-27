# FAQ

English · [简体中文](../i18n/zh-CN/docs/faq.md) · [日本語](../i18n/ja/docs/faq.md) · [Español](../i18n/es/docs/faq.md) · [Português](../i18n/pt-BR/docs/faq.md) · [Tiếng Việt](../i18n/vi/docs/faq.md) · [Türkçe](../i18n/tr/docs/faq.md)

## Do 20 agents just find the same bug 20 times?

No. On LocalSend, the 103 reports were 46 distinct bugs, and 29 of them were found by one agent only, the blocker included ([chart](examples.md#localsend-20-agents-20-devices-14-languages)). Right-to-left bugs only came from the two Arabic personas, and tablet bugs from the four tablets. The duplicates were app-wide states that everyone hits, like the empty device list.

## How much does it cost?

GitHub's runners are free for public repos, macOS included. Model usage was $0.15 to $0.55 per agent in [these runs](runs/), so about $5 for 20 phones. With a Claude subscription, runs count against your plan's usage instead of a bill. To spend less, run `model=haiku` or another provider's model: [docs/cheaper-models.md](cheaper-models.md).

## How long does a run take?

Each agent explores for 1 to 18 minutes. AnkiDroid's 10 Android agents took under 10 minutes from start to the last report. LocalSend's 20 devices took 69 minutes, builds included, because the Free plan runs 5 macOS jobs at a time.

## Do I need a Mac?

No. Everything runs on GitHub's runners: Linux for Android, macOS for iOS. You need the `gh` CLI and a Claude subscription or API key, and `./setup.sh` (`.\setup.ps1` on Windows) does the rest.

## Will two runs give the same result?

No. Each agent explores, so two runs never take the same path: expect the same kinds of bugs, not the same list. Keep scripted tests (Maestro, Appium) for regressions, see [how it compares](compare.md).

## Are my reports public?

No. The logs of a public repo are public, so reports, screenshots and videos are encrypted with your key before they leave the runner, and only you can decrypt them. Analytics hosts are blocked inside the phones. Use test accounts, never real ones. More in [PRIVACY.md](../PRIVACY.md).

## Can I test a closed-source app?

Yes. Run the workflow from a private repo, with a read-only `SOURCE_REPO_TOKEN` for your app's repo, or point `android_build` and `ios_build` at a prebuilt APK or .app. Private repos use your Actions minutes, and macOS minutes count ten times.

## Can I make my own personas?

Yes. A persona is a few lines in [personas.json](../personas.json): device, OS version, language, text size, dark mode, location, who they are and what they try to do. Optional settings in `device`: `"increase_contrast": true` (Increase Contrast on iOS, high contrast text on Android), `"reduce_motion": true` (iOS and web: Android emulators already run with animations off), `"color_filter"` (`"protanopia"`, `"deuteranopia"` or `"tritanopia"`, applied to screenshots on Android, iOS and web) and `"network"` (`"slow"` or `"flaky"`, Android emulator only).

## What does it get wrong?

It sometimes misreads a screen: 3 of LocalSend's 20 agents flagged the Simulator's English keyboard as part of the app. A few minutes per agent covers the main paths, not every corner of a big app. Every finding comes with numbered screenshots, so check them before filing anything.

## Limits

- GitHub runners are free for public repos: about 20 jobs at once, 5 on macOS.
- On plans with a 5-hour usage limit, 20 agents can use it up in ~15 min: run batches of 6-10.
- Hosted runners are meant for the repo's own project. For a closed-source app, run the workflow in your private repo or on your own Mac.

## How it works

<p align="center"><img src="../assets/how-it-works.svg" alt="How it works: one workflow builds the app, then one emulator or simulator with one agent per persona, encrypted reports, summary on your machine" width="100%"></p>

- **Personas** set the device: model, OS, font size, dark mode, language, location.
- **Three tools per agent**: see the screen (with tap coordinates), gestures, typing.
- **Accessibility check** on every screen: controls with no name and touch targets under 48 dp (Android) or 44 pt (iOS), for the agent to confirm on the screenshot.
- **Encrypted results**: public repo logs are public, so everything is encrypted with your key.
- **Analytics blocked** inside the phones, so tests never touch your real stats.
- **One summary** on your machine. With `SUMMARY_GROUPING=1`, Claude groups the reports that describe the same bug (one call on your Claude login), so you see how many personas hit each one and which personas found which kind of issue. With `SUMMARY_WEBHOOK_URL` set, a short version also goes to your Slack or Discord webhook, from your machine only.
- **Draft issues** on your machine: `python3 scripts/draft_issues.py runs/<id>` previews one GitHub issue per finding from `SUMMARY.md`, and `--create --repo OWNER/REPO` opens the ones you confirm with `gh`.
- **Tests** on every push, offline and with no phone: accessibility check, persona matrix, summary, encrypted results ([tests/](../tests/)).

## Why not Maestro, Appium or agent-device?

They run the tests you write. These agents look for what nobody thought to test.

| | mobile-agent-testers | Maestro, Appium, Detox, e2e |
|---|---|---|
| You write | Nothing: pick personas from the list | Flows or test code |
| It catches | Broken flows, silent errors, missing translations, layout at large text, dark mode, confusing copy | What each test checks |
| Same result every run | No: each run explores, so check the screenshots | Yes |

[agent-device](https://github.com/callstackincubator/agent-device) gives one coding agent hands on one simulator. This runs a whole session: it builds the app, gives each persona its own device and collects encrypted reports. Use agents before a release, and scripted flows for regressions.

Full comparison, with Firebase Test Lab Robo, mobile-mcp, phonedriver and human beta testers: [docs/compare.md](compare.md).
