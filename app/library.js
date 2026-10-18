/* Local viewing history and favourites. GPL-3.0-or-later. */
(function () {
  "use strict";
  var KEY = "oma-areena-library-v1",
    db;
  function empty() {
    return { version: 1, history: {}, favourites: {}, seasons: {} };
  }
  try {
    db = JSON.parse(localStorage.getItem(KEY)) || empty();
  } catch (e) {
    db = empty();
  }
  if (db.version !== 1) db = empty();
  [
    "history",
    "favourites",
    "seasons",
    "seasonEpisodes",
    "seasonUndo",
    "intros",
  ].forEach(function (k) {
    if (!db[k] || typeof db[k] !== "object") db[k] = {};
  });
  function changed() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent("libraryerror", {
          detail: "TV:n tallennustila ei riitä katselutietojen tallentamiseen.",
        }),
      );
      return false;
    }
    window.dispatchEvent(new CustomEvent("librarychange"));
    return true;
  }
  function snapshot(p) {
    return {
      id: p.id,
      seriesId: p.seriesId || null,
      seasonId: p.seasonId || null,
      series: p.series || p.title || "",
      episode: p.episode || p.title || "",
      image: p.image || "",
      description: p.description || "",
      duration: Number(p.duration) || 0,
    };
  }
  function update(p, position, completed) {
    if (!p || !/^1-\d+$/.test(p.id) || !isFinite(position)) return;
    var entry = snapshot(p),
      duration = entry.duration * 1000;
    entry.position = Math.max(
      0,
      duration ? Math.min(duration, Number(position)) : Number(position),
    );
    entry.completed =
      !!completed ||
      (duration > 0 &&
        entry.position >= Math.max(duration - 15000, duration * 0.98));
    entry.updatedAt = Date.now();
    db.history[p.id] = entry;
    try {
      if (entry.completed) localStorage.removeItem("progress:" + p.id);
      else
        localStorage.setItem(
          "progress:" + p.id,
          JSON.stringify(entry.position),
        );
    } catch (e) {}
    changed();
  }
  function position(id) {
    var p = db.history[id];
    if (p) return p.completed ? 0 : p.position;
    try {
      var old = Number(JSON.parse(localStorage.getItem("progress:" + id)));
      return isFinite(old) ? Math.max(0, old) : 0;
    } catch (e) {
      return 0;
    }
  }
  function continuing() {
    return Object.keys(db.history)
      .map(function (id) {
        return db.history[id];
      })
      .filter(function (p) {
        return !p.completed && p.position >= 10000;
      })
      .sort(function (a, b) {
        return b.updatedAt - a.updatedAt;
      });
  }
  function favouriteKey(p) {
    return p.seriesId || p.id;
  }
  function toggle(p) {
    var id = favouriteKey(p);
    if (!/^1-\d+$/.test(id || "")) return false;
    if (db.favourites[id]) delete db.favourites[id];
    else
      db.favourites[id] = {
        id: id,
        kind: p.kind || (p.seriesId ? "series" : "program"),
        title: p.series || p.title || p.episode,
        image: p.image || "",
        description: p.description || "",
        addedAt: Date.now(),
      };
    changed();
    return !!db.favourites[id];
  }
  function favourites() {
    return Object.keys(db.favourites)
      .map(function (id) {
        return db.favourites[id];
      })
      .sort(function (a, b) {
        return b.addedAt - a.addedAt;
      });
  }
  function lastForSeries(id) {
    return continuing().filter(function (p) {
      return p.seriesId === id || p.id === id;
    })[0];
  }
  function remove(id) {
    delete db.history[id];
    try {
      localStorage.removeItem("progress:" + id);
    } catch (e) {}
    changed();
  }
  function migrate(getProgram) {
    var ids = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i),
        match = /^progress:(1-\d+)$/.exec(key);
      if (match && !db.history[match[1]] && position(match[1]) >= 10000)
        ids.push(match[1]);
    }
    // Limit concurrency rather than truncating users' old history.
    var at = 0;
    function worker() {
      var id = ids[at++];
      if (!id) return Promise.resolve();
      return getProgram(id)
        .then(function (p) {
          if (!db.history[id]) update(p, position(id));
        })
        .catch(function () {})
        .then(worker);
    }
    return Promise.all([worker(), worker(), worker()]);
  }
  function seasonKey(seriesId, seasonId) {
    return seriesId + ":" + seasonId;
  }
  function rememberSeason(seriesId, seasonId, items) {
    var ids = items
      .map(function (p) {
        return p.id;
      })
      .filter(function (id) {
        return /^1-\d+$/.test(id);
      });
    var key = seasonKey(seriesId, seasonId);
    if (JSON.stringify(db.seasonEpisodes[key]) !== JSON.stringify(ids)) {
      db.seasonEpisodes[key] = ids;
      changed();
    }
  }
  function seasonWatched(seriesId, seasonId) {
    var ids = db.seasonEpisodes[seasonKey(seriesId, seasonId)];
    return !!(
      ids &&
      ids.length &&
      ids.every(function (id) {
        return db.history[id] && db.history[id].completed;
      })
    );
  }
  function markSeason(seriesId, seasonId, items, completed) {
    if (!items.length) return;
    var key = seasonKey(seriesId, seasonId),
      undo = db.seasonUndo[key];
    db.seasonEpisodes[key] = items.map(function (p) {
      return p.id;
    });
    if (completed) {
      undo = { token: Date.now() + ":" + key, entries: {} };
      items.forEach(function (p) {
        undo.entries[p.id] = {
          history: db.history[p.id] || null,
          progress: localStorage.getItem("progress:" + p.id),
        };
        var entry = snapshot(p);
        entry.seriesId = seriesId;
        entry.seasonId = seasonId;
        entry.position = entry.duration * 1000;
        entry.completed = true;
        entry.updatedAt = Date.now();
        entry.seasonMark = undo.token;
        db.history[p.id] = entry;
        localStorage.removeItem("progress:" + p.id);
      });
      db.seasonUndo[key] = undo;
    } else if (undo) {
      Object.keys(undo.entries).forEach(function (id) {
        // Keep playback progress changed since the bulk action.
        if (!db.history[id] || db.history[id].seasonMark !== undo.token) return;
        var previous = undo.entries[id];
        if (previous.history) db.history[id] = previous.history;
        else delete db.history[id];
        if (previous.progress === null)
          localStorage.removeItem("progress:" + id);
        else localStorage.setItem("progress:" + id, previous.progress);
      });
      delete db.seasonUndo[key];
    } else {
      items.forEach(function (p) {
        if (db.history[p.id] && db.history[p.id].completed) {
          delete db.history[p.id];
          localStorage.removeItem("progress:" + p.id);
        }
      });
    }
    changed();
  }
  window.areenaLibrary = {
    intro: function (seriesId, value) {
      if (!/^1-\d+$/.test(seriesId || "")) return null;
      if (value === null) {
        delete db.intros[seriesId];
        changed();
        return null;
      }
      var range = value === undefined ? db.intros[seriesId] : value;
      if (
        !range ||
        typeof range.start !== "number" ||
        typeof range.end !== "number" ||
        !isFinite(range.start) ||
        !isFinite(range.end) ||
        range.start < 0 ||
        range.end - range.start < 1000 ||
        range.end - range.start > 300000
      )
        return null;
      range = { start: Math.round(range.start), end: Math.round(range.end) };
      if (value !== undefined) {
        db.intros[seriesId] = range;
        changed();
      }
      return { start: range.start, end: range.end };
    },
    rememberSeason: rememberSeason,
    seasonWatched: seasonWatched,
    markSeason: markSeason,
    seasonCanUndo: function (seriesId, seasonId) {
      return !!db.seasonUndo[seasonKey(seriesId, seasonId)];
    },
    hasWatchedInSeason: function (seriesId, seasonId) {
      return Object.keys(db.history).some(function (id) {
        var p = db.history[id];
        return (
          p.completed && p.seriesId === seriesId && p.seasonId === seasonId
        );
      });
    },
    update: update,
    position: position,
    continuing: continuing,
    toggle: toggle,
    isFavourite: function (p) {
      return !!db.favourites[favouriteKey(p)];
    },
    favourites: favourites,
    lastForSeries: lastForSeries,
    remove: remove,
    migrate: migrate,
    watched: function (id) {
      return !!(db.history[id] && db.history[id].completed);
    },
    season: function (id, value) {
      if (value !== undefined) {
        db.seasons[id] = value;
        changed();
      }
      return db.seasons[id];
    },
  };
})();
