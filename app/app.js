/* Native Samsung playback and app orchestration. GPL-3.0-or-later. */
(function () {
  "use strict";
  var mode = "home",
    current = null,
    av = null,
    clock = 0,
    serial = 0,
    hideTimer = null,
    subtitleTimer = null,
    subs = true,
    lastSave = 0,
    seeking = false,
    pendingSeek = null,
    introStart = null;
  var queue = [],
    previous = null,
    next = null,
    action = -1;
  var actionIds = [
    "skip-intro",
    "previous-episode",
    "next-episode",
    "player-subtitles",
    "player-details",
    "learn-intro",
    "clear-intro",
  ];
  function el(id) {
    return document.getElementById(id);
  }
  function text(id, value) {
    el(id).textContent = value || "";
  }
  function event(name, data) {
    window
      .areenaRequest("/api/event", "POST", {
        event: name,
        data: data || {},
        at: Date.now(),
      })
      .catch(function () {});
  }
  function fmt(ms) {
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 3600)
      ? Math.floor(s / 3600) +
          ":" +
          ("0" + (Math.floor(s / 60) % 60)).slice(-2) +
          ":" +
          ("0" + (s % 60)).slice(-2)
      : Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }
  function notice(message) {
    text("notice", message);
    el("notice").classList.remove("hidden");
    setTimeout(function () {
      el("notice").classList.add("hidden");
    }, 7000);
  }
  window.omaNotice = notice;
  function save(force) {
    if (!current || (seeking && (force !== true || pendingSeek === null)))
      return;
    if (av)
      try {
        if (av.getState() === "PLAYING" || av.getState() === "PAUSED")
          clock = av.getCurrentTime();
      } catch (e) {}
    // Back can arrive after the native clock moved but before the seek callback.
    // Do not replace a saved resume point with the initial pre-seek clock.
    if (seeking && clock < pendingSeek - 1000) return;
    if (clock > 0) {
      window.areenaLibrary.update(current, clock);
      lastSave = Date.now();
    }
  }
  function stop(savePosition) {
    ++serial;
    if (savePosition !== false) save(true);
    clearTimeout(hideTimer);
    clearTimeout(subtitleTimer);
    if (av)
      try {
        av.stop();
        av.close();
      } catch (e) {}
    text("subtitle", "");
    el("hud").classList.add("hidden");
    el("player-actions").classList.add("hidden");
    el("intro-prompt").classList.add("hidden");
    introStart = null;
    document.body.classList.remove("playing");
    el("home").classList.remove("hidden");
    mode = "home";
    action = -1;
    clock = 0;
    seeking = false;
    pendingSeek = null;
    window.homeScreen.show();
  }
  function returnToOrigin() {
    if (window.seriesPanel && window.seriesPanel.restore(current)) return;
    if (window.catalogBrowser && window.catalogBrowser.restore()) return;
    window.homeScreen.show();
  }
  function fail(error) {
    event("error", { message: String(error), program: current && current.id });
    stop();
    returnToOrigin();
    notice("Toisto ei onnistunut: " + (error.message || error));
  }
  function actions() {
    return actionIds.filter(function (id) {
      return !el(id).disabled && !el(id).classList.contains("hidden");
    });
  }
  function introRange() {
    return (
      current &&
      current.seriesId &&
      window.areenaLibrary.intro(current.seriesId)
    );
  }
  function playerReady() {
    try {
      return (
        mode === "player" &&
        av &&
        (av.getState() === "PLAYING" || av.getState() === "PAUSED")
      );
    } catch (e) {
      return false;
    }
  }
  function canSkipIntro() {
    var range = introRange();
    return !!(
      mode === "player" &&
      !seeking &&
      range &&
      introStart === null &&
      clock >= range.start &&
      clock < range.end &&
      range.end < current.duration * 1000 - 1000 &&
      playerReady()
    );
  }
  function paintActions() {
    var focused = action >= 0 ? actions()[action] : null,
      range = introRange();
    el("previous-episode").disabled = !previous;
    el("next-episode").disabled = !next;
    el("player-subtitles").textContent = subs
      ? "Tekstitys pois"
      : "Tekstitys päälle";
    el("skip-intro").classList.toggle("hidden", !canSkipIntro());
    el("intro-prompt").classList.toggle(
      "hidden",
      !canSkipIntro() || action >= 0,
    );
    el("learn-intro").classList.toggle(
      "hidden",
      !(current && current.seriesId),
    );
    el("learn-intro").disabled = seeking || !playerReady();
    el("clear-intro").disabled = !playerReady();
    el("learn-intro").textContent =
      introStart === null ? "Opeta tunnari" : "Tunnari päättyy tähän";
    el("clear-intro").classList.toggle("hidden", introStart === null && !range);
    el("clear-intro").textContent =
      introStart === null ? "Poista tunnari" : "Peru opetus";
    text(
      "intro-hint",
      introStart !== null
        ? "Alku " +
            fmt(introStart) +
            " · Valitse loppu, kun tunnari päättyy. ↓ Sulje toiminnot; ← → Siirry videossa."
        : range
          ? "Tallennettu tunnari " +
            fmt(range.start) +
            "–" +
            fmt(range.end) +
            " · Sama asetus tämän sarjan jaksoille."
          : current && current.seriesId
            ? "Opeta tunnari: valitse sen alku nyt, ja loppu tunnarin päättyessä."
            : "",
    );
    actionIds.forEach(function (id) {
      el(id).classList.remove("action-selected");
    });
    var ids = actions();
    if (action >= 0) {
      if (focused && ids.indexOf(focused) >= 0) action = ids.indexOf(focused);
      action = Math.min(action, ids.length - 1);
      el(ids[action]).classList.add("action-selected");
    }
    el("player-actions").classList.toggle("hidden", action < 0);
  }
  function hud(message) {
    if (message !== undefined) text("player-status", message);
    el("hud").classList.remove("hidden");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (mode === "player" && action < 0 && av && av.getState() === "PLAYING")
        el("hud").classList.add("hidden");
    }, 5000);
  }
  function neighbours(p, ticket) {
    var index = queue.indexOf(p.id);
    previous = index > 0 ? queue[index - 1] : null;
    next =
      index >= 0 && index + 1 < queue.length
        ? queue[index + 1]
        : p.next || null;
    paintActions();
    window.areenaSeries
      .neighbours(p)
      .then(function (result) {
        if (ticket !== serial) return;
        previous = result.previous || previous;
        next = result.next || next;
        paintActions();
      })
      .catch(function (error) {
        event("neighbours-unavailable", {
          message: String(error),
          program: p.id,
        });
      });
  }
  function start(id, options) {
    options = options || {};
    stop();
    var ticket = serial;
    queue = options.queue || [];
    previous = null;
    next = null;
    mode = "loading";
    notice("Avataan ohjelmaa…");
    window
      .areenaRequest("/api/program/" + id)
      .then(function (p) {
        if (ticket !== serial) return;
        current = p;
        clock = options.restart ? 0 : window.areenaLibrary.position(p.id);
        var resume = clock;
        event("open", { program: p.id, resume: resume });
        if (!window.webapis || !webapis.avplay)
          throw Error("Samsung AVPlay ei ole käytettävissä tässä selaimessa");
        av = webapis.avplay;
        el("notice").classList.add("hidden");
        el("home").classList.add("hidden");
        document.body.classList.add("playing");
        text("playing-title", p.series + " — " + p.episode);
        mode = "player";
        lastSave = Date.now();
        action = -1;
        hud("Ladataan…");
        av.open(p.manifest);
        try {
          av.setStreamingProperty(
            "ADAPTIVE_INFO",
            "STARTBITRATE=HIGHEST|SKIPBITRATE=HIGHEST",
          );
        } catch (e) {
          event("adaptive-setting", { message: String(e) });
        }
        av.setDisplayRect(0, 0, 1920, 1080);
        av.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
        av.setListener({
          onbufferingstart: function () {
            if (ticket === serial) {
              hud("Puskurointi…");
              event("buffering", { program: p.id });
            }
          },
          onbufferingcomplete: function () {
            if (ticket === serial) hud("");
          },
          oncurrentplaytime: function (ms) {
            if (ticket !== serial) return;
            clock = ms;
            text("time", fmt(ms) + " / " + fmt(p.duration * 1000));
            el("progress").style.width =
              Math.min(100, (ms / (p.duration * 1000)) * 100) + "%";
            if (!seeking && Date.now() - lastSave >= 5000) save();
            paintActions();
          },
          onstreamcompleted: function () {
            if (ticket !== serial) return;
            window.areenaLibrary.update(p, p.duration * 1000, true);
            event("ended", { program: p.id });
            var target = next,
              oldQueue = queue.slice();
            stop(false);
            if (target) start(target, { queue: oldQueue });
            else returnToOrigin();
          },
          onerror: function (error) {
            if (ticket === serial) fail(Error(error));
          },
          onsubtitlechange: function (duration, cue) {
            if (ticket !== serial) return;
            clearTimeout(subtitleTimer);
            text(
              "subtitle",
              subs
                ? String(cue)
                    .replace(/\u0000/g, "")
                    .replace(/<br\s*\/?\s*>/gi, "\n")
                    .replace(/<[^>]*>/g, "")
                : "",
            );
            subtitleTimer = setTimeout(function () {
              text("subtitle", "");
            }, duration);
          },
        });
        av.prepareAsync(
          function () {
            if (ticket !== serial) return;
            try {
              seeking = true;
              av.play();
              if (resume >= 10000 && resume < p.duration * 1000 - 15000) {
                pendingSeek = resume;
                av.seekTo(
                  resume,
                  function () {
                    if (ticket !== serial) return;
                    seeking = false;
                    pendingSeek = null;
                  },
                  function () {
                    if (ticket !== serial) return;
                    seeking = false;
                    pendingSeek = null;
                    notice("Jatkaminen ei onnistunut. Ohjelma alkoi alusta.");
                  },
                );
              } else seeking = false;
              var tracks = av.getTotalTrackInfo(),
                subtitle = tracks.filter(function (t) {
                  return t.type === "TEXT";
                })[0];
              if (subtitle) {
                av.setSelectTrack("TEXT", subtitle.index);
                av.setSilentSubtitle(!subs);
              }
              event("prepared", {
                program: p.id,
                duration: av.getDuration(),
                tracks: tracks,
              });
              neighbours(p, ticket);
              hud("");
              setTimeout(function () {
                if (ticket === serial && mode === "player")
                  event("playback-check", {
                    program: p.id,
                    state: av.getState(),
                    time: av.getCurrentTime(),
                  });
              }, 10000);
            } catch (e) {
              fail(e);
            }
          },
          function (error) {
            if (ticket === serial) fail(error);
          },
        );
      })
      .catch(function (error) {
        if (ticket === serial) fail(error);
      });
  }
  function toggle() {
    if (!av) return;
    try {
      if (av.getState() === "PLAYING") {
        clock = av.getCurrentTime();
        av.pause();
        save();
        hud("Tauko");
        event("pause", { program: current.id, time: clock });
      } else if (av.getState() === "PAUSED") {
        av.play();
        hud("");
        event("resume", { program: current.id, time: clock });
      }
    } catch (e) {
      notice(String(e));
    }
  }
  function seek(delta) {
    if (!playerReady() || seeking) return;
    try {
      seekTo(
        av.getCurrentTime() + delta,
        delta > 0 ? "+10 sekuntia" : "−10 sekuntia",
      );
    } catch (e) {
      notice(String(e));
    }
  }
  function seekTo(destination, message) {
    if (!playerReady() || !current || seeking) return;
    var ticket = serial,
      program = current.id;
    try {
      var dest = Math.max(0, Math.min(av.getDuration() - 1000, destination));
      seeking = true;
      pendingSeek = dest;
      text("subtitle", "");
      av.seekTo(
        dest,
        function () {
          if (ticket !== serial) return;
          seeking = false;
          pendingSeek = null;
          clock = dest;
          save();
          hud(message || "");
          paintActions();
          event("seek", { program: program, time: dest });
        },
        function (e) {
          if (ticket !== serial) return;
          seeking = false;
          pendingSeek = null;
          notice(String(e));
          paintActions();
        },
      );
      hud(message);
      paintActions();
    } catch (e) {
      seeking = false;
      pendingSeek = null;
      notice(String(e));
      paintActions();
    }
  }
  function skipIntro() {
    if (!canSkipIntro()) return;
    var range = introRange();
    action = -1;
    seekTo(range.end, "Tunnari ohitettu");
  }
  el("skip-intro").onclick = skipIntro;
  el("intro-prompt").onclick = skipIntro;
  el("learn-intro").onclick = function () {
    if (!playerReady() || !current || !current.seriesId || seeking) return;
    var now = av.getCurrentTime();
    if (introStart === null) {
      introStart = now;
      notice("Tunnarin alku tallennettu. Valitse loppu, kun tunnari päättyy.");
    } else {
      if (
        now >= current.duration * 1000 - 1000 ||
        !window.areenaLibrary.intro(current.seriesId, {
          start: introStart,
          end: now,
        })
      ) {
        notice(
          "Valitse loppu alun jälkeen. Tunnarin pituus voi olla 1–300 sekuntia.",
        );
        return;
      }
      introStart = null;
      notice("Tunnari tallennettu tälle sarjalle.");
    }
    paintActions();
  };
  el("clear-intro").onclick = function () {
    if (!current || !current.seriesId) return;
    if (introStart !== null) {
      introStart = null;
      notice("Opetus peruttu.");
    } else {
      window.areenaLibrary.intro(current.seriesId, null);
      notice("Tunnarin asetus poistettu.");
    }
    paintActions();
  };
  function toggleSubtitles() {
    subs = !subs;
    try {
      av.setSilentSubtitle(!subs);
    } catch (e) {}
    if (!subs) text("subtitle", "");
    hud(subs ? "Tekstitys päällä" : "Tekstitys pois");
    paintActions();
  }
  el("previous-episode").onclick = function () {
    if (previous) start(previous, { queue: queue.slice() });
  };
  el("next-episode").onclick = function () {
    if (next) start(next, { queue: queue.slice() });
  };
  el("player-subtitles").onclick = toggleSubtitles;
  el("player-details").onclick = function () {
    if (!current) return;
    var p = current;
    stop();
    window.seriesPanel.open(p.seriesId || p.id, {
      isSeries: !!p.seriesId,
      seasonId: p.seasonId,
      episodeId: p.id,
    });
  };
  document.addEventListener("keydown", function (e) {
    var k = e.keyCode;
    if (
      [13, 27, 37, 38, 39, 40, 10009, 415, 19, 10252, 413, 417, 412].indexOf(
        k,
      ) < 0
    )
      return;
    e.preventDefault();
    event("key", { key: k, mode: mode });
    if (mode === "loading") {
      if (k === 10009 || k === 27) {
        stop();
        returnToOrigin();
      }
      return;
    }
    if (mode === "player") {
      if (k === 10009 || k === 27 || k === 413) {
        stop();
        returnToOrigin();
      } else if (k === 38) {
        action = 0;
        paintActions();
        hud();
      } else if (action >= 0 && (k === 37 || k === 39)) {
        action =
          (action + (k === 37 ? -1 : 1) + actions().length) % actions().length;
        paintActions();
        hud();
      } else if (action >= 0 && k === 13) el(actions()[action]).click();
      else if (action >= 0 && k === 40) {
        action = -1;
        paintActions();
        hud();
      } else if (k === 13 || k === 10252 || k === 415 || k === 19) toggle();
      else if (k === 37 || k === 412) seek(-10000);
      else if (k === 39 || k === 417) seek(10000);
      else if (k === 40) toggleSubtitles();
      return;
    }
    window.homeScreen.handleKey(k);
  });
  window.openAreenaProgram = start;
  window.addEventListener("librarychange", function () {
    if (mode === "home") window.homeScreen.refresh();
  });
  window.addEventListener("libraryerror", function (e) {
    notice(e.detail);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && mode === "player") {
      save();
      try {
        av.pause();
      } catch (e) {}
    }
  });
  window.addEventListener("beforeunload", save);
  window.addEventListener("error", function (e) {
    event("js-error", { message: e.message, line: e.lineno });
  });
  try {
    [
      "MediaPlayPause",
      "MediaPlay",
      "MediaPause",
      "MediaStop",
      "MediaRewind",
      "MediaFastForward",
    ].forEach(function (k) {
      tizen.tvinputdevice.registerKey(k);
    });
  } catch (e) {}
  event("boot", {
    userAgent: navigator.userAgent,
    avplay: !!(window.webapis && webapis.avplay),
  });
  window.homeScreen.show();
  window
    .areenaRequest("/api/catalog")
    .then(function (items) {
      window.homeScreen.setCatalog(items);
      text("connection", "Suoraan Ylestä · Oma Areena 0.3.5");
      event("catalog-loaded", { count: items.length });
      return window.areenaLibrary
        .migrate(function (id) {
          return window.areenaRequest("/api/program/" + id);
        })
        .then(function () {
          event("library-migrated", {
            count: window.areenaLibrary.continuing().length,
          });
        });
    })
    .catch(function (e) {
      text("connection", "Ylen tiedot eivät ole saatavilla");
      notice(e.message);
    });
})();
