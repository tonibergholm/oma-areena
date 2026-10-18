/* Netflix-style home rows. GPL-3.0-or-later. */
(function () {
  "use strict";
  var seeds = [],
    rows = [],
    row = 0,
    column = 0,
    focus = "cards",
    action = 0,
    nav = 0;
  var navIds = ["nav-home", "nav-browse", "nav-search", "nav-library"];
  var actionIds = [
    "play",
    "restart",
    "details",
    "favourite",
    "remove-progress",
  ];
  function el(id) {
    return document.getElementById(id);
  }
  function item() {
    return rows[row] && rows[row].items[column];
  }
  function actions() {
    return actionIds.filter(function (id) {
      return !el(id).classList.contains("hidden");
    });
  }
  function time(ms) {
    return Math.floor(ms / 60000) + " min";
  }
  function normaliseFavourite(f) {
    var last = window.areenaLibrary.lastForSeries(f.id);
    if (last) return last;
    return {
      id: f.id,
      seriesId: f.kind === "series" ? f.id : null,
      series: f.title,
      episode: f.kind === "series" ? "Sarja" : "Ohjelma",
      kind: f.kind,
      image: f.image,
      description: f.description,
      duration: 0,
    };
  }
  function refresh() {
    var old = item(),
      oldRow = rows[row] && rows[row].id;
    var library = window.areenaLibrary,
      continuing = library.continuing(),
      favourites = library.favourites();
    rows = [];
    if (continuing.length)
      rows.push({
        id: "continue",
        title: "Jatka katsomista",
        items: continuing,
      });
    if (favourites.length)
      rows.push({
        id: "favourites",
        title: "Suosikit",
        items: favourites.map(normaliseFavourite),
      });
    if (seeds.length)
      rows.push({ id: "shortcuts", title: "Sinun ohjelmasi", items: seeds });
    var found = rows.findIndex(function (r) {
      return r.id === oldRow;
    });
    row = found >= 0 ? found : Math.min(row, Math.max(0, rows.length - 1));
    var same =
      old &&
      rows[row] &&
      rows[row].items.findIndex(function (p) {
        return p.id === old.id;
      });
    column =
      same >= 0
        ? same
        : Math.min(
            column,
            Math.max(0, (rows[row] ? rows[row].items.length : 1) - 1),
          );
    var host = el("home-shelves");
    host.textContent = "";
    rows.forEach(function (r, ri) {
      var section = document.createElement("section");
      section.className = "home-row";
      section.dataset.row = r.id;
      var h = document.createElement("h2");
      h.textContent = r.title;
      section.appendChild(h);
      var cards = document.createElement("div");
      cards.className = "home-cards";
      r.items.forEach(function (p, ci) {
        var b = document.createElement("button");
        b.className = "card";
        b.dataset.programId = p.id;
        b.onclick = function () {
          row = ri;
          column = ci;
          paint();
          activateItem();
        };
        var img = document.createElement("img");
        img.src = p.image;
        img.alt = "";
        b.appendChild(img);
        var label = document.createElement("div");
        label.className = "label";
        var title = document.createElement("h3");
        title.textContent = p.series;
        label.appendChild(title);
        var meta = document.createElement("p");
        meta.textContent = p.episode;
        label.appendChild(meta);
        b.appendChild(label);
        if (library.watched(p.id)) {
          var badge = document.createElement("span");
          badge.className = "watched-badge";
          badge.textContent = "✓ Katsottu";
          b.appendChild(badge);
        }
        var progress = document.createElement("i");
        progress.className = "resume";
        progress.style.width =
          (p.duration
            ? Math.min(100, library.position(p.id) / (p.duration * 10))
            : 0) + "%";
        b.appendChild(progress);
        cards.appendChild(b);
      });
      section.appendChild(cards);
      host.appendChild(section);
    });
    paint();
  }
  function paint() {
    navIds.forEach(function (id, i) {
      el(id).classList.toggle("nav-selected", focus === "nav" && i === nav);
    });
    actionIds.forEach(function (id) {
      el(id).classList.remove("action-selected");
    });
    var p = item();
    if (!p) return;
    var library = window.areenaLibrary,
      position = library.position(p.id);
    el("series").textContent = p.series || p.episode;
    el("meta").textContent =
      p.episode +
      (p.duration ? " · " + Math.round(p.duration / 60) + " min" : "");
    el("description").textContent = p.description || "";
    el("hero").style.backgroundImage = 'url("' + p.image + '")';
    el("play").textContent =
      position >= 10000 ? "▶ Jatka " + time(position) : "▶ Katso";
    el("favourite").textContent = library.isFavourite(p)
      ? "★ Poista suosikeista"
      : "☆ Suosikiksi";
    el("remove-progress").classList.toggle("hidden", !position);
    var list = actions();
    action = Math.min(action, list.length - 1);
    if (focus === "actions") el(list[action]).classList.add("action-selected");
    Array.prototype.forEach.call(
      el("home-shelves").querySelectorAll(".home-row"),
      function (section, ri) {
        Array.prototype.forEach.call(
          section.querySelectorAll(".card"),
          function (card, ci) {
            card.classList.toggle(
              "selected",
              ri === row && ci === column && focus === "cards",
            );
            if (ri === row && ci === column && focus === "cards")
              card.scrollIntoView({ block: "nearest", inline: "nearest" });
          },
        );
      },
    );
  }
  function activateItem() {
    if (rows[row] && rows[row].id === "continue") play(false);
    else details();
  }
  function play(restart) {
    var p = item();
    if (p) window.openAreenaProgram(p.id, { restart: !!restart });
  }
  function details() {
    var p = item();
    if (p)
      window.seriesPanel.open(p.seriesId || p.id, {
        isSeries: !!p.seriesId,
        seasonId: rows[row].id === "continue" ? p.seasonId : null,
        episodeId: p.id,
      });
  }
  el("play").onclick = function () {
    play(false);
  };
  el("restart").onclick = function () {
    play(true);
  };
  el("details").onclick = details;
  el("favourite").onclick = function () {
    if (item()) {
      window.areenaLibrary.toggle(item());
      refresh();
    }
  };
  el("remove-progress").onclick = function () {
    if (item()) {
      window.areenaLibrary.remove(item().id);
      refresh();
    }
  };
  function libraryFocus() {
    focus = "cards";
    row = 0;
    column = 0;
    refresh();
    if (
      !window.areenaLibrary.continuing().length &&
      !window.areenaLibrary.favourites().length
    )
      window.omaNotice(
        "Katso ohjelmaa jatkaaksesi myöhemmin, tai lisää sarja suosikkeihin.",
      );
  }
  navIds.forEach(function (id, i) {
    el(id).onclick = function () {
      activateNav(i);
    };
  });
  function activateNav(index) {
    focus = "cards";
    paint();
    if (index === 1 || index === 2)
      window.catalogBrowser.open(index === 1 ? "browse" : "search");
    else if (index === 3) libraryFocus();
    else refresh();
  }
  function handleKey(k) {
    if (focus === "nav") {
      if (k === 37 || k === 39)
        nav = (nav + (k === 37 ? -1 : 1) + navIds.length) % navIds.length;
      else if (k === 40 || k === 10009 || k === 27) focus = "cards";
      else if (k === 13) {
        activateNav(nav);
        return;
      }
    } else if (focus === "actions") {
      if (k === 38) {
        focus = "nav";
        nav = 1;
      } else if (k === 40 || k === 10009 || k === 27) focus = "cards";
      else if (k === 37 || k === 39)
        action =
          (action + (k === 37 ? -1 : 1) + actions().length) % actions().length;
      else if (k === 13) {
        el(actions()[action]).click();
        return;
      }
    } else {
      if (k === 37 || k === 39) {
        if (rows[row])
          column =
            (column + (k === 37 ? -1 : 1) + rows[row].items.length) %
            rows[row].items.length;
      } else if (k === 38) {
        if (row > 0) {
          row--;
          column = Math.min(column, rows[row].items.length - 1);
        } else {
          focus = "actions";
          action = 0;
        }
      } else if (k === 40) {
        if (row + 1 < rows.length) {
          row++;
          column = Math.min(column, rows[row].items.length - 1);
        } else details();
      } else if (k === 13) {
        activateItem();
        return;
      } else if (k === 10009 || k === 27) {
        try {
          tizen.application.getCurrentApplication().exit();
        } catch (e) {}
      }
    }
    paint();
  }
  window.homeScreen = {
    setCatalog: function (items) {
      seeds = items;
      refresh();
    },
    refresh: refresh,
    handleKey: handleKey,
    show: function () {
      focus = "cards";
      refresh();
    },
  };
})();
