# Test your own app

English · [简体中文](../i18n/zh-CN/docs/configuration.md) · [日本語](../i18n/ja/docs/configuration.md) · [Español](../i18n/es/docs/configuration.md) · [Português](../i18n/pt-BR/docs/configuration.md) · [Tiếng Việt](../i18n/vi/docs/configuration.md) · [Türkçe](../i18n/tr/docs/configuration.md)

```bash
gh workflow run agent-testers.yml -f source_repo=you/app -f app_id=com.you.app \
  -f android_personas=anna,malik -f ios_personas=clara,jonas
```

| Input | |
|---|---|
| `source_repo`, `ref` | App repo and branch (empty = this repo). Private repo: add a read-only `SOURCE_REPO_TOKEN` secret |
| `app_dir`, `app_id` | App folder, Android package / iOS bundle id (if the other platform uses another id, it is read from its built app) |
| `android_personas`, `ios_personas` | Ids from [personas.json](../personas.json), one phone each, `all`, or `none` to skip a platform. 20 ready: 14 languages, right to left, tablets, text from small to the largest accessibility size, increased contrast, reduced motion, a color blindness filter and a flaky network |
| `brief` | Agent instructions: [AGENT_BRIEF.md](../AGENT_BRIEF.md) to explore, [briefs/improve.md](../briefs/improve.md) for an improvement report, [briefs/map.md](../briefs/map.md) to find every screen for the [dashboard](dashboard.md) map, or your own for one feature |
| `bug_report` | A bug to reproduce instead of exploring: an issue (`owner/repo#123` or its URL) or the steps as text. Each agent follows it on its own device ([briefs/reproduce.md](../briefs/reproduce.md)) |
| `web_personas`, `web_url` | Ids of web personas (`tom`, `amelie`, `lena`, `arjun`), `all`, or `none` (default), and the address of the site to test. The other platforms keep their defaults, so set `android_personas=none` and `ios_personas=none` for a web-only run. |
| `model`, `llm_base_url` | `sonnet` by default, `haiku` to spend less, or any Anthropic-compatible API with its key in an `LLM_API_KEY` secret ([docs/cheaper-models.md](cheaper-models.md)) |
| `framework` | `auto` (default) or force one of the frameworks below |
| `android_build` + `apk_path`, `ios_build` + `ios_app_path` | Your own build command, or a download of a prebuilt app (paths relative to `app_dir`) |
| `build_args` | Extra arguments for the automatic build of both platforms, like `--dart-define=API_URL=https://staging.example.com` for Flutter (Gradle and xcodebuild arguments for the others). Keys go in a `BUILD_ARGS` secret: run inputs are public on a public repo |
| `block_hosts` | Analytics hosts blocked during tests |
| `record_video` | Screen recording of each phone, encrypted with the reports |
| `replay_path` | Experimental, Android: after each agent, its path is replayed on the same phone with no model ([docs/replay.md](replay.md)) |
| `replay_traces`, `replay_times` | Experimental, Android: no agent. The traces kept in a folder of the repo are replayed `replay_times` times each (20 by default) on each persona's phone, with no model ([docs/replay.md](../docs/replay.md#replay-kept-traces-many-times)) |
| `map` | Experimental, Android: map every screen first. `robot`: a robot with no model, free. `robot+agent`: the robot, then an agent only for the forms it could not pass. Use one persona ([docs/dashboard.md](dashboard.md)) |

**Supported out of the box** (detected automatically):

| Framework | Android | iOS Simulator |
|---|---|---|
| Flutter | `flutter build apk --debug` | `flutter build ios --simulator` |
| React Native / Expo | Gradle release | Xcode, arm64 |
| Native Kotlin / Java, Swift / Objective-C | Gradle debug | Xcode, arm64 |
| Kotlin Multiplatform | Gradle debug | Xcode project of the iOS app |
| Capacitor / Ionic | Gradle debug after `cap sync` | Xcode after `cap sync` |
| NativeScript (beta) | `ns build android` (debug) | `ns build ios` (simulator) |
| .NET MAUI (beta) | `dotnet publish` | `dotnet build` for `iossimulator-arm64` |
| Anything else | `android_build` + `apk_path` | `ios_build` + `ios_app_path` |

Agents read the screen from screenshots and the accessibility tree, so any UI
toolkit works. Labelled widgets (Flutter `Semantics`, `contentDescription`,
`accessibilityLabel`) give them more precise tap targets.
