"""build_args input and BUILD_ARGS secret, offline: scripts/build/args.sh, then the
automatic Flutter and NativeScript builds of both platforms with stand-in CLIs."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAKE_FLUTTER = """#!/usr/bin/env bash
printf '%s\\n' "$@" > "$FAKE_LOG.$1.$2"
case "$1 $2" in
  "build apk") mkdir -p build/app/outputs/flutter-apk && echo apk > build/app/outputs/flutter-apk/app-debug.apk ;;
  "build ios") mkdir -p build/ios/iphonesimulator/Runner.app ;;
esac
"""
FAKE_NS = """#!/usr/bin/env bash
printf '%s\\n' "$@" > "$FAKE_LOG.$1.$2"
[ -n "${FAKE_NS_NO_OUTPUT:-}" ] && exit 0
case "$1 $2" in
  "build android")
    mkdir -p platforms/android/app/build/outputs/apk/debug
    echo apk > platforms/android/app/build/outputs/apk/debug/app-debug.apk ;;
  "build ios")
    mkdir -p platforms/ios/build/Debug-iphonesimulator/MyApp.app ;;
esac
"""
FAKE_NPM = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_NPM_LOG"
"""


def parse(build_args="", secret=""):
    script = ('set -u; . scripts/build/args.sh; build_args; code=$?; '
              'echo "code=$code"; for a in ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"}; do echo "arg=$a"; done')
    env = dict(os.environ, BUILD_ARGS=build_args, BUILD_ARGS_SECRET=secret)
    out = subprocess.run(["bash", "-c", script], cwd=ROOT, env=env, capture_output=True, text=True).stdout
    args = [l[4:] for l in out.splitlines() if l.startswith("arg=")]
    shown = "\n".join(l for l in out.splitlines() if not l.startswith("arg="))
    return args, shown


class Parse(unittest.TestCase):
    def test_input_then_secret_with_shell_quotes(self):
        args, shown = parse('--dart-define=API_URL=https://staging.example.com --dart-define="TITLE=two words"',
                            "--dart-define=KEY=s3cret")
        self.assertEqual(args, ["--dart-define=API_URL=https://staging.example.com",
                                "--dart-define=TITLE=two words", "--dart-define=KEY=s3cret"])
        self.assertIn("Extra build arguments: 3", shown)
        self.assertIn("code=0", shown)
        self.assertNotIn("s3cret", shown)

    def test_nothing_set_is_fine_under_set_u(self):
        args, shown = parse("", "  ")
        self.assertEqual(args, [])
        self.assertIn("code=0", shown)
        self.assertNotIn("Extra build arguments", shown)

    def test_unbalanced_quotes_fail_without_showing_values(self):
        args, shown = parse("", '--dart-define="KEY=s3cret')
        self.assertIn("code=1", shown)
        self.assertIn("unbalanced quotes", shown)
        self.assertNotIn("s3cret", shown)


class FlutterBuilds(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        shutil.copytree(ROOT / "scripts" / "build", self.root / "scripts" / "build")
        (self.root / "app").mkdir()
        (self.root / "app" / "pubspec.yaml").write_text("name: app\n")
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        (bin_dir / "flutter").write_text(FAKE_FLUTTER)
        (bin_dir / "flutter").chmod(0o755)
        self.log = self.root / "flutter-args"
        self.env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}", GITHUB_WORKSPACE=str(self.root),
                        RUNNER_TEMP=str(self.root / "tmp"), FAKE_LOG=str(self.log),
                        BUILD_ARGS="--dart-define=API_URL=https://staging.example.com",
                        BUILD_ARGS_SECRET="--dart-define=KEY=s3cret")

    def build(self, platform, **env):
        return subprocess.run(["bash", f"scripts/build/{platform}.sh", "app", "auto"], cwd=self.root,
                              env=dict(self.env, **env), capture_output=True, text=True)

    def test_android(self):
        proc = self.build("android")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        args = Path(f"{self.log}.build.apk").read_text().split("\n")
        self.assertIn("--dart-define=API_URL=https://staging.example.com", args)
        self.assertIn("--dart-define=KEY=s3cret", args)
        self.assertTrue((self.root / "app.apk").exists())
        self.assertNotIn("s3cret", proc.stdout + proc.stderr)

    def test_ios(self):
        proc = self.build("ios")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        args = Path(f"{self.log}.build.ios").read_text().split("\n")
        self.assertEqual(args[:3], ["build", "ios", "--simulator"])
        self.assertIn("--dart-define=KEY=s3cret", args)
        self.assertTrue((self.root / "app-ios.tgz").exists())

    def test_no_extra_arguments(self):
        proc = self.build("android", BUILD_ARGS="", BUILD_ARGS_SECRET="")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        args = [a for a in Path(f"{self.log}.build.apk").read_text().split("\n") if a]
        self.assertEqual(args, ["build", "apk", "--debug", "--target-platform", "android-x64"])

    def test_ignored_with_a_custom_build_command(self):
        (self.root / "app" / "prebuilt.apk").write_text("apk")
        proc = self.build("android", BUILD_COMMAND="true", ARTIFACT="prebuilt.apk")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("::warning::build_args is ignored with a custom android_build command", proc.stdout)


