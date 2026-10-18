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
    seeking = false;
  var queue = [],
    previous = null,
    next = null,
    action = -1;
  var actionIds = [
    "previous-episode",
    "next-episode",
    "player-subtitles",
    "player-details",
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
  function save() {
    if (!current || seeking) return;
    if (av)
      try {
        if (av.getState() === "PLAYING" || av.getState() === "PAUSED")
          clock = av.getCurrentTime();
      } catch (e) {}
    if (clock > 0) {
      window.areenaLibrary.update(current, clock);
      lastSave = Date.now();
    }
  }
  function stop(savePosition) {
    ++serial;
    if (savePosition !== false) save();
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
    document.body.classList.remove("playing");
    el("home").classList.remove("hidden");
    mode = "home";
    action = -1;
    clock = 0;
    seeking = false;
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
      return !el(id).disabled;
    });
  }
  function paintActions() {
    el("previous-episode").disabled = !previous;
    el("next-episode").disabled = !next;
    el("player-subtitles").textContent = subs
      ? "Tekstitys pois"
      : "Tekstitys päälle";
    actionIds.forEach(function (id) {
      el(id).classList.remove("action-selected");
    });
    var ids = actions();
    if (action >= 0) {
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
              if (resume >= 10000 && resume < p.duration * 1000 - 15000)
                av.seekTo(
                  resume,
                  function () {
                    seeking = false;
                  },
                  function () {
                    seeking = false;
                    notice("Jatkaminen ei onnistunut. Ohjelma alkoi alusta.");
                  },
                );
              else seeking = false;
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
    try {
      var dest = Math.max(
        0,
        Math.min(av.getDuration() - 1000, av.getCurrentTime() + delta),
      );
      seeking = true;
      av.seekTo(
        dest,
        function () {
          seeking = false;
          clock = dest;
          save();
          hud("");
          event("seek", { program: current.id, time: dest });
        },
        function (e) {
          seeking = false;
          notice(String(e));
        },
      );
      hud(delta > 0 ? "+10 sekuntia" : "−10 sekuntia");
    } catch (e) {
      seeking = false;
      notice(String(e));
    }
  }
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
      text("connection", "Suoraan Ylestä · Oma Areena 0.3.2");
      event("catalog-loaded", { count: items.length });
      return window.areenaLibrary.migrate(function (id) {
        return window.areenaRequest("/api/program/" + id);
      }).then(function() { event("library-migrated", {count:window.areenaLibrary.continuing().length}); });
    })
    .catch(function (e) {
      text("connection", "Ylen tiedot eivät ole saatavilla");
      notice(e.message);
    });
})();
