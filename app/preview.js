/* Bridge local Continue Watching to Samsung's launcher. GPL-3.0-or-later. */
(function () {
  "use strict";
  var timer,
    lastLaunch = 0,
    lastData = "",
    pending = false;
  function log(event, data) {
    if (window.pocEvents)
      pocEvents.push({ event: event, data: data, at: Date.now() });
  }
  function publish(force) {
    clearTimeout(timer);
    if (!window.tizen || !tizen.application || !window.areenaLibrary) return;
    var data = JSON.stringify(
      areenaPreviewModel.build(areenaLibrary.continuing()),
    );
    if (data === lastData) return;
    var wait = 60000 - (Date.now() - lastLaunch);
    if (pending || (!force && wait > 0)) {
      timer = setTimeout(
        function () {
          publish(false);
        },
        Math.max(1000, wait),
      );
      return;
    }
    pending = true;
    try {
      tizen.application.launchAppControl(
        new tizen.ApplicationControl(
          "http://tizen.org/appcontrol/operation/pick",
          null,
          null,
          null,
          [new tizen.ApplicationControlData("oma-preview", [data])],
        ),
        "AreenaPoC1.Preview",
        function () {
          pending = false;
          lastLaunch = Date.now();
          lastData = data;
          log("preview-sent", {
            tiles: JSON.parse(data).sections.reduce(function (n, s) {
              return n + s.tiles.length;
            }, 0),
          });
        },
        function (e) {
          pending = false;
          lastLaunch = Date.now();
          log("preview-unavailable", { message: e.name + ": " + e.message });
        },
      );
    } catch (e) {
      pending = false;
      lastLaunch = Date.now();
      log("preview-unavailable", { message: String(e) });
    }
  }
  function deepLink() {
    try {
      var request = tizen.application
        .getCurrentApplication()
        .getRequestedAppControl();
      var id = areenaPreviewModel.action(request && request.appControl.data);
      if (id) {
        // Dismiss any foreground overlays before opening the requested episode.
        if (window.seriesPanel) seriesPanel.dismiss();
        if (window.catalogBrowser) catalogBrowser.close();
        window.openAreenaProgram(id);
        log("preview-resume", { program: id });
      }
    } catch (e) {
      log("preview-link-error", { message: String(e) });
    }
  }
  window.addEventListener("librarychange", function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      publish(false);
    }, 1200);
  });
  window.addEventListener("appcontrol", deepLink);
  window.addEventListener("load", function () {
    deepLink();
    setTimeout(function () {
      publish(false);
    }, 2500);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) publish(true);
  });
  window.addEventListener("pagehide", function () {
    publish(true);
  });
  window.areenaPreview = { publish: publish };
})();
