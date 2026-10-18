/* Complete seasons and episode navigation. GPL-3.0-or-later. */
(function () {
  "use strict";
  var active = false,
    returnPending = false,
    info = null,
    items = [],
    season = 0,
    selected = 0;
  var focus = "seasons",
    page = 0,
    pager = 0,
    serial = 0,
    loadedSeason = -1,
    descriptionOpen = false,
    descriptionFocus = "seasons",
    PAGE = 24;
  function el(id) {
    return document.getElementById(id);
  }
  function button(text, click) {
    var b = document.createElement("button");
    b.textContent = text;
    b.onclick = click;
    return b;
  }
  function favourite() {
    return {
      id: info.id,
      kind: info.kind,
      title: info.title,
      image: info.image,
      description: info.description,
    };
  }
  function hideDescription() {
    descriptionOpen = false;
    el("description-dialog").classList.add("hidden");
  }
  function showDescription(title, description) {
    if (!description) return;
    descriptionFocus = focus;
    descriptionOpen = true;
    el("description-title").textContent = title || "Ohjelman tiedot";
    el("description-text").textContent = description;
    el("description-dialog").classList.remove("hidden");
    el("description-body").scrollTop = 0;
  }
  function closeDescription() {
    hideDescription();
    focus = descriptionFocus;
    paint();
  }
  function paint() {
    if (!info) return;
    el("read-description").classList.toggle("hidden", !info.description);
    el("read-description").classList.toggle(
      "series-selected",
      focus === "description" && !descriptionOpen,
    );
    el("series-help").textContent =
      focus === "episodes"
        ? "↑ ↓ Valitse jakso · ← Jakson kuvaus · OK Katso · Takaisin Palaa"
        : "← → Valitse kausi · ↑ Toiminnot / kuvaus · ↓ Jaksot · OK Katso · Takaisin Palaa";
    el("detail-favourite").textContent = window.areenaLibrary.isFavourite(
      favourite(),
    )
      ? "★ Poista suosikeista"
      : "☆ Suosikiksi";
    el("detail-favourite").classList.toggle(
      "series-selected",
      focus === "favourite",
    );
    var currentSeason = info.seasons[season],
      library = window.areenaLibrary;
    el("season-watched").classList.toggle("hidden", !currentSeason);
    el("season-watched").disabled = loadedSeason !== season || !items.length;
    el("season-watched").textContent =
      currentSeason && library.seasonCanUndo(info.id, currentSeason.id)
        ? "Peru kauden merkintä"
        : currentSeason && library.seasonWatched(info.id, currentSeason.id)
          ? "Merkitse katsomattomaksi"
          : "Merkitse kausi katsotuksi";
    el("season-watched").classList.toggle(
      "series-selected",
      focus === "watched",
    );
    Array.prototype.forEach.call(el("season-tabs").children, function (b, i) {
      if (info.seasons[i]) {
        var watched = library.seasonWatched(info.id, info.seasons[i].id);
        b.classList.toggle("watched-season", watched);
        b.textContent =
          info.seasons[i].title + (watched ? " ✓" : "");
        b.setAttribute("aria-label", info.seasons[i].title + (watched ? ", katsottu" : ""));
      }
      b.classList.toggle(
        "series-selected",
        focus === "seasons" && i === season,
      );
      b.classList.toggle("active-season", i === season);
      if (i === season && focus === "seasons")
        b.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    Array.prototype.forEach.call(
      el("season-episodes").querySelectorAll(".episode"),
      function (b) {
        var yes = focus === "episodes" && Number(b.dataset.index) === selected;
        b.classList.toggle("series-selected", yes);
        if (yes) b.scrollIntoView({ block: "nearest" });
      },
    );
    Array.prototype.forEach.call(el("series-pager").children, function (b, i) {
      b.classList.toggle("series-selected", focus === "pager" && i === pager);
    });
  }
  function render() {
    el("season-episodes").textContent = "";
    items.slice(page * PAGE, (page + 1) * PAGE).forEach(function (p, offset) {
      var index = page * PAGE + offset,
        b = button("", function () {
          selected = index;
          play();
        });
      b.className = "episode";
      b.classList.toggle("watched-episode", window.areenaLibrary.watched(p.id));
      b.dataset.index = index;
      b.dataset.programId = p.id;
      var img = document.createElement("img");
      img.src = p.image;
      img.alt = "";
      b.appendChild(img);
      var text = document.createElement("div"),
        title = document.createElement("strong");
      title.textContent = p.episode || p.title;
      var detail = document.createElement("span");
      detail.textContent = p.description || "";
      var meta = document.createElement("small");
      meta.textContent =
        (p.meta || "") +
        (window.areenaLibrary.watched(p.id)
          ? " · ✓ Katsottu"
          : window.areenaLibrary.position(p.id) >= 10000
            ? " · Kesken"
            : "");
      text.appendChild(title);
      text.appendChild(detail);
      text.appendChild(meta);
      b.appendChild(text);
      el("season-episodes").appendChild(b);
    });
    el("series-pager").textContent = "";
    if (page > 0)
      el("series-pager").appendChild(
        button("← Edelliset jaksot", function () {
          page--;
          selected = page * PAGE;
          focus = "episodes";
          render();
        }),
      );
    if ((page + 1) * PAGE < items.length)
      el("series-pager").appendChild(
        button("Lisää jaksoja →", function () {
          page++;
          selected = page * PAGE;
          focus = "episodes";
          render();
        }),
      );
    el("series-status").textContent = items.length
      ? ((info.seasons[season] && info.seasons[season].title) || "Ohjelma") +
        " · " +
        items.length +
        " jaksoa" +
        " · " +
        items.filter(function (p) {
          return window.areenaLibrary.watched(p.id);
        }).length +
        "/" +
        items.length +
        " katsottu" +
        (items.length > PAGE
          ? " · sivu " + (page + 1) + "/" + Math.ceil(items.length / PAGE)
          : "")
      : "Tällä kaudella ei ole katsottavia jaksoja.";
    paint();
  }
  function loadSeason(enterEpisodes, episodeId) {
    var ticket = ++serial;
    items = [];
    loadedSeason = -1;
    page = 0;
    selected = 0;
    pager = 0;
    el("season-episodes").textContent = "";
    el("series-pager").textContent = "";
    el("series-status").textContent = "Ladataan kaikki kauden jaksot…";
    paint();
    var promise =
      info.kind === "program"
        ? Promise.resolve([info.program])
        : window.areenaSeries.episodes(info.id, info.seasons[season].id);
    promise
      .then(function (result) {
        if (!active || ticket !== serial) return;
        items = result;
        loadedSeason = season;
        if (info.seasons[season])
          window.areenaLibrary.rememberSeason(
            info.id,
            info.seasons[season].id,
            items,
          );
        var index = episodeId
          ? items.findIndex(function (p) {
              return p.id === episodeId;
            })
          : -1;
        selected = index >= 0 ? index : 0;
        page = Math.floor(selected / PAGE);
        if (enterEpisodes && items.length) focus = "episodes";
        render();
      })
      .catch(function (e) {
        if (!active || ticket !== serial) return;
        el("series-status").textContent =
          (e.message || String(e)) + " · OK Yritä uudelleen";
        focus = "seasons";
        paint();
      });
  }
  function open(id, options) {
    options = options || {};
    active = true;
    returnPending = false;
    info = null;
    items = [];
    ++serial;
    focus = "seasons";
    hideDescription();
    el("read-description").classList.add("hidden");
    el("series-panel").classList.remove("hidden");
    el("detail-title").textContent = "Ladataan sarjaa…";
    el("detail-description").textContent = "";
    el("series-status").textContent = "";
    el("season-tabs").textContent = "";
    el("season-episodes").textContent = "";
    el("series-pager").textContent = "";
    el("season-watched").classList.add("hidden");
    el("season-watched").disabled = true;
    var ticket = serial;
    window.areenaSeries
      .info(id, options.isSeries)
      .then(function (result) {
        if (!active || ticket !== serial) return;
        info = result;
        el("detail-title").textContent = info.title;
        el("detail-description").textContent = info.description || "";
        var wanted = options.seasonId || window.areenaLibrary.season(info.id);
        season = info.seasons.findIndex(function (s) {
          return s.id === wanted;
        });
        if (season < 0)
          season = Math.max(
            0,
            info.seasons.findIndex(function (s) {
              return s.isDefault;
            }),
          );
        info.seasons.forEach(function (s, i) {
          var b = button(s.title, function () {
            season = i;
            focus = "seasons";
            window.areenaLibrary.season(info.id, s.id);
            loadSeason(true);
          });
          b.dataset.seasonId = s.id;
          el("season-tabs").appendChild(b);
        });
        if (!info.seasons.length)
          el("season-tabs").appendChild(
            button("Ohjelma", function () {
              focus = "episodes";
              paint();
            }),
          );
        loadSeason(false, options.episodeId);
        // Reconcile older playback history for other seasons without loading untouched seasons.
        var seriesId = info.id;
        var pendingSeasons = info.seasons.filter(function (s, i) {
          return (
            i !== season &&
            window.areenaLibrary.hasWatchedInSeason(seriesId, s.id)
          );
        });
        function checkNext() {
          if (
            !active ||
            !info ||
            info.id !== seriesId ||
            !pendingSeasons.length
          )
            return;
          var s = pendingSeasons.shift();
          window.areenaSeries
            .episodes(seriesId, s.id)
            .then(function (episodes) {
              window.areenaLibrary.rememberSeason(seriesId, s.id, episodes);
              if (active && info && info.id === seriesId) paint();
            })
            .catch(function () {})
            .then(checkNext);
        }
        checkNext();
      })
      .catch(function (e) {
        if (active && ticket === serial) {
          el("detail-title").textContent = "Sarjaa ei voitu avata";
          el("series-status").textContent = e.message || String(e);
        }
      });
  }
  function close() {
    hideDescription();
    active = false;
    returnPending = false;
    ++serial;
    el("series-panel").classList.add("hidden");
    if (!window.catalogBrowser.restore()) window.homeScreen.show();
  }
  function play() {
    if (!items[selected]) return;
    hideDescription();
    active = false;
    returnPending = true;
    ++serial;
    el("series-panel").classList.add("hidden");
    window.openAreenaProgram(items[selected].id, {
      queue: items.map(function (p) {
        return p.id;
      }),
    });
  }
  function restore(p) {
    if (!returnPending || !info) return false;
    active = true;
    returnPending = false;
    focus = "episodes";
    el("series-panel").classList.remove("hidden");
    if (p && p.seriesId === info.id) {
      var si = info.seasons.findIndex(function (s) {
        return s.id === p.seasonId;
      });
      if (si >= 0 && si !== loadedSeason) {
        season = si;
        loadSeason(true, p.id);
        return true;
      }
      var index = items.findIndex(function (item) {
        return item.id === p.id;
      });
      if (index >= 0) {
        selected = index;
        page = Math.floor(index / PAGE);
      }
    }
    render();
    return true;
  }
  el("detail-favourite").onclick = function () {
    if (info) {
      window.areenaLibrary.toggle(favourite());
      paint();
    }
  };
  el("read-description").onclick = function () {
    if (info) {
      focus = "description";
      showDescription(info.title, info.description);
    }
  };
  el("description-close").onclick = closeDescription;
  el("season-watched").onclick = function () {
    if (
      !info ||
      loadedSeason !== season ||
      !items.length ||
      !info.seasons[season]
    )
      return;
    var id = info.seasons[season].id,
      library = window.areenaLibrary;
    var complete =
      !library.seasonCanUndo(info.id, id) &&
      !library.seasonWatched(info.id, id);
    library.markSeason(info.id, id, items, complete);
    render();
  };
  document.addEventListener(
    "keydown",
    function (e) {
      if (!active || [13, 27, 37, 38, 39, 40, 10009].indexOf(e.keyCode) < 0)
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var k = e.keyCode;
      if (descriptionOpen) {
        if (k === 27 || k === 10009 || k === 13) closeDescription();
        else if (k === 38 || k === 40 || k === 37 || k === 39) {
          el("description-body").scrollTop +=
            (k === 38 || k === 37 ? -1 : 1) *
            (k === 37 || k === 39 ? 500 : 220);
        }
        return;
      }
      if (k === 27 || k === 10009) {
        close();
        return;
      }
      if (!info) return;
      if (focus === "favourite") {
        if (k === 13) el("detail-favourite").click();
        else if (k === 37 && info.description) focus = "description";
        else if (
          k === 39 &&
          !el("season-watched").disabled &&
          !el("season-watched").classList.contains("hidden")
        )
          focus = "watched";
        else if (k === 40) focus = "seasons";
      } else if (focus === "description") {
        if (k === 13) {
          showDescription(info.title, info.description);
          return;
        } else if (k === 39) focus = "favourite";
        else if (k === 40) focus = "seasons";
      } else if (focus === "watched") {
        if (k === 13) el("season-watched").click();
        else if (k === 37) focus = "favourite";
        else if (k === 40) focus = "seasons";
      } else if (focus === "seasons") {
        if (k === 38) focus = "favourite";
        else if ((k === 37 || k === 39) && info.seasons.length) {
          var next = Math.max(
            0,
            Math.min(info.seasons.length - 1, season + (k === 37 ? -1 : 1)),
          );
          if (next !== season) {
            season = next;
            window.areenaLibrary.season(info.id, info.seasons[season].id);
            loadSeason(false);
          }
        } else if (k === 13 || k === 40) {
          if (loadedSeason !== season) loadSeason(true);
          else if (items.length) focus = "episodes";
        }
      } else if (focus === "episodes") {
        if (k === 37 && items[selected]) {
          showDescription(
            items[selected].episode || items[selected].title,
            items[selected].description,
          );
          return;
        } else if (k === 38) {
          if (selected % PAGE === 0) focus = "seasons";
          else selected--;
        } else if (k === 40) {
          if (selected + 1 < Math.min(items.length, (page + 1) * PAGE))
            selected++;
          else if (el("series-pager").children.length) {
            focus = "pager";
            pager = 0;
          }
        } else if (k === 13) {
          play();
          return;
        }
      } else if (focus === "pager") {
        if (k === 38) focus = "episodes";
        else if (k === 37 || k === 39)
          pager = Math.max(
            0,
            Math.min(
              el("series-pager").children.length - 1,
              pager + (k === 37 ? -1 : 1),
            ),
          );
        else if (k === 13) {
          el("series-pager").children[pager].click();
          return;
        }
      }
      paint();
    },
    true,
  );
  window.seriesPanel = {
    dismiss: function () {
      hideDescription();
      active = false;
      returnPending = false;
      ++serial;
      el("series-panel").classList.add("hidden");
    },
    open: open,
    restore: restore,
    isActive: function () {
      return active;
    },
  };
})();
