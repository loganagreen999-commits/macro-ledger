#!/usr/bin/env python3
"""
Generate one entry page per skin.

Safari fetches the manifest as soon as it parses <link rel="manifest"> in the
head, so swapping that href from script later is too late: Add to Home Screen
has already taken start_url from the default manifest. And a home-screen app on
iOS gets its own storage, separate from Safari, so the flag cannot be carried in
localStorage either.

So each skin gets a real page, <skin>.html, sitting beside index.html — same
directory, so every relative path still resolves — with the right manifest link
in the head from the start and the skin forced before any script runs. Its
manifest's start_url points back at that page, so every launch is skinned.

Run this after any edit to index.html.
"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
SKINS = {
    "gator":  ("Macro Ledger \U0001F40A", "#0A1A3C"),
    "comic":  ("Macro Ledger :)",         "#FFF8E7"),
    "bee":    ("Macro Ledger \U0001F41D", "#FFE873"),
    "barbie": ("Macro Ledger \U0001F380", "#FFE3F1"),
    "matrix": ("MACRO_LEDGER",            "#000600"),
    "shamu":  ("Shamu Stopper",           "#08152B"),
}

def main():
    src = (HERE / "index.html").read_text(encoding="utf-8")
    link = '<link rel="manifest" href="manifest.webmanifest" id="mf">'
    if link not in src:
        sys.exit("index.html: manifest link not found — did the head change?")
    base = json.loads((HERE / "manifest.webmanifest").read_text(encoding="utf-8"))

    for skin, (label, colour) in SKINS.items():
        page = "%s.html" % skin
        head = ('<link rel="manifest" href="manifest-%s.webmanifest" id="mf">\n'
                '<script>window.__FORCE_SKIN__="%s"</script>' % (skin, skin))
        out = src.replace(link, head, 1)
        out = out.replace('<meta name="apple-mobile-web-app-title" content="Macro Ledger">',
                          '<meta name="apple-mobile-web-app-title" content="%s">' % label, 1)
        out = out.replace("<title>Macro Ledger</title>", "<title>%s</title>" % label, 1)
        (HERE / page).write_text(out, encoding="utf-8")

        m = dict(base)
        m.update(name=label, short_name=label, start_url="./" + page,
                 id="/macro-ledger/%s/" % skin,
                 theme_color=colour, background_color=colour)
        (HERE / ("manifest-%s.webmanifest" % skin)).write_text(
            json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")
        print("%-12s -> %-14s start_url=%s" % (skin, page, m["start_url"]))

if __name__ == "__main__":
    main()
