/* Catalogue browser and remote keyboard. GPL-3.0-or-later. */
(function () {
  "use strict";
  var active = false,
    returnPending = false,
    screen = "browse",
    focus = "categories";
  var categories = [],
    category = 0,
    items = [],
    selected = 0,
    page = 0;
  var hasMore = false,
    total = null,
    query = "",
    submitted = "",
    keyIndex = 0;
  var tabIndex = 0,
    pagerIndex = 0,
    serial = 0,
    retry = null,
    physicalTyping = false;
  var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ0123456789"
    .split("")
    .concat([" ", "⌫", "Tyhjennä", "Hae"]);
  function el(id) {
    return document.getElementById(id);
  }
  function setText(id, value) {
    el(id).textContent = value;
  }
  function button(label, fn) {
    var b = document.createElement("button");
    b.textContent = label;
    b.onclick = fn;
    return b;
  }
  function select(group, index) {
    Array.prototype.forEach.call(el(group).children, function (b, i) {
      b.classList.toggle("browse-selected", i === index);
      if (i === index)
        b.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  function paintFocus() {
    Array.prototype.forEach.call(
      el("browser").querySelectorAll(".browse-selected"),
      function (e) {
        e.classList.remove("browse-selected");
      },
    );
    el("browse-tab").classList.toggle(
      "browse-selected",
      focus === "tabs" && tabIndex === 0,
    );
    el("search-tab").classList.toggle(
      "browse-selected",
      focus === "tabs" && tabIndex === 1,
    );
    if (focus === "categories") select("categories", category);
    if (focus === "grid") select("browse-grid", selected);
    if (focus === "keyboard") select("keyboard", keyIndex);
    if (focus === "pager") select("browse-pager", pagerIndex);
  }
  function paintCategories() {
    el("categories").textContent = "";
    categories.forEach(function (c, i) {
      el("categories").appendChild(
        button(c.title, function () {
          category = i;
          page = 0;
          load();
        }),
      );
    });
  }
  function paintKeyboard() {
    el("keyboard").textContent = "";
    characters.forEach(function (c, i) {
      var b = button(c === " " ? "Väli" : c, function () {
        keyIndex = i;
        activateKey();
      });
      b.setAttribute("data-character", c);
      b.setAttribute("aria-label", c === " " ? "Välilyönti" : c);
      el("keyboard").appendChild(b);
    });
    setText("query-text", query || "Kirjoita hakusana");
  }
  function activateKey() {
    var c = characters[keyIndex];
    if (c === "Hae") {
      submit();
      return;
    }
    if (c === "⌫") query = query.slice(0, -1);
    else if (c === "Tyhjennä") query = "";
    else if (query.length < 100) query += c;
    setText("query-text", query || "Kirjoita hakusana");
    paintFocus();
  }
  function paintResults() {
    el("browse-grid").textContent = "";
    items.forEach(function (item, i) {
      var b = button("", function () {
        selected = i;
        play();
      });
      b.className = "browse-card";
      b.setAttribute("data-program-id", item.id);
      if (item.image) {
        var img = document.createElement("img");
        img.src = item.image;
        img.alt = "";
        b.appendChild(img);
      }
      var title = document.createElement("strong");
      title.textContent = item.title;
      b.appendChild(title);
      var detail = document.createElement("span");
      detail.textContent =
        item.meta + (item.description ? " · " + item.description : "");
      b.appendChild(detail);
      el("browse-grid").appendChild(b);
    });
    el("browse-pager").textContent = "";
    if (page > 0)
      el("browse-pager").appendChild(
        button("← Edellinen sivu", function () {
          page--;
          load();
        }),
      );
    if (hasMore)
      el("browse-pager").appendChild(
        button("Seuraava sivu →", function () {
          page++;
          load();
        }),
      );
    var count = items.length
      ? page * 12 + 1 + "–" + (page * 12 + items.length)
      : "0";
    setText(
      "browse-status",
      items.length
        ? (screen === "search"
            ? "Tulokset: " + submitted
            : categories[category].title) +
            " · " +
            count +
            (total !== null ? " / " + total : "")
        : "Ei tuloksia. Kokeile toista hakusanaa tai kategoriaa.",
    );
    selected = Math.min(selected, Math.max(0, items.length - 1));
    pagerIndex = 0;
    paintFocus();
  }
  function loading(fn) {
    var ticket = ++serial;
    retry = fn;
    focus = "loading";
    setText("browse-status", "Ladataan…");
    el("browse-grid").textContent = "";
    el("browse-pager").textContent = "";
    paintFocus();
    return fn()
      .then(function (result) {
        if (!active || ticket !== serial) return null;
        return result;
      })
      .catch(function (e) {
        if (!active || ticket !== serial) return null;
        focus = "error";
        setText(
          "browse-status",
          (e.message || String(e)) + " · OK Yritä uudelleen · Takaisin Palaa",
        );
        return null;
      });
  }
  function load() {
    selected = 0;
    var requestPage = page,
      requestCategory = categories[category] && categories[category].id;
    el("search-panel").classList.add("hidden");
    loading(function () {
      return screen === "search"
        ? window.areenaBrowse.search(submitted, requestPage)
        : window.areenaBrowse.list(requestCategory, requestPage);
    }).then(function (result) {
      if (!result) return;
      items = result.items;
      hasMore = result.hasMore;
      total = result.total;
      focus = items.length
        ? "grid"
        : screen === "search"
          ? "keyboard"
          : "categories";
      if (!items.length && screen === "search")
        el("search-panel").classList.remove("hidden");
      paintResults();
    });
  }
  function submit() {
    if (!query.trim()) {
      setText("browse-status", "Kirjoita ensin hakusana.");
      return;
    }
    submitted = query.trim();
    page = 0;
    load();
  }
  function play() {
    if (!items[selected]) return;
    returnPending = true;
    active = false;
    ++serial;
    el("browser").classList.add("hidden");
    if (items[selected].kind === "series")
      window.seriesPanel.open(items[selected].id, { isSeries: true });
    else window.openAreenaProgram(items[selected].id);
  }
  function open(which) {
    active = true;
    returnPending = false;
    screen = which;
    page = 0;
    selected = 0;
    ++serial;
    el("browser").classList.remove("hidden");
    setText(
      "browser-title",
      which === "search" ? "Hae ohjelmia" : "Löydä seuraava suosikkisi",
    );
    el("categories").classList.toggle("hidden", which === "search");
    el("search-panel").classList.toggle("hidden", which !== "search");
    el("browse-grid").textContent = "";
    el("browse-pager").textContent = "";
    setText("browse-status", "");
    if (which === "search") {
      focus = "keyboard";
      paintKeyboard();
      paintFocus();
    } else
      loading(function () {
        return window.areenaBrowse.categories();
      }).then(function (result) {
        if (!result) return;
        categories = result;
        category = Math.min(category, categories.length - 1);
        paintCategories();
        focus = "categories";
        paintFocus();
        setText("browse-status", "Valitse kategoria ja paina OK.");
      });
  }
  function close() {
    active = false;
    returnPending = false;
    ++serial;
    el("browser").classList.add("hidden");
  }
  function restore() {
    if (!returnPending) return false;
    returnPending = false;
    active = true;
    el("browser").classList.remove("hidden");
    focus = "grid";
    paintResults();
    return true;
  }
  el("browse-tab").onclick = function () {
    open("browse");
  };
  el("search-tab").onclick = function () {
    open("search");
  };
  document.addEventListener(
    "keydown",
    function (e) {
      if (!active) return;
      var k = e.keyCode;
      if (
        focus === "keyboard" &&
        e.key &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        /[a-zåäö0-9 .-]/i.test(e.key)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (query.length < 100) query += e.key;
        physicalTyping = true;
        paintKeyboard();
        paintFocus();
        return;
      }
      if ([13, 27, 37, 38, 39, 40, 8, 10009].indexOf(k) < 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (k === 27 || k === 10009) {
        if (
          focus === "grid" ||
          focus === "pager" ||
          focus === "loading" ||
          focus === "error"
        ) {
          ++serial;
          focus = screen === "search" ? "keyboard" : "categories";
          if (screen === "search") {
            el("search-panel").classList.remove("hidden");
            el("browse-grid").textContent = "";
            el("browse-pager").textContent = "";
          }
          setText(
            "browse-status",
            screen === "search" ? "Muokkaa hakua." : "Valitse kategoria.",
          );
          paintFocus();
        } else close();
        return;
      }
      if (focus === "loading") return;
      if (focus === "error") {
        if (k === 13) {
          if (categories.length || screen === "search") load();
          else open(screen);
        }
        return;
      }
      if (focus === "tabs") {
        if (k === 37 || k === 39) tabIndex = 1 - tabIndex;
        if (k === 13) {
          open(tabIndex ? "search" : "browse");
          return;
        }
        if (k === 40) focus = screen === "search" ? "keyboard" : "categories";
      } else if (focus === "categories") {
        if (k === 37) category = Math.max(0, category - 1);
        if (k === 39) category = Math.min(categories.length - 1, category + 1);
        if (k === 38) {
          focus = "tabs";
          tabIndex = 0;
        }
        if (k === 13) {
          page = 0;
          load();
          return;
        }
        if (k === 40 && items.length) focus = "grid";
      } else if (focus === "keyboard") {
        if (k === 13) {
          if (physicalTyping) submit();
          else activateKey();
          return;
        }
        if (k === 8) {
          query = query.slice(0, -1);
          paintKeyboard();
        }
        if (k === 37) keyIndex = Math.max(0, keyIndex - 1);
        if (k === 39) keyIndex = Math.min(characters.length - 1, keyIndex + 1);
        if (k === 38) {
          if (keyIndex < 10) {
            focus = "tabs";
            tabIndex = 1;
          } else keyIndex -= 10;
        }
        if (k === 40) keyIndex = Math.min(characters.length - 1, keyIndex + 10);
        if ([37, 38, 39, 40].indexOf(k) >= 0) physicalTyping = false;
      } else if (focus === "grid") {
        if (k === 37) selected = Math.max(0, selected - 1);
        if (k === 39) selected = Math.min(items.length - 1, selected + 1);
        if (k === 38) {
          if (selected < 4) {
            focus = screen === "search" ? "tabs" : "categories";
            tabIndex = 1;
          } else selected -= 4;
        }
        if (k === 40) {
          if (selected + 4 < items.length) selected += 4;
          else if (el("browse-pager").children.length) focus = "pager";
        }
        if (k === 13) {
          play();
          return;
        }
      } else if (focus === "pager") {
        if (k === 38) focus = "grid";
        if (k === 37 || k === 39)
          pagerIndex = Math.max(
            0,
            Math.min(
              el("browse-pager").children.length - 1,
              pagerIndex + (k === 37 ? -1 : 1),
            ),
          );
        if (k === 13) {
          el("browse-pager").children[pagerIndex].click();
          return;
        }
      }
      paintFocus();
    },
    true,
  );
  window.catalogBrowser = { open: open, close: close, restore: restore };
})();
