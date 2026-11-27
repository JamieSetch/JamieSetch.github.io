# Jamie Setch — research portfolio

A plain static site: no build step, no dependencies. Live at https://jamiesetch.github.io

## Structure

- `index.html` — home page: the animated artwork *NIGHT TIDE* fills the window, with the nav in white in its night sky
- `js/night-tide.js` — JavaScript port of JIN2's `night_tide.py` that draws the homepage animation
- `about/`, `projects/` — one `index.html` per section, so URLs are `/about/` etc. (research lives on the About page)
- `css/style.css` — the only stylesheet
- `favicon.png` — the bird logo
- `archive/` — previous versions of the site, kept for reference
  - `2024-music-site/` — the original music-and-merch site (build.py + templates)
  - `2026-03-rebuild/` — the unfinished March 2026 shop-style rebuild

## Run locally

Links are root-relative (`/about/`), so serve the site rather than opening the files directly. Always pass
`--directory` (Python serves whatever folder it's started in) and `--bind 127.0.0.1` (otherwise anyone on
your network can browse it):

```bash
python3 -m http.server 8090 --bind 127.0.0.1 --directory "$HOME/Desktop/Old Desktop/Desktop - Jamie’s MacBook Pro/Jamie Setch Website"
```

Then open http://localhost:8090

## Homepage artwork

*NIGHT TIDE* is my own ASCII code art, published as JIN2 ([@jin_22ee](https://instagram.com/jin_22ee);
[original Python](https://github.com/JIN2-ASCII/-JIN2-ASCII/tree/main/NIGHT-TIDE)). `js/night-tide.js` is
© 2026 JIN2, all rights reserved, like the original.

The port reproduces the original's maths exactly (checked cell by cell against the Python at several
moments in the 20-second loop). Visitors who have reduced motion switched on see a still frame instead.

### Time of day

The light follows each visitor's local clock. Night (20:30–04:30) is JIN2's original exactly; around that
it blends through dawn (06:00), day (08:00–17:00) and dusk (19:00). Only the colours, the sky, sea and sand
behind the letters, the amount of glitter and the stars change, never the waves. By dawn, day and dusk,
sand shows through the shallows in patches and covers the beach (bottom ~14%), wet and dark where the
waves have just been (catching the sea's light, gold at dusk, with a few glints) and drier further up; at night it stays black like the original.

To preview a time, add `?hour=` to the address, e.g. http://localhost:8090/?hour=13 or `?hour=19`.
The colours and times live in the "time of day" block near the top of `js/night-tide.js`.

## Publish

The live site is GitHub Pages, served from the `main` branch of
[JamieSetch/JamieSetch.github.io](https://github.com/JamieSetch/JamieSetch.github.io) (git remote `live`).
Work happens on `research-portfolio`; to publish it:

```bash
git push live research-portfolio:main
```

The live site updates a minute or two later. `.nojekyll` tells GitHub to serve the files as they are.

## After changing CSS or JS

Browsers keep old copies of `css/style.css` and `js/night-tide.js`. Each page links them with a
`?v=...` version tag; change that tag in every page (`index.html`, `about/`, `projects/`) whenever you
edit either file, so visitors get the new version straight away.

## Adding a page

Copy an existing section folder, change the `<title>`, and move `class="active" aria-current="page"` to the matching nav link. The nav is repeated in each page, so a new heading has to be added to every page (`index.html`, `about/`, `projects/`).
