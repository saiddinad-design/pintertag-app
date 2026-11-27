"""Every relative link in the README, the docs and their translations in i18n/
must lead to a file that exists, and every language has the same pages."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINK = re.compile(r'(?:\]\(|(?:src|href|srcset)=")([^)"\s]+)')
TRANSLATED = ["README.md", "docs/configuration.md", "docs/examples.md", "docs/faq.md"]


def pages():
    yield from ROOT.glob("*.md")
    yield from (ROOT / "docs").glob("*.md")
    yield from (ROOT / "i18n").rglob("*.md")


class I18nLinks(unittest.TestCase):
    def test_relative_links_exist(self):
        broken = []
        for page in pages():
            text = page.read_text(encoding="utf-8")
            for target in LINK.findall(text):
                if re.match(r"^(https?:|mailto:|#|/)", target):
                    continue
                path = target.split("#")[0]
                if path and not (page.parent / path).exists():
                    broken.append(f"{page.relative_to(ROOT)}: {target}")
        self.assertEqual(broken, [])

    def test_every_language_has_every_page(self):
        for lang in sorted(p.name for p in (ROOT / "i18n").iterdir() if p.is_dir()):
            for page in TRANSLATED:
                with self.subTest(lang=lang, page=page):
                    self.assertTrue((ROOT / "i18n" / lang / page).exists())


if __name__ == "__main__":
    unittest.main()
