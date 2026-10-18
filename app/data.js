/* Native Tizen metadata adapter. GPL-3.0-or-later.
 * Preview endpoint and metadata fields follow yle-dl, Antti Ajanki et al. */
(function () {
  "use strict";
  var requestSequence = 0,
    cache = {},
    seeds = ["1-77998674", "1-77565920", "1-41272"];
  window.pocEvents = [];
  window.pocState = { version: "0.3.4" };
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
          "areena-" + id + "-" + Date.now() + "-" + ++requestSequence + ".json",
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
        seriesId: o.series && o.series.id,
        seasonId: o.season && o.season.id,
        seasonNumber: season,
        episodeNumber: ep,
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
    return program(id).then(function (p) {
      if (!p.seriesId) return [p];
      return seriesInfo(p.seriesId, true).then(function (info) {
        var season =
          info.seasons.filter(function (s) {
            return s.id === p.seasonId;
          })[0] || info.seasons[0];
        if (!season) return [p];
        return seasonEpisodes(info.id, season.id);
      });
    });
  }
  var categoryCache = null;
  function withParameters(source, parameters) {
    var url = new URL(source);
    Object.keys(parameters).forEach(function (key) {
      url.searchParams.set(key, parameters[key]);
    });
    return url.toString();
  }
  function apiUrl(path) {
    var url =
      path.indexOf("https://") === 0
        ? path
        : "https://areena.api.yle.fi" + path;
    if (!/^https:\/\/areena\.api\.yle\.fi\//.test(url))
      throw Error("Virheellinen Yle-osoite");
    return withParameters(url, {
      client: "yle-areena-web",
      language: "fi",
      v: 10,
      app_id: "areena-web-items",
      app_key: "wlTs5D9OjIdeS9krPzRQR4I1PYVzoazN",
    });
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
  var seriesCache = {},
    seasonCache = {};
  function parsePage(html) {
    var match = html.match(
      /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!match) throw Error("Sarjan tietoja ei saatu Ylestä");
    return JSON.parse(match[1]).props.pageProps;
  }
  function seriesInfo(id, isSeries) {
    if (!/^1-\d+$/.test(id))
      return Promise.reject(Error("Virheellinen ohjelmatunnus"));
    if (!isSeries)
      return program(id).then(function (p) {
        if (p.seriesId) return seriesInfo(p.seriesId, true);
        return {
          id: p.id,
          kind: "program",
          title: p.series || p.episode,
          description: p.description,
          image: p.image,
          seasons: [],
          program: p,
        };
      });
    if (seriesCache[id] && Date.now() - seriesCache[id].at < 240000)
      return Promise.resolve(seriesCache[id].value);
    return downloadText("https://areena.yle.fi/" + id, id).then(
      function (html) {
        var props = parsePage(html),
          view = props.view || {},
          header = view.header || {};
        var tabs = view.tabs || [],
          tab =
            tabs.filter(function (t) {
              return t.slug === "jaksot";
            })[0] || tabs[0];
        var list =
          tab &&
          (tab.content || []).filter(function (c) {
            return c.type === "list" && c.source && c.title !== "Katso myös";
          })[0];
        if (!list) throw Error("Sarjan jaksoja ei ole saatavilla");
        var filters = list.filters || [],
          options = filters.length ? filters[0].options || [] : [];
        if (!options.length)
          options = [{ title: "Kaikki jaksot", parameters: {}, default: true }];
        var info = {
          id: id,
          kind: "series",
          title: view.title || "Sarja",
          description: header.description || "",
          image: "",
          source: list.source.uri,
          seasons: options.map(function (o, i) {
            return {
              id: String((o.parameters || {})["path.season"] || i),
              title: o.title || "Jaksot",
              parameters: o.parameters || {},
              isDefault: !!o.default,
            };
          }),
        };
        var image = view.coverImage || header.image;
        if (image && image.id)
          info.image =
            "https://images.cdn.yle.fi/image/upload/w_1280,h_720,c_fill/" +
            image.id;
        seriesCache[id] = { at: Date.now(), value: info };
        return info;
      },
    );
  }
  function seasonEpisodes(seriesId, seasonId) {
    var key = seriesId + ":" + seasonId;
    if (seasonCache[key] && Date.now() - seasonCache[key].at < 240000)
      return Promise.resolve(seasonCache[key].items);
    return seriesInfo(seriesId, true).then(function (info) {
      var season = info.seasons.filter(function (s) {
        return s.id === seasonId;
      })[0];
      if (!season) throw Error("Tuntematon kausi");
      var items = [],
        seen = {},
        offset = 0;
      function nextPage() {
        return ui(
          withParameters(withParameters(info.source, season.parameters), {
            offset: offset,
            limit: 100,
          }),
        ).then(function (d) {
          var raw = d.data || [];
          raw
            .map(mapCard)
            .filter(Boolean)
            .forEach(function (card) {
              if (card.kind !== "program" || seen[card.id]) return;
              seen[card.id] = true;
              card.seriesId = seriesId;
              card.series = info.title;
              card.seasonId = seasonId;
              card.episode = card.title;
              items.push(card);
            });
          offset += raw.length;
          var count = (d.meta || {}).count;
          if (
            raw.length &&
            (typeof count === "number" ? offset < count : raw.length === 100)
          )
            return nextPage();
          seasonCache[key] = { at: Date.now(), items: items };
          return items;
        });
      }
      return nextPage();
    });
  }
  function neighbours(p) {
    if (!p.seriesId)
      return Promise.resolve({ previous: null, next: p.next || null });
    return seriesInfo(p.seriesId, true).then(function (info) {
      var index = info.seasons.findIndex(function (s) {
        return s.id === p.seasonId;
      });
      if (index < 0) return { previous: null, next: p.next || null };
      return seasonEpisodes(info.id, info.seasons[index].id).then(
        function (items) {
          var i = items.findIndex(function (item) {
            return item.id === p.id;
          });
          if (i < 0) return { previous: null, next: p.next || null };
          var result = {
            previous: i > 0 ? items[i - 1].id : null,
            next: i + 1 < items.length ? items[i + 1].id : p.next || null,
          };
          // Yle may expose seasons newest-first. Compare numeric season labels for boundaries.
          var ordered = info.seasons.slice().sort(function (a, b) {
            return (
              Number((a.title.match(/\d+/) || [0])[0]) -
              Number((b.title.match(/\d+/) || [0])[0])
            );
          });
          var seasonIndex = ordered.findIndex(function (s) {
            return s.id === p.seasonId;
          });
          var tasks = [];
          if (!result.previous && seasonIndex > 0)
            tasks.push(
              seasonEpisodes(info.id, ordered[seasonIndex - 1].id).then(
                function (previous) {
                  if (previous.length)
                    result.previous = previous[previous.length - 1].id;
                },
              ),
            );
          if (!result.next && seasonIndex + 1 < ordered.length)
            tasks.push(
              seasonEpisodes(info.id, ordered[seasonIndex + 1].id).then(
                function (next) {
                  if (next.length) result.next = next[0].id;
                },
              ),
            );
          return Promise.all(tasks).then(function () {
            return result;
          });
        },
      );
    });
  }
  window.areenaSeries = {
    info: seriesInfo,
    episodes: seasonEpisodes,
    neighbours: neighbours,
  };
  window.areenaBrowse = {
    categories: categories,
    list: function (category, page) {
      return categories().then(function (items) {
        var c = items.filter(function (x) {
          return x.id === category;
        })[0];
        if (!c) throw Error("Tuntematon kategoria");
        var offset = Math.max(0, page | 0) * 12;
        return ui(withParameters(c.source, { offset: offset, limit: 12 })).then(
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
    if (path === "/api/catalog")
      return Promise.all(
        seeds.map(function (id) {
          return program(id).catch(function () {
            return null;
          });
        }),
      ).then(function (items) {
        return items.filter(Boolean);
      });
    if (path.indexOf("/api/program/") === 0)
      return program(path.split("/").pop());
    if (path.indexOf("/api/episodes/") === 0)
      return episodes(path.split("/").pop());
    return Promise.reject(Error("Tuntematon pyyntö"));
  };
})();
