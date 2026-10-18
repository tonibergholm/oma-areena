/* Native Tizen metadata adapter. GPL-3.0-or-later.
 * Preview endpoint and metadata fields follow yle-dl, Antti Ajanki et al. */
(function () {
  "use strict";
  var cache = {},
    seeds = ["1-77998674", "1-77565920", "1-41272"];
  window.pocEvents = [];
  window.pocState = { version: "0.2.0" };
  function downloadText(url, id) {
    return new Promise(function (resolve, reject) {
      var done = false,
        downloadId = null;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try {
          tizen.download.cancel(downloadId);
        } catch (e) {}
        reject(Error("Ylen vastaus aikakatkaistiin"));
      }, 20000);
      function end(err, value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value);
      }
      try {
        var req = new tizen.DownloadRequest(
          url,
          "wgt-private-tmp",
          "areena-" + id + "-" + Date.now() + ".json",
          "ALL",
          {
            Origin: "https://areena.yle.fi",
            Referer: "https://areena.yle.fi/" + id,
            "User-Agent": "Mozilla/5.0",
          },
        );
        downloadId = tizen.download.start(req, {
          oncompleted: function (n, path) {
            tizen.filesystem.resolve(
              path,
              function (file) {
                file.readAsText(
                  function (s) {
                    try {
                      end(null, s);
                    } catch (e) {
                      end(e);
                    }
                    try {
                      file.parent.deleteFile(
                        file.fullPath,
                        function () {},
                        function () {},
                      );
                    } catch (e) {}
                  },
                  function (e) {
                    end(e);
                  },
                  "UTF-8",
                );
              },
              function (e) {
                end(e);
              },
              "rw",
            );
          },
          onfailed: function (n, e) {
            end(Error(e.message || e.name));
          },
        });
      } catch (e) {
        end(e);
      }
    });
  }
  function json(url, id) {
    return downloadText(url, id).then(function (s) {
      return JSON.parse(s);
    });
  }

  function title(x) {
    return (x && (x.fin || x.swe || x[Object.keys(x)[0]])) || "";
  }
  function program(id) {
    if (!/^1-\d+$/.test(id))
      return Promise.reject(Error("Virheellinen ohjelmatunnus"));
    if (cache[id] && Date.now() - cache[id].at < 240000)
      return Promise.resolve(cache[id].value);
    var url =
      "https://player.api.yle.fi/v1/preview/" +
      id +
      ".json?language=fin&ssl=true&countryCode=FI&host=areenaylefi&app_id=player_static_prod&app_key=8930d72170e48303cf5f3867780d549b&isPortabilityRegion=true";
    return json(url, id).then(function (d) {
      var o = d.data && d.data.ongoing_ondemand;
      if (!o || !o.manifest_url) {
        return ui("/v1/ui/players/" + id + ".json").then(function (d) {
          var item = d.data && d.data.ondemand && d.data.ondemand.item;
          if (!item || item.id === id)
            throw Error("Ohjelmaa ei voi toistaa tällä hetkellä");
          return program(item.id);
        });
      }
      var season = o.season && o.season.season_number,
        ep = o.episode_number;
      var p = {
        id: id,
        series: title(o.series && o.series.title),
        episode:
          (season && ep ? "K" + season + ", J" + ep + ": " : "") +
          title(o.title),
        description: title(o.description),
        duration: o.duration.duration_in_seconds,
        manifest: o.manifest_url,
        image:
          "https://images.cdn.yle.fi/image/upload/w_1280,h_720,c_fill/" +
          o.image.id,
        next: o.next_episode && o.next_episode.id,
      };
      cache[id] = { at: Date.now(), value: p };
      return p;
    });
  }
  function episodes(id) {
    var out = [],
      seen = {};
    function next(pid) {
      if (!pid || seen[pid] || out.length >= 12) return Promise.resolve(out);
      seen[pid] = true;
      return program(pid).then(function (p) {
        out.push(p);
        return next(p.next);
      });
    }
    return next(id);
  }
  var categoryCache = null;
  function apiUrl(path) {
    var url =
      path.indexOf("https://") === 0
        ? path
        : "https://areena.api.yle.fi" + path;
    if (!/^https:\/\/areena\.api\.yle\.fi\//.test(url))
      throw Error("Virheellinen Yle-osoite");
    return (
      url +
      (url.indexOf("?") < 0 ? "?" : "&") +
      "client=yle-areena-web&language=fi&v=10&app_id=areena-web-items&app_key=wlTs5D9OjIdeS9krPzRQR4I1PYVzoazN"
    );
  }
  function ui(path) {
    return json(apiUrl(path), "ui");
  }
  function mapCard(c) {
    var pointer = c.pointer || {},
      m = (pointer.uri || "").match(/\/(1-\d+)$/);
    if (!m || ["program", "series"].indexOf(pointer.type) < 0) return null;
    var labels = c.labels || [],
      duration = labels.filter(function (l) {
        return l.rawType === "duration";
      })[0];
    return {
      id: m[1],
      title: c.title || "",
      description: c.description || "",
      kind: pointer.type,
      image:
        c.image && c.image.id
          ? "https://images.cdn.yle.fi/image/upload/w_640,h_360,c_fill/" +
            c.image.id
          : "",
      meta:
        pointer.type === "series"
          ? "Sarja"
          : (duration && duration.formatted) || "Ohjelma",
    };
  }
  function pageResult(d, offset) {
    return {
      items: (d.data || []).map(mapCard).filter(Boolean),
      offset: offset,
      total: typeof (d.meta || {}).count === "number" ? d.meta.count : null,
      hasMore:
        typeof (d.meta || {}).count === "number"
          ? offset + (d.data || []).length < d.meta.count
          : (d.data || []).length === 12,
    };
  }
  function categories() {
    if (categoryCache && Date.now() - categoryCache.at < 300000)
      return Promise.resolve(categoryCache.items);
    return downloadText("https://areena.yle.fi/tv", "categories").then(
      function (html) {
        var m = html.match(
          /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
        );
        if (!m) throw Error("Ylen selausnäkymä ei ole saatavilla");
        var props = JSON.parse(m[1]).props.pageProps,
          content = props.view.tabs[0].content;
        var items = content
          .filter(function (c) {
            return (
              c.type === "list" &&
              c.title &&
              c.source &&
              /^https:\/\/areena\.api\.yle\.fi\/v1\/ui\/content\/list\?/.test(
                c.source.uri,
              ) &&
              !(c.audience && c.audience.authenticated)
            );
          })
          .map(function (c, i) {
            return { id: String(i), title: c.title, source: c.source.uri };
          });
        if (!items.length) throw Error("Kategorioita ei löytynyt");
        categoryCache = { at: Date.now(), items: items };
        return items;
      },
    );
  }
  window.areenaBrowse = {
    categories: categories,
    list: function (category, page) {
      return categories().then(function (items) {
        var c = items.filter(function (x) {
          return x.id === category;
        })[0];
        if (!c) throw Error("Tuntematon kategoria");
        var offset = Math.max(0, page | 0) * 12;
        return ui(c.source + "&offset=" + offset + "&limit=12").then(
          function (d) {
            return pageResult(d, offset);
          },
        );
      });
    },
    search: function (query, page) {
      query = String(query || "")
        .trim()
        .slice(0, 100);
      if (!query)
        return Promise.resolve({
          items: [],
          offset: 0,
          total: 0,
          hasMore: false,
        });
      var offset = Math.max(0, page | 0) * 12;
      return ui(
        "/v1/ui/search?episodes=true&packages=true&service=tv&query=" +
          encodeURIComponent(query) +
          "&offset=" +
          offset +
          "&limit=12",
      ).then(function (d) {
        return pageResult(d, offset);
      });
    },
  };

  window.areenaRequest = function (path, method, data) {
    if (path === "/api/event") {
      window.pocEvents.push(data);
      if (window.pocEvents.length > 300) window.pocEvents.shift();
      console.log("POC", JSON.stringify(data));
      return Promise.resolve({ ok: true });
    }
    if (path === "/api/catalog") return Promise.all(seeds.map(program));
    if (path.indexOf("/api/program/") === 0)
      return program(path.split("/").pop());
    if (path.indexOf("/api/episodes/") === 0)
      return episodes(path.split("/").pop());
    return Promise.reject(Error("Tuntematon pyyntö"));
  };
})();
