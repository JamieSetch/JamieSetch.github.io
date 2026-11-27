/*
 * Homepage links: clicking About or Projects flies into the artwork towards
 * the word clicked (it grows and fades as it comes past), until only the sky
 * and its stars are left, the background of the other pages. Then the page
 * opens and its text fades in. The animation itself is the "fly-in"
 * keyframes in css/style.css.
 *
 * Skipped for people who prefer less motion, and for clicks that open a new
 * tab or window.
 */
(() => {
  "use strict";

  const FLY_MS = 1200; // matches the fly-in animation
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // a previewed time (?hour=) carries over, so the sky matches on arrival
  const hour = new URLSearchParams(window.location.search).get("hour");
  const root = document.documentElement;

  for (const link of document.querySelectorAll(".home nav a")) {
    const to = new URL(link.href, window.location.href);
    if (to.pathname === window.location.pathname) continue; // Home itself
    if (hour !== null) {
      to.searchParams.set("hour", hour);
      link.href = to.href;
    }

    link.addEventListener("click", (e) => {
      if (still || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (document.body.classList.contains("zooming")) return;
      // fly towards the middle of what was clicked
      const box = link.getBoundingClientRect();
      root.style.setProperty("--fly-x", box.left + box.width / 2 + "px");
      root.style.setProperty("--fly-y", box.top + box.height / 2 + "px");
      link.classList.add("fly-target");
      document.body.classList.add("zooming");
      try {
        sessionStorage.setItem("arriving", "1"); // the next page fades its text in
      } catch {}
      setTimeout(() => window.location.assign(link.href), FLY_MS);
    });
  }

  // coming back with the Back button can restore the page mid-flight: show the artwork again
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    document.body.classList.remove("zooming");
    for (const el of document.querySelectorAll(".fly-target")) el.classList.remove("fly-target");
  });
})();
