/*
 * NIGHT TIDE — ASCII code art by JIN2 (@jin_22ee), 2026.
 *
 * A JavaScript port of night_tide.py for this site's homepage. Original source:
 *   https://github.com/JIN2-ASCII/-JIN2-ASCII/tree/main/NIGHT-TIDE
 *
 * © 2026 JIN2. All rights reserved: don't copy, repost or reuse this file.
 *
 * Differences from the original: rendered into a page <canvas> instead of a
 * pygame window, the frame is sized to its container, per-cell work is done
 * lazily for speed, and the on-screen stats/timer are left out. The light also
 * follows the visitor's local time (see "time of day"): at night the picture
 * is the original; dawn, day and dusk are new for the site.
 */
(function nightTide() {
  "use strict";
  const PERF = window.__perf;
  const mark = (name) => { const n = performance.now(); PERF.acc[name] = (PERF.acc[name] || 0) + (n - PERF.last); PERF.last = n; };

  const canvas = document.getElementById("night-tide");
  if (!canvas || !canvas.getContext) return;

  // The light comes from js/time-of-day.js. A page cached from before that
  // file existed won't have loaded it, so fetch it first.
  if (!window.timeOfDay) {
    const s = document.createElement("script");
    s.src = "/js/time-of-day.js";
    s.onload = () => window.timeOfDay && nightTide();
    document.head.appendChild(s);
    return;
  }
  const frameEl = canvas.parentElement;
  const ctx = canvas.getContext("2d");

  // ---------------------------------------------------------------- constants

  // letters, dark to bright
  const POOLS = ["1il!;:", "rtfjcvxz=+", "aeoun0{}[]<>", "08B$#&%Q"];
  const CHARS = " .,:~+*^01|/\\-_#()x" + POOLS.join("");
  const AT = {};
  for (let i = 0; i < CHARS.length; i++) AT[CHARS[i]] = i;
  const FILL = POOLS.map((p) => Array.from({ length: 12 }, (_, k) => AT[p[k % p.length]]));
  const C_SPACE = AT[" "], C_TILDE = AT["~"], C_STAR = AT["*"], C_PLUS = AT["+"];
  const C_CARET = AT["^"], C_DOT = AT["."], C_DASH = AT["-"], C_COLON = AT[":"], C_COMMA = AT[","];

  const LOOP = 20.0;
  const CW = 6, CH = 9, FONT_PX = 10; // cell width, cell height, font px

  const SILVER = 6, GLINT = 7, FOAM = 8, SAND = 9, STAR = 10;

  // ------------------------------------------------------------ time of day
  //
  // Added for this site, not in the original piece: the light follows the
  // visitor's local clock. The palettes and times live in js/time-of-day.js,
  // which every page loads first (the other pages use its sky as their
  // background). Night is the original exactly.
  const { lightAt, clockHour, lerp, mix3, rgb } = window.timeOfDay;

  let light = lightAt(clockHour());

  const HORIZON = -0.28; // screen y of the horizon
  const EYE = 0.3; // camera height

  // (amplitude, wavelength, direction)
  const SWELLS = [[0.045, 1.70, -0.05], [0.032, 1.10, 0.30], [0.030, 0.65, 0.10], [0.020, 0.43, -0.45], [0.014, 0.28, 0.60],
    [0.009, 0.18, -0.20], [0.007, 0.115, 1.00], [0.005, 0.075, -0.85], [0.0028, 0.048, 0.45], [0.0018, 0.032, -0.70]];
  // angular speed of each swell, snapped so the 20 s loop is seamless (precomputed from the original)
  const OMEGA = [0.628318530718, 0.942477796077, 1.256637061436, 1.570796326795, 1.884955592154,
    2.199114857513, 2.827433388231, 3.455751918949, 4.398229715026, 5.340707511103];
  const NS = SWELLS.length;
  const SW_AMP = SWELLS.map((s) => s[0]);
  const SW_K = SWELLS.map((s) => (2 * Math.PI) / s[1]);
  const SW_DX = SWELLS.map((s) => Math.sin(s[2]));
  const SW_DZ = SWELLS.map((s) => -Math.cos(s[2]));
  const SW_PH0 = SWELLS.map((s) => 3.7 * s[1]);

  // breakers
  const SHORE = 0.470222;
  const Z_FAR = 2.400222, Z_BREAK = 0.78;
  const T_SWELL = 4.000222, T_BORE = 2.0, T_SWASH = 3.0;
  const PERIOD = 2.5;
  const RISE = 0.09;
  // [size, angle, bend, late, break-depth jitter] for the 8 repeating breakers
  // (numpy default_rng(100 + n % 8) draws from the original, precomputed)
  const WAVES = [
    [1.042738059826, 0.173797248542, -0.506728219941, -0.457048429306, 0.047365439511],
    [1.113296128647, -0.253042139985, 0.683532988728, 0.091278185229, -0.02056714388],
    [0.603994244253, 0.154698326712, 0.777208265239, -0.20273976324, 0.018489952155],
    [0.70324410127, -0.496227199273, -0.763176652574, 0.360178645593, 0.035754248838],
    [1.04506712804, 0.345866667529, -0.681386812256, -0.374588102059, -0.012493071084],
    [0.914826966841, 0.884627595866, -0.967849306928, 0.00670434177, -0.010356104852],
    [1.138565106051, -0.827279724791, -0.905311944406, -0.035734536873, 0.04644422946],
    [0.92154834761, -0.040160575221, 0.006569716606, 0.234783885369, -0.000882672063],
  ];

  // ------------------------------------------------------------------ helpers

  const clip01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const smooth = (x) => {
    x = x < 0 ? 0 : x > 1 ? 1 : x;
    return x * x * (3 - 2 * x);
  };
  const mod12 = (x) => ((x % 12) + 12) % 12;
  const gauss = (q) => (q * q < 40 ? Math.exp(-q * q) : 0);

  function noise(x, y, s) {
    return (Math.sin(7.1 * x + 3.3 * Math.sin(5.3 * y + s) + s) + Math.sin(11.3 * y - 4.7 * x + 2 * s)
      + 0.6 * Math.sin(17 * x + 13 * y - s)) / 2.6;
  }

  // torn foam, more holes with age
  function lace(xw, z, seed, age) {
    const warp = noise(4 * xw, 15 * z, seed + 7);
    const n = noise(9 * xw + 1.5 * warp, 60 * z + 3 * warp, seed) + 0.5 * noise(23 * xw, 140 * z + warp, seed + 1);
    return smooth((n / 1.5 + 0.55 - 0.7 * age) / 0.3);
  }

  // small seeded PRNG for the per-cell random fields
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --------------------------------------------------------------- grid state

  // Keep the grid near the original window's size (1080x960 px, ~19k cells) so
  // big screens stay smooth: past that, the letters grow instead of multiplying.
  const MAX_CELLS = 20000;

  let cols = 0, rows = 0, scale = 1;
  let Xc, Yr, zR, belowR, dimR, farR, keepR, rnd, hsh;
  let charA, lumA, tagA;
  let atlas = [], gw = 0, gh = 0;
  let img, px32;
  let art, actx; // the letters alone, on black
  // sand showing through, per cell (daytime lighting only): how much, and how dry
  let groundA, groundD, groundS, groundW, ground, gctx, groundImg; // S: how wet and shiny, W: under water
  let glow4, glow8, g4ctx, g8ctx;
  const canFilter = "filter" in ctx;

  function setup() {
    const cssW = frameEl.clientWidth, cssH = frameEl.clientHeight;
    const unit = Math.max(1, Math.sqrt((cssW * cssH) / (CW * CH * MAX_CELLS)));
    const nc = Math.max(8, Math.floor(cssW / (CW * unit))), nr = Math.max(8, Math.floor(cssH / (CH * unit)));
    const ns = PERF.scale1 ? 1 : Math.min(2, Math.max(1, Math.round((window.devicePixelRatio || 1) * unit)));
    // the whole-cell canvas is stretched over the frame (less than a cell's difference)
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    if (nc === cols && nr === rows && ns === scale && !PERF.forceSetup) return false;
    PERF.forceSetup = false;
    cols = nc; rows = nr; scale = ns;

    const aspect = (cols * CW) / (rows * CH);
    const cw = aspect / cols, rowH = 1 / rows;
    Xc = new Float64Array(cols);
    for (let c = 0; c < cols; c++) Xc[c] = ((c + 0.5) / cols - 0.5) * aspect;
    Yr = new Float64Array(rows); zR = new Float64Array(rows); belowR = new Uint8Array(rows);
    dimR = new Float64Array(rows); farR = new Float64Array(rows); keepR = new Float64Array(rows * NS);
    for (let r = 0; r < rows; r++) {
      const Y = (r + 0.5) / rows - 0.5;
      const z = EYE / Math.max(Y - HORIZON, 1e-3);
      Yr[r] = Y; zR[r] = z;
      belowR[r] = Y > HORIZON + 0.5 * rowH ? 1 : 0;
      dimR[r] = 0.45 + 0.55 * smooth((Y - HORIZON) / 0.2);
      farR[r] = 1 - smooth((Y - HORIZON) / 0.25);
      // sub-cell waves are filtered out
      for (let s = 0; s < NS; s++) {
        const foot = SW_K[s] * Math.hypot(SW_DX[s] * cw * z, SW_DZ[s] * rowH * z * z / EYE);
        keepR[r * NS + s] = Math.exp(-((foot / 1.4) ** 2));
      }
    }
    const rand = mulberry32(9);
    rnd = new Float64Array(cols * rows);
    hsh = new Uint8Array(cols * rows);
    for (let i = 0; i < rnd.length; i++) rnd[i] = rand();
    for (let i = 0; i < hsh.length; i++) hsh[i] = Math.floor(rand() * 12);
    charA = new Uint8Array(cols * rows); lumA = new Float64Array(cols * rows); tagA = new Uint8Array(cols * rows);
    groundA = new Float32Array(cols * rows); groundD = new Float32Array(cols * rows);
    groundS = new Float32Array(cols * rows); groundW = new Uint8Array(cols * rows);

    // canvas at whole-cell size, sharp on retina screens
    canvas.width = cols * CW * scale;
    canvas.height = rows * CH * scale;
    img = ctx.createImageData(canvas.width, canvas.height);
    px32 = new Uint32Array(img.data.buffer);
    px32.fill(0xff000000);
    art = document.createElement("canvas");
    art.width = canvas.width; art.height = canvas.height;
    actx = art.getContext("2d");
    // one pixel per cell, stretched smoothly over the frame so the sand blends
    ground = document.createElement("canvas");
    ground.width = cols; ground.height = rows;
    gctx = ground.getContext("2d");
    groundImg = gctx.createImageData(cols, rows);

    buildAtlas();

    // glow layers at 1/4 and 1/8 of the unscaled frame, as in the original
    glow4 = document.createElement("canvas");
    glow4.width = Math.max(1, Math.round((cols * CW) / 4)); glow4.height = Math.max(1, Math.round((rows * CH) / 4));
    glow8 = document.createElement("canvas");
    glow8.width = Math.max(1, Math.round((cols * CW) / 8)); glow8.height = Math.max(1, Math.round((rows * CH) / 8));
    g4ctx = glow4.getContext("2d"); g8ctx = glow8.getContext("2d");
    return true;
  }

  function buildAtlas() {
    gw = CW * scale; gh = CH * scale;
    const c = document.createElement("canvas");
    c.width = gw; c.height = gh;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.font = `${FONT_PX * scale}px Consolas, Menlo, "DejaVu Sans Mono", "Courier New", monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    atlas = [];
    for (const ch of CHARS) {
      g.fillStyle = "#000"; g.fillRect(0, 0, gw, gh);
      g.fillStyle = "#fff"; g.fillText(ch, gw / 2, gh / 2 + 0.5 * scale);
      const d = g.getImageData(0, 0, gw, gh).data;
      const m = new Uint8Array(gw * gh);
      for (let p = 0; p < m.length; p++) m[p] = d[p * 4];
      atlas.push(m);
    }
  }

  // -------------------------------------------------------------- the scene

  function frame(t) {
    // breakers in play this frame
    const waves = [];
    for (let n = Math.floor((t - 12) / PERIOD); n <= Math.floor(t / PERIOD); n++) {
      const m = ((n % 8) + 8) % 8;
      const [size, angle, bend, late, jit] = WAVES[m];
      const zb = Z_BREAK + (1.15 - Z_BREAK) * (1.15 - size) / 0.65 + jit;
      const rise = RISE * size;
      const ts = T_SWELL * (Z_FAR - zb) / (Z_FAR - Z_BREAK);
      const tb = T_BORE * (zb - SHORE) / Math.pow(Z_BREAK - SHORE, 0.6);
      const seed = m * 2.39;
      const base = t - n * PERIOD - late;
      const peel = new Float64Array(cols), brk = new Float64Array(cols);
      for (let c = 0; c < cols; c++) {
        const X = Xc[c];
        peel[c] = angle * X + bend * X * X + 0.15 * Math.sin(2.0 * X + seed) + 0.06 * Math.sin(5.3 * X - seed);
        const b = (0.35 + 0.65 * size) * smooth((noise(1.7 * X + seed, seed, m) + 0.45 * size + 0.2) / 0.9);
        brk[c] = Math.max(b, 0.35);
      }
      waves.push({ n, size, zb, rise, ts, tb, seed, base, peel, brk, peak: rise / zb });
    }
    const nw = waves.length;
    const rowH = 1 / rows;

    for (let r = 0; r < rows; r++) {
      const Y = Yr[r];
      const off = r * cols;

      if (!belowR[r]) {
        // sky: stars only (they fade out by day)
        for (let c = 0; c < cols; c++) {
          const i = off + c, rv = rnd[i];
          if (rv < 0.003 && Y < HORIZON - 0.04 && light.stars > 0.01) {
            charA[i] = rv < 0.0008 ? C_PLUS : C_DOT;
            lumA[i] = (0.4 + 0.3 * Math.sin(0.9 * t + rv * 7000)) * light.stars;
            tagA[i] = STAR;
          } else {
            charA[i] = C_SPACE; lumA[i] = 0; tagA[i] = 0;
          }
          groundA[i] = 0;
        }
        continue;
      }

      const z = zR[r];
      const water = z >= SHORE, beach = !water;
      const dim = dimR[r], far = farR[r];
      const kOff = r * NS;

      for (let c = 0; c < cols; c++) {
        const i = off + c;
        const X = Xc[c], xw = X * z, rv = rnd[i];

        // Gerstner swells, slopes only
        let sx = 0, sz = 0, hgt = 0;
        for (let s = 0; s < NS; s++) {
          const keep = keepR[kOff + s];
          if (keep < 1e-5) continue;
          const ph = SW_K[s] * (SW_DX[s] * xw + SW_DZ[s] * z) - OMEGA[s] * t + SW_PH0[s];
          const sn = Math.sin(ph), cs = Math.cos(ph);
          const steep = SW_AMP[s] * SW_K[s] * keep;
          const f = steep * cs / (1 - 0.5 * steep * sn);
          sx += f * SW_DX[s];
          sz += f * SW_DZ[s];
          hgt += SW_AMP[s] * sn * keep;
        }

        // breakers
        let foam = 0, face = 0, lip = 0, spray = false, film = 0, wet = 0;
        for (let k = 0; k < nw; k++) {
          const W = waves[k];
          const a = W.base + W.peel[c];
          if (a < 0) continue;
          const { ts, tb, zb, seed } = W;
          const since = a - ts;

          // wave front distance: swell, bore, swash
          let front, reach = 0;
          if (a < ts) {
            front = Z_FAR - (Z_FAR - zb) * a / ts;
          } else if (a < ts + tb) {
            const q = 1 - (a - ts) / tb;
            front = zb - (zb - SHORE) * (1 - q * q);
          } else {
            reach = 0.09 + 0.025 * Math.sin(2.3 * xw + seed);
            const u = Math.min((a - ts - tb) / T_SWASH, 1);
            front = SHORE - reach * 4 * u * (1 - u);
          }
          const yf = HORIZON + EYE / front;
          const g0 = a / ts;
          const g = a > 0 ? (g0 >= 1 ? 1 : g0 * g0) : 0;

          // swell bump: steep front, long back
          const tall = W.rise * g * (1 - smooth(since / 0.5));
          if (tall > 0 && water) {
            const d = z - front;
            const wd = d < 0 ? 0.05 : 0.16;
            const bump = tall * gauss(d / wd);
            sz += bump * (-2 * d / (wd * wd));
            hgt += bump;
          }

          // wave face and lip
          if (since < 0.5) {
            const hs = tall / front;
            if (Y < yf && Y > yf - hs) face = Math.max(face, 0.25 + 0.5 * (yf - Y) / Math.max(hs, 1e-4));
            if (g > 0) lip = Math.max(lip, gauss((Y - (yf - hs)) / (0.8 * rowH)) * g);
          }

          if (since > 0) {
            let wf = 0;

            // break, spray and white water roller
            if (since < Math.max(1.4, tb) && Y < yf) {
              const burst = Math.sin(Math.PI * Math.min(since / 1.3, 1));
              const lumps = 0.55 + 0.45 * Math.abs(Math.sin(31 * X + 2.1 * noise(5 * X, 0.4 * t, W.n) + 1.5 * t));
              const zf = zb / front;
              const peak = W.peak;
              const hc = peak * (0.2 + 0.4 * burst) * lumps * zf;
              let boil = NaN;
              if (since < 1.4 && Y > yf - hc) {
                boil = noise(19 * X + 0.4 * t, 23 * Y - 1.2 * t, W.n) + 0.5 * noise(41 * X, 47 * Y + 2 * t, W.n + 2);
                const depth = clip01((Y - (yf - hc)) / Math.max(hc, 1e-4));
                wf = Math.max(wf, (1.0 - 0.35 * depth) * smooth((boil + 1.2 - 0.5 * depth) / 0.4));
              }
              if (since > 0.1 && since < 1.3 && Y < yf - hc && Y > yf - peak * 1.8 * burst * zf
                && W.brk[c] > 0.5 && rv > 0.75 + 0.25 * (yf - Y) / (peak * 1.8 * zf + 1e-3)) {
                spray = true;
              }
              if (since > 0.8 && since < tb) {
                const hr = 0.5 * peak * (1 - 0.75 * smooth(since / tb)) * lumps * zf;
                if (Y > yf - hr) {
                  if (Number.isNaN(boil)) {
                    boil = noise(19 * X + 0.4 * t, 23 * Y - 1.2 * t, W.n) + 0.5 * noise(41 * X, 47 * Y + 2 * t, W.n + 2);
                  }
                  const rd = clip01((Y - (yf - hr)) / Math.max(hr, 1e-4));
                  wf = Math.max(wf, (0.95 - 0.4 * rd) * smooth((boil + 0.8 - 0.5 * rd) / 0.4));
                }
              }
            }

            // trailing foam
            if (water) {
              const roll = since;
              const behind = z - front;
              const band = 0.04 + 0.15 * smooth(roll / 1.5);
              if (since > 0.3 && since < tb + 0.3 && behind > -0.005 && behind < band) {
                const fade = Math.pow(1 - clip01(behind / band), 1.6);
                const edge = gauss(behind / 0.012);
                wf = Math.max(wf, (0.35 + 0.65 * fade) * lace(xw, z, seed, roll / 3.5) + 0.9 * edge);
              }
              if (since > 0.5 && behind > band && z < zb + 0.3) {
                const clump = smooth((noise(3 * xw + seed, 12 * z, seed + 5) - 0.1) / 0.3);
                if (clump > 0) wf = Math.max(wf, 0.6 * Math.exp(-roll / 2.2) * clump * lace(xw, z, seed + 3, 0.1));
              }
            }

            // foam joins up sideways as it comes in
            if (wf > 0) {
              const join = smooth((since - 0.1) / (0.35 * tb));
              foam = Math.max(foam, wf * Math.max(W.brk[c], join * (0.85 + 0.15 * W.size)));
            }
          }

          // swash on the sand
          if (beach && since > tb) {
            const u = Math.min((since - tb) / T_SWASH, 1);
            const sw = u < 1;
            const scallop = 0.008 * Math.sin(31 * xw + seed) + 0.004 * Math.sin(73 * xw - 2 * seed);
            const rim = sw ? gauss((z - front - scallop) / 0.008) : 0;
            const left = u > 0.5
              ? gauss((z - SHORE + reach - scallop) / 0.007) * Math.exp(-Math.max(since - tb - 0.5 * T_SWASH, 0) / 1.6)
              : 0;
            const amt = rim * (1 - 0.4 * u) + 0.6 * left;
            if (amt > 1e-4) foam = Math.max(foam, amt * lace(xw, z * 2, seed + 1, 0.5 * u + 0.15));
            if (sw && z > front) film = 1;
            if (z > SHORE - reach) wet = Math.max(wet, Math.exp(-Math.max(since - tb - T_SWASH, 0) / 2.5));
          }
        }

        // shading: sky reflection with fresnel
        let nx = -sx, ny = 1, nz = -sz;
        const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= nl; ny *= nl; nz *= nl;
        let vx = xw, vy = -EYE, vz = z;
        const vl = 1 / Math.sqrt(vx * vx + vy * vy + vz * vz);
        vx *= vl; vy *= vl; vz *= vl;
        const vn = vx * nx + vy * ny + vz * nz;
        const ry = vy - 2 * vn * ny;
        const facing = clip01(-vn);
        const fresnel = 0.03 + 0.97 * Math.pow(1 - facing, 5);
        const sky = 0.35 + 0.65 * (1 - clip01(ry)) ** 2;
        let glow = 0.06 + fresnel * sky * 0.75 * dim + 0.08 * smooth(hgt / 0.06 + 0.5);
        glow = glow * (1 - 0.55 * far) + far * 0.42 * smooth((-sz + 0.01) / 0.05);
        const shimmer = 0.07 * Math.sin(rv * 977 + t * (2.5 + 4 * rv));
        let lum = Math.min(Math.max(glow * 1.2 * light.gain + shimmer, 0), 1);
        if (face > 0) lum = 0.12 + 0.3 * face;
        lum *= 1 - 0.75 * smooth(foam / 0.35);

        // whitecaps far out
        let cap = false;
        if (water && z > Z_BREAK + 0.3 && foam < 0.1 && rv < 0.8) {
          const s1 = smooth((hgt / 0.05 - 0.5) / 0.3);
          if (s1 > 0.4) {
            const churn = noise(2.2 * xw + 0.35 * t, 7 * z - 0.9 * t, 4) + 0.5 * Math.sin(1.7 * t + 9 * noise(xw, 3 * z, 8));
            cap = s1 * smooth((churn - 0.35) / 0.3) > 0.4;
          }
        }

        // light becomes letters
        lum *= smooth((lum - 0.06) / 0.22);
        const show = (water || face > 0) && lum > 0.03;
        const hs = hsh[i];
        let ch = C_SPACE;
        if (show) {
          ch = FILL[Math.min(3, Math.trunc(lum * 3.6))][mod12(hs + Math.trunc(0.6 * t + 3 * hgt / 0.05))];
          if (lum > 0.8 && rv < 0.4) ch = C_TILDE;
        }
        let tag = Math.min(5, Math.trunc(lum * 6));
        if (!show) lum = 0;

        // glitter on lit crests
        if (water && lum > 0.2 && foam < 0.3) {
          const twinkle = Math.sin(rv * 431 + t * (3 + 7 * rv) + 40 * hgt);
          const spec = smooth((lum - 0.2) / 0.25) * smooth((twinkle - light.glitter) / 0.15);
          if (spec > 0.2) {
            ch = spec > 0.7 ? (rv < 0.5 ? C_STAR : C_PLUS) : (rv < 0.5 ? C_CARET : C_DOT);
            lum = Math.min(0.5 + 0.7 * spec, 1.15);
            tag = spec > 0.55 ? GLINT : SILVER;
          }
        }

        if (cap) {
          ch = FILL[1 + Math.trunc(rv * 2)][mod12(hs + Math.trunc(3 * t))];
          lum = 0.45 + 0.4 * dim;
          tag = FOAM;
        }

        if (lip > 0.4 && foam < 0.3) {
          ch = C_TILDE;
          lum = 0.4 + 0.45 * lip;
          tag = 4;
        }

        const fo = foam > 0.4 + 0.2 * rv;
        if (fo) {
          const fl = Math.min(3, Math.max(1, Math.trunc(3.2 * foam - 0.2)));
          ch = FILL[fl][mod12(hs + Math.trunc(2 * t))];
          lum = Math.min(0.6 + 0.55 * foam, 1.15);
          tag = FOAM;
        } else if (spray) {
          ch = rv > 0.8 ? C_STAR : C_DOT;
          lum = 0.8;
          tag = FOAM;
        }

        // sand
        if (beach && !fo) {
          if (film > 0.5 && rv < 0.4) {
            ch = C_DASH; lum = 0.32; tag = 2;
          } else if (rv < 0.08 + 0.15 * wet) {
            ch = rv < 0.03 ? C_COLON : C_COMMA; lum = 0.2 + 0.2 * wet; tag = SAND;
          }
          // glints only while a wave is running over the sand, i.e. there is water on it
          // (added for dawn, day and dusk; sandGlint is 0 at night)
          // light.sandGlint is the share of that wet sand glinting at any moment
          if (light.sandGlint > 0.001 && film > 0.5) {
            const edge = Math.cos(Math.PI * light.sandGlint); // sin(...) > edge for that share of the time
            const tw = Math.sin(rv * 431 + t * (3 + 7 * rv));
            const spec = tw > edge ? smooth((tw - edge) / (1 - edge)) : 0;
            if (spec > 0.3) {
              ch = spec > 0.6 && rv < 0.5 ? C_STAR : C_DOT;
              lum = 0.45 + 0.5 * spec;
              tag = spec > 0.6 ? GLINT : SILVER;
            }
          }
        }

        charA[i] = ch; lumA[i] = lum; tagA[i] = tag;

        // sand under the letters (added for the daytime lighting; not drawn at night).
        // In the shallows it shows through as small, uneven sandbars close to the shore,
        // and disappears under white water and passing crests. On the beach it is dark
        // where the waves have just been (or the swash is running over it) and dries out
        // in an uneven line further up.
        // Both sides meet at about half strength at the waterline, so there is no edge.
        let gA = 0, gD = 0, gS = 0;
        if (beach) {
          const firm = smooth((SHORE - z) / 0.06 + 0.5 * noise(12 * xw, 28 * z, 6));
          gA = (0.5 + 0.5 * firm) * (1 - 0.35 * film);
          const dry = smooth((SHORE - z) / 0.1 + 0.45 * noise(12 * xw, 28 * z, 6));
          gD = dry * (1 - 0.8 * Math.max(wet, film));
          gS = Math.max(wet, film, 1 - dry);
        } else if (z < SHORE + 0.14) {
          const d = (z - SHORE) / 0.13 + 0.45 * noise(10 * xw, 24 * z, 3);
          const shallow = 1 - clip01(d);
          if (shallow > 0) {
            const underFoam = smooth(foam / 0.4);
            const underCrest = clip01(Math.max(hgt, 0) / 0.03);
            gA = 0.5 * shallow * Math.sqrt(shallow) * (1 - 0.6 * underFoam) * (1 - 0.7 * underCrest);
            gS = 1;
          }
        }
        groundA[i] = gA; groundD[i] = gD; groundS[i] = gS; groundW[i] = beach ? 0 : 1;
      }
    }
  }

  // ---------------------------------------------------------------- drawing

  // glyph mask x colour x brightness, over a fading copy of the previous frame
  function draw(t) {
    if (PERF.forceSetup) setup();
    PERF.last = performance.now();
    PERF.drawStart = PERF.last;
    light = lightAt(clockHour());
    frame(t);
    mark("scene");
    const palette = light.colors;

    // fade the trail to half
    for (let p = 0; p < px32.length; p++) px32[p] = ((px32[p] >>> 1) & 0x007f7f7f) | 0xff000000;
    mark("fade");

    const rowStride = canvas.width;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const ch = charA[i];
        if (ch === C_SPACE) continue;
        const l = lumA[i] < 0 ? 0 : lumA[i] > 1 ? 1 : lumA[i];
        if (l <= 0) continue;
        const col = palette[tagA[i]] || palette[0];
        const cr = col[0] * l, cg = col[1] * l, cb = col[2] * l;
        const mask = atlas[ch];
        const x0 = c * gw, y0 = r * gh;
        for (let gy = 0; gy < gh; gy++) {
          let p = (y0 + gy) * rowStride + x0;
          const mo = gy * gw;
          for (let gx = 0; gx < gw; gx++, p++) {
            const mv = mask[mo + gx];
            if (mv === 0) continue;
            const m = mv / 255;
            const nr = (cr * m) | 0, ng = (cg * m) | 0, nb = (cb * m) | 0;
            const v = px32[p];
            const or = v & 255, og = (v >>> 8) & 255, ob = (v >>> 16) & 255;
            px32[p] = (0xff000000 | ((nb > ob ? nb : ob) << 16) | ((ng > og ? ng : og) << 8) | (nr > or ? nr : or)) >>> 0;
          }
        }
      }
    }
    mark("glyphs");
    actx.putImageData(img, 0, 0);
    mark("putImageData");

    ctx.save();
    // sky and sea behind the letters (pure black at night, as in the original)
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const h = 0.5 + HORIZON; // horizon, as a fraction of the height
    sky.addColorStop(0, rgb(light.top));
    sky.addColorStop(h - 0.005, rgb(light.horizon));
    sky.addColorStop(h + 0.015, rgb(mix3(light.horizon, light.sea, 0.6)));
    sky.addColorStop(1, rgb(light.sea));
    ctx.globalCompositeOperation = "copy";
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    mark("sky");

    // then the sand, blended in cell by cell (skipped at night, when it would be black)
    const sw = light.wetSand, sd = light.sand;
    const shine = light.colors[5], sheen = light.sheen; // the sea's brightest tone
    const sh = light.shallow, shMix = light.shallowMix;
    if (sd[0] + sd[1] + sd[2] > 1 && !PERF.noGround) {
      const gd = groundImg.data;
      for (let i = 0, p = 0; i < groundA.length; i++, p += 4) {
        const a = groundA[i];
        if (a <= 0) { gd[p + 3] = 0; continue; }
        const u = groundD[i];
        const k = sheen * groundS[i];
        const w = groundW[i] ? shMix : 0;
        gd[p] = lerp(lerp(sw[0] + (sd[0] - sw[0]) * u, shine[0], k), sh[0], w);
        gd[p + 1] = lerp(lerp(sw[1] + (sd[1] - sw[1]) * u, shine[1], k), sh[1], w);
        gd[p + 2] = lerp(lerp(sw[2] + (sd[2] - sw[2]) * u, shine[2], k), sh[2], w);
        gd[p + 3] = a * 255;
      }
      gctx.putImageData(groundImg, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = PERF.lowQuality ? "low" : "high";
      ctx.drawImage(ground, 0, 0, canvas.width, canvas.height);
    }

    mark("ground");
    // the letters are light, so they add onto it
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(art, 0, 0);
    mark("lettersDraw");
    if (!PERF.noGlow) {

    // soft glow on top: two blurred copies of the letters, both taken
    // before either is added (blur sizes match pygame's gaussian_blur)
    shrinkBlur(g4ctx, glow4, 1);
    shrinkBlur(g8ctx, glow8, 2);
    mark("blur");
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.75;
    ctx.drawImage(glow4, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(glow8, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
    mark("glowDraw");
    if (PERF.flush) { ctx.getImageData(0, 0, 1, 1); mark("gpuFlush"); }
    (PERF.times || (PERF.times = [])).push(performance.now());
    (PERF.drawDur || (PERF.drawDur = [])).push(performance.now() - PERF.drawStart);
    PERF.draws++; PERF.size = [canvas.width, canvas.height, cols, rows, scale];
  }

  // candidate fix: build the glow from the letter pixels in JavaScript
  // (box-average shrink, then a gaussian blur), with no canvas filter
  const glowBufs = new Map();
  function jsGlow(gctx, gcan, sigma) {
    const W = gcan.width, H = gcan.height, AW = canvas.width, AH = canvas.height;
    let b = glowBufs.get(gcan);
    if (!b || b.W !== W || b.H !== H || b.AW !== AW || b.AH !== AH || b.scale !== scale) {
      const colMap = new Int32Array(AW), cnt = new Float32Array(W * H);
      for (let x = 0; x < AW; x++) colMap[x] = Math.min(W - 1, Math.floor((x * W) / AW));
      for (let y = 0; y < AH; y += scale) {
        const row = Math.min(H - 1, Math.floor((y * H) / AH)) * W;
        for (let x = 0; x < AW; x += scale) cnt[row + colMap[x]]++;
      }
      const rad = Math.ceil(3 * sigma), ker = new Float32Array(2 * rad + 1);
      for (let k = -rad; k <= rad; k++) ker[k + rad] = Math.exp(-(k * k) / (2 * sigma * sigma));
      const ks = ker.reduce((a, v) => a + v, 0);
      for (let k = 0; k < ker.length; k++) ker[k] /= ks;
      b = { W, H, AW, AH, scale, colMap, cnt, rad, ker, img: gctx.createImageData(W, H),
        ch: [new Float32Array(W * H), new Float32Array(W * H), new Float32Array(W * H)], tmp: new Float32Array(W * H) };
      glowBufs.set(gcan, b);
    }
    const [R, G, B] = b.ch, { colMap, cnt, rad, ker, tmp } = b;
    R.fill(0); G.fill(0); B.fill(0);
    for (let y = 0; y < AH; y += scale) {
      const row = Math.min(H - 1, Math.floor((y * H) / AH)) * W, base = y * AW;
      for (let x = 0; x < AW; x += scale) {
        const v = px32[base + x];
        if ((v & 0xffffff) === 0) continue;
        const k = row + colMap[x];
        R[k] += v & 255; G[k] += (v >>> 8) & 255; B[k] += (v >>> 16) & 255;
      }
    }
    for (const C of b.ch) {
      for (let i = 0; i < C.length; i++) C[i] /= cnt[i];
      // separable gaussian; outside the frame counts as black, like the canvas blur
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let a = 0;
        for (let k = -rad; k <= rad; k++) { const xx = x + k; if (xx >= 0 && xx < W) a += C[y * W + xx] * ker[k + rad]; }
        tmp[y * W + x] = a;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let a = 0;
        for (let k = -rad; k <= rad; k++) { const yy = y + k; if (yy >= 0 && yy < H) a += tmp[yy * W + x] * ker[k + rad]; }
        C[y * W + x] = a;
      }
    }
    const d = b.img.data;
    for (let i = 0, p = 0; i < W * H; i++, p += 4) { d[p] = R[i]; d[p + 1] = G[i]; d[p + 2] = B[i]; d[p + 3] = 255; }
    gctx.globalCompositeOperation = "copy";
    gctx.filter = "none";
    gctx.putImageData(b.img, 0, 0);
  }

  PERF.compareGlow = () => {
    const out = {};
    for (const [name, g, c, sg] of [["glow4", g4ctx, glow4, 1], ["glow8", g8ctx, glow8, 2]]) {
      const was = PERF.jsGlow;
      PERF.jsGlow = false; shrinkBlur(g, c, sg);
      const a = g.getImageData(0, 0, c.width, c.height).data.slice();
      PERF.jsGlow = true; shrinkBlur(g, c, sg);
      const b = g.getImageData(0, 0, c.width, c.height).data;
      PERF.jsGlow = was;
      let sa = 0, sb = 0, diff = 0, n = 0, big = 0;
      for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) {
        sa += a[i + k]; sb += b[i + k]; const d = Math.abs(a[i + k] - b[i + k]); diff += d; n++; if (d > 16) big++;
      }
      out[name] = { size: [c.width, c.height], meanCanvasBlur: +(sa / n).toFixed(2), meanJsGlow: +(sb / n).toFixed(2),
        meanAbsDiff: +(diff / n).toFixed(2), pctOver16: +((100 * big) / n).toFixed(2) };
    }
    return out;
  };

  function shrinkBlur(gctx, gcan, sigma) {
    if (PERF.jsGlow) return jsGlow(gctx, gcan, sigma);
    gctx.globalCompositeOperation = "copy";
    gctx.filter = "none";
    gctx.imageSmoothingEnabled = true;
    gctx.drawImage(art, 0, 0, gcan.width, gcan.height);
    if (canFilter && !PERF.noFilter) {
      gctx.filter = `blur(${sigma}px)`;
      gctx.drawImage(gcan, 0, 0);
      gctx.filter = "none";
    }
  }

  // ------------------------------------------------------------------- loop

  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t = 0, last = 0, raf = 0, visible = true;

  function stillFrame() {
    // a single moment with waves breaking, for people who prefer less motion
    for (let k = 0; k < 6; k++) draw(6.0 + k / 30);
  }

  function tick(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    raf = requestAnimationFrame(tick);
    (PERF.rafTimes || (PERF.rafTimes = [])).push(now);
    if (!last) { last = now; return; }
    const dt = (now - last) / 1000;
    if (dt < 1 / 30 - 0.004) return; // 30 fps, like the original
    last = now;
    t += Math.min(dt, 1 / 15);
    if (t > LOOP) t -= LOOP;
    draw(t);
  }

  function start() {
    if (still || raf) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }

  function relayout() {
    if (setup()) {
      if (still) stillFrame();
      else draw(t);
    }
  }

  setup();
  if (still) stillFrame();
  else { draw(t); start(); }

  if ("ResizeObserver" in window) {
    let pending = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(relayout);
    }).observe(frameEl);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) start();
    }).observe(frameEl);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) start();
  });
})();