class NativeScriptBuilds(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        shutil.copytree(ROOT / "scripts" / "build", self.root / "scripts" / "build")
        (self.root / "app").mkdir()
        (self.root / "app" / "nativescript.config.ts").write_text("export default { id: 'org.example.app' };\n")
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        (bin_dir / "ns").write_text(FAKE_NS)
        (bin_dir / "ns").chmod(0o755)
        (bin_dir / "npm").write_text(FAKE_NPM)
        (bin_dir / "npm").chmod(0o755)
        self.log = self.root / "ns-args"
        self.npm_log = self.root / "npm-args"
        self.env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}", GITHUB_WORKSPACE=str(self.root),
                        RUNNER_TEMP=str(self.root / "tmp"), FAKE_LOG=str(self.log),
                        FAKE_NPM_LOG=str(self.npm_log),
                        BUILD_ARGS="--env.apiUrl=https://staging.example.com",
                        BUILD_ARGS_SECRET="--env.key=s3cret")

    def build(self, platform, framework="auto", **env):
        return subprocess.run(["bash", f"scripts/build/{platform}.sh", "app", framework], cwd=self.root,
                              env=dict(self.env, **env), capture_output=True, text=True)

    def detect(self, app_dir):
        proc = subprocess.run(["bash", str(self.root / "scripts/build/detect.sh")], cwd=app_dir,
                              capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        return proc.stdout.strip()

    def test_detect_config_ts_and_js(self):
        self.assertEqual(self.detect(self.root / "app"), "nativescript")
        js_app = self.root / "app-js"
        js_app.mkdir()
        (js_app / "nativescript.config.js").write_text("module.exports = { id: 'org.example.app' };\n")
        self.assertEqual(self.detect(js_app), "nativescript")

    def test_detect_package_json(self):
        core_app = self.root / "app-core"
        core_app.mkdir()
        (core_app / "package.json").write_text('{"dependencies": {"@nativescript/core": "^8.8.0"}}\n')
        self.assertEqual(self.detect(core_app), "nativescript")
        legacy_app = self.root / "app-legacy"
        legacy_app.mkdir()
        (legacy_app / "package.json").write_text('{"dependencies": {"tns-core-modules": "^6.5.0"}}\n')
        self.assertEqual(self.detect(legacy_app), "nativescript")

    def test_detect_rejects_non_nativescript(self):
        plain = self.root / "plain"
        plain.mkdir()
        (plain / "package.json").write_text('{"name": "demo", "keywords": ["nativescript"]}\n')
        self.assertEqual(self.detect(plain), "native")
        rn = self.root / "rn"
        rn.mkdir()
        (rn / "package.json").write_text('{"dependencies": {"react-native": "0.76.0"}}\n')
        self.assertEqual(self.detect(rn), "react-native")

    def test_android(self):
        proc = self.build("android")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("Framework: nativescript", proc.stdout)
        args = [a for a in Path(f"{self.log}.build.android").read_text().splitlines() if a]
        self.assertEqual(args, ["build", "android", "--env.apiUrl=https://staging.example.com", "--env.key=s3cret"])
        self.assertTrue((self.root / "app.apk").exists())
        self.assertNotIn("s3cret", proc.stdout + proc.stderr)

    def test_ios(self):
        proc = self.build("ios")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("Framework: nativescript", proc.stdout)
        args = [a for a in Path(f"{self.log}.build.ios").read_text().splitlines() if a]
        self.assertEqual(args, ["build", "ios", "--env.apiUrl=https://staging.example.com", "--env.key=s3cret"])
        self.assertTrue((self.root / "app-ios.tgz").exists())
        self.assertNotIn("s3cret", proc.stdout + proc.stderr)

    def test_no_extra_arguments(self):
        proc = self.build("android", BUILD_ARGS="", BUILD_ARGS_SECRET="")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        args = [a for a in Path(f"{self.log}.build.android").read_text().splitlines() if a]
        self.assertEqual(args, ["build", "android"])
        proc = self.build("ios", BUILD_ARGS="", BUILD_ARGS_SECRET="")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        args = [a for a in Path(f"{self.log}.build.ios").read_text().splitlines() if a]
        self.assertEqual(args, ["build", "ios"])

    def test_package_json_triggers_npm_install(self):
        (self.root / "app" / "nativescript.config.ts").unlink()
        (self.root / "app" / "package.json").write_text('{"dependencies": {"@nativescript/core": "^8.8.0"}}\n')
        proc = self.build("android", BUILD_ARGS="", BUILD_ARGS_SECRET="")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("ci", self.npm_log.read_text().splitlines())

    def test_missing_artifact_fails(self):
        proc = self.build("android", FAKE_NS_NO_OUTPUT="1")
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("No APK found after the nativescript build", proc.stdout)
        proc = self.build("ios", FAKE_NS_NO_OUTPUT="1")
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("No Simulator .app found after the nativescript build", proc.stdout)


if __name__ == "__main__":
    unittest.main()
