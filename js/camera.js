/*
 * A camera half-buried in the sand of the homepage artwork, drawn in the
 * artwork's own letters (through the hook in js/night-tide.js), so it takes
 * the same light, glow and time-of-day colours as everything else. Its lens
 * catches the light now and then. It's a link to the Travels page: an
 * invisible <a class="camera-link"> is kept over it, and js/zoom-nav.js flies
 * into it when clicked.
 */
(() => {
  "use strict";

  const link = document.querySelector(".camera-link");
  if (!link) return;

  // the picture, and what each cell is: b body, l lens ring, L lens glass,
  // s sand, x empty inside the camera, space = leave the scene as it is
  const ART = [
    "  _n_______  ",
    " |  .---. =| ",
    ".| ( (0) ) |,",
    ":,.~:.,.:~.,:",
  ];
  const ROLE = [
    "  bbbbbbbbb  ",
    " bxxbbbbbxbb ",
    "sbxlxlLlxlxbs",
    "sssssssssssss",
  ];
  const W = ART[0].length, H = ART.length;
  const SILVER = 6, GLINT = 7, SAND = 9; // palette entries in the artwork
  let placed = "";

  function drawCamera({ cols, rows, char, lum, tag, glyph }) {
    if (cols < W + 6 || rows < 30) {
      link.hidden = true;
      return;
    }
    // on the dry sand, right of centre, a few rows up from the bottom edge
    const c0 = Math.min(cols - W - 2, Math.floor(cols * 0.7));
    const r0 = rows - H - 3;

    // keep the link over the camera body, with a cell of slack around it, as the grid changes
    const key = `${cols}x${rows}`;
    if (key !== placed) {
      placed = key;
      link.hidden = false;
      link.style.left = (100 * (c0 - 1)) / cols + "%";
      link.style.top = (100 * (r0 - 1)) / rows + "%";
      link.style.width = (100 * (W + 2)) / cols + "%";
      link.style.height = (100 * (H + 1)) / rows + "%";
    }

    const near = link.matches(":hover") || link.matches(":focus-visible");
    const s = performance.now() / 1000;
    const flash = Math.pow(Math.max(0, Math.sin(s * 0.9)), 14); // the lens catches the light
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const role = ROLE[r][c];
        if (role === " ") continue;
        const i = (r0 + r) * cols + c0 + c;
        if (role === "x") {
          char[i] = glyph[" "];
          lum[i] = 0;
          continue;
        }
        char[i] = glyph[ART[r][c]];
        if (role === "s") {
          tag[i] = SAND;
          lum[i] = 0.6;
        } else if (role === "L") {
          tag[i] = GLINT;
          lum[i] = near ? 1 : 0.65 + 0.35 * flash;
        } else {
          tag[i] = SILVER;
          lum[i] = (role === "l" ? 0.72 : 0.62) + (near ? 0.3 : 0);
        }
      }
    }
  }

  (window.nightTideExtras = window.nightTideExtras || []).push(drawCamera);
})();
