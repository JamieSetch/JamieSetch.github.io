const splashScreen = document.getElementById("splash-screen");

if (splashScreen) {
  const splashDelayMs = 1000;
  const splashExitDurationMs = 900;

  window.setTimeout(() => {
    splashScreen.classList.add("splash-exit");

    window.setTimeout(() => {
      splashScreen.remove();
      document.body.classList.remove("splash-active");
    }, splashExitDurationMs);
  }, splashDelayMs);
}

