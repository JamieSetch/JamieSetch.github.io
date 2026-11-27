/*
 * Time of day for the whole site: the light follows each visitor's local
 * clock. The homepage artwork (js/night-tide.js) takes its palette, sky, sea
 * and sand from here, and every other page uses the same sky as its
 * background.
 *
 * Night is NIGHT TIDE's original look exactly; dawn, day and dusk are new for
 * the site and only change colours, never the waves. Preview any time by
 * adding ?hour=13.5 to the address.
 *
 * Load this in each page's <head> (not deferred), after the theme-color meta
 * tag, so the sky is set before the page first paints.
 */
(() => {
  "use strict";

  // colours: six water tones dark to bright, then silver, glint, foam, sand, star
  const NIGHT = {
    // NIGHT TIDE's original palette
    colors: [[20, 34, 64], [28, 50, 92], [40, 72, 122], [62, 100, 152], [98, 136, 182], [146, 176, 210],
      [196, 206, 218], [236, 238, 240], [222, 230, 240], [86, 84, 98], [170, 180, 205]],
    top: [0, 0, 0], horizon: [0, 0, 0], sea: [0, 0, 0], wetSand: [0, 0, 0], sand: [0, 0, 0],
    shallow: [0, 0, 0], shallowMix: 0,
    gain: 1, glitter: 0.68, stars: 1, sheen: 0, sandGlint: 0,
  };
  const DAWN = {
    colors: [[44, 30, 70], [66, 44, 98], [96, 62, 124], [136, 86, 146], [184, 118, 160], [226, 160, 176],
      [240, 200, 200], [255, 226, 200], [246, 226, 232], [130, 96, 104], [200, 180, 210]],
    top: [16, 16, 44], horizon: [92, 56, 96], sea: [10, 10, 26], wetSand: [72, 56, 64], sand: [132, 108, 108],
    shallow: [112, 92, 140], shallowMix: 0.7, // clear lavender water over sand
    gain: 1.05, glitter: 0.6, stars: 0.3, sheen: 0.3, sandGlint: 0.03,
  };
  const DAY = {
    colors: [[10, 60, 96], [14, 86, 126], [20, 116, 156], [36, 150, 184], [84, 188, 210], [150, 222, 232],
      [214, 240, 246], [255, 252, 230], [246, 250, 252], [196, 170, 126], [200, 220, 240]],
    top: [12, 52, 100], horizon: [70, 130, 180], sea: [6, 34, 60], wetSand: [124, 106, 80], sand: [196, 176, 136],
    shallow: [64, 178, 188], shallowMix: 0.85, // clear turquoise water over sand
    gain: 1.15, glitter: 0.52, stars: 0, sheen: 0.1, sandGlint: 0.015,
  };
  const DUSK = {
    colors: [[40, 22, 60], [70, 32, 82], [110, 44, 98], [160, 64, 100], [214, 102, 88], [244, 156, 96],
      [250, 196, 150], [255, 222, 150], [252, 222, 204], [176, 116, 78], [210, 180, 200]],
    top: [22, 12, 44], horizon: [120, 52, 58], sea: [14, 8, 24], wetSand: [82, 52, 46], sand: [152, 106, 80],
    shallow: [150, 84, 72], shallowMix: 0.6, // clear water over sand, catching the sunset
    gain: 1.05, glitter: 0.58, stars: 0.4, sheen: 0.45, sandGlint: 0.05,
  };
  // (hour, light): blends smoothly between neighbours
  const DAY_KEYS = [[0, NIGHT], [4.5, NIGHT], [6, DAWN], [8, DAY], [17, DAY], [19, DUSK], [20.5, NIGHT], [24, NIGHT]];

  const lerp = (a, b, u) => a + (b - a) * u;
  const mix3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
  const rgb = (c) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;

  function lightAt(hour) {
    const h = ((hour % 24) + 24) % 24;
    let k = 0;
    while (k < DAY_KEYS.length - 2 && h > DAY_KEYS[k + 1][0]) k++;
    const [h0, a] = DAY_KEYS[k], [h1, b] = DAY_KEYS[k + 1];
    if (a === b) return a;
    let u = (h - h0) / (h1 - h0);
    u = u * u * (3 - 2 * u);
    return {
      colors: a.colors.map((c, i) => mix3(c, b.colors[i], u)),
      top: mix3(a.top, b.top, u), horizon: mix3(a.horizon, b.horizon, u), sea: mix3(a.sea, b.sea, u),
      wetSand: mix3(a.wetSand, b.wetSand, u), sand: mix3(a.sand, b.sand, u),
      shallow: mix3(a.shallow, b.shallow, u), shallowMix: lerp(a.shallowMix, b.shallowMix, u),
      gain: lerp(a.gain, b.gain, u), glitter: lerp(a.glitter, b.glitter, u), stars: lerp(a.stars, b.stars, u),
      sheen: lerp(a.sheen, b.sheen, u), sandGlint: lerp(a.sandGlint, b.sandGlint, u),
    };
  }

  const forcedHour = (() => {
    const q = new URLSearchParams((window.location && window.location.search) || "").get("hour");
    return q !== null && q.trim() !== "" && Number.isFinite(+q) ? +q : null;
  })();

  function clockHour() {
    if (forcedHour !== null) return forcedHour;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  // Page background: the sky from its top down to just above the horizon.
  // Stopping short of the horizon keeps white text readable on the day sky.
  // Also tints the phone browser's bar to match.
  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  function paintSky() {
    const light = lightAt(clockHour());
    const top = rgb(light.top);
    root.style.setProperty("--sky-top", top);
    root.style.setProperty("--sky-low", rgb(mix3(light.top, light.horizon, 0.85)));
    if (themeMeta) themeMeta.content = top;
  }

  paintSky();
  setInterval(paintSky, 60 * 1000);

  // Arriving from the homepage's fly-in (js/zoom-nav.js): the sky and stars
  // are already there, and the page's text fades in over them.
  try {
    if (sessionStorage.getItem("arriving") === "1") {
      sessionStorage.removeItem("arriving");
      root.classList.add("arriving");
    }
  } catch {}

  // Stars: NIGHT TIDE's scattered ASCII stars, spread over the whole
  // background of every page and twinkling the same way. They fade out by
  // day. On the homepage they sit hidden behind the artwork until a link
  // flies through it into the sky (js/zoom-nav.js).
  const STAR_CHANCE = 0.003, BIG_STAR = 0.0008; // per cell, as in the homepage sky
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // a fixed random number per cell, so the stars sit in the same places on every page
  function cellRand(c, r) {
    let h = Math.imul(c + 1, 374761393) ^ Math.imul(r + 1, 668265263) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function startStars() {
    const cvs = document.createElement("canvas");
    cvs.className = "sky-stars";
    cvs.setAttribute("aria-hidden", "true");
    document.body.prepend(cvs);
    const g = cvs.getContext("2d");
    let stars = [], unit = 1, dpr = 1;

    function layout() {
      const w = window.innerWidth, h = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      // same letter size as the homepage, which caps its grid at ~20,000 cells
      unit = Math.max(1, Math.sqrt((w * h) / (6 * 9 * 20000)));
      cvs.width = Math.round(w * dpr);
      cvs.height = Math.round(h * dpr);
      cvs.style.width = w + "px";
      cvs.style.height = h + "px";
      stars = [];
      const cols = Math.floor(w / (6 * unit)), rows = Math.floor(h / (9 * unit));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const rv = cellRand(c, r);
          if (rv < STAR_CHANCE) stars.push({ x: (c + 0.5) * 6 * unit, y: (r + 0.5) * 9 * unit, rv, big: rv < BIG_STAR });
        }
      }
      draw();
    }

    function draw() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cvs.width, cvs.height);
      const light = lightAt(clockHour());
      if (light.stars < 0.01) return;
      const col = light.colors[10]; // star colour
      const t = performance.now() / 1000;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.font = `${10 * unit}px Consolas, Menlo, "DejaVu Sans Mono", "Courier New", monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowBlur = 5 * unit * dpr;
      for (const s of stars) {
        const lum = (0.4 + 0.3 * Math.sin(0.9 * t + s.rv * 7000)) * light.stars;
        g.fillStyle = g.shadowColor = rgb([col[0] * lum, col[1] * lum, col[2] * lum]);
        g.fillText(s.big ? "+" : ".", s.x, s.y);
      }
    }

    let last = 0;
    function tick(now) {
      requestAnimationFrame(tick);
      if (document.hidden || now - last < 66) return; // ~15 fps is plenty for a slow twinkle
      last = now;
      draw();
    }

    layout();
    window.addEventListener("resize", layout);
    if (!still) requestAnimationFrame(tick);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startStars);
  else startStars();

  window.timeOfDay = { lightAt, clockHour, lerp, mix3, rgb };
})();
