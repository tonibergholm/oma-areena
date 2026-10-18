/* Smart Hub preview data and deep links. GPL-3.0-or-later. */
(function (root) {
  "use strict";
  function programId(value) {
    return typeof value === "string" && /^1-\d+$/.test(value);
  }
  function build(entries) {
    var tiles = entries
      .filter(function (p) {
        return (
          programId(p.id) &&
          !p.completed &&
          p.position >= 10000 &&
          /^https:\/\//.test(p.image || "")
        );
      })
      .sort(function (a, b) {
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, 20)
      .map(function (p, i) {
        return {
          title: p.series || p.episode,
          subtitle:
            (p.episode || "") +
            " · Jatka " +
            Math.floor(p.position / 60000) +
            " min",
          image_url: p.image,
          image_ratio: "16by9",
          is_playable: true,
          position: i,
          action_data: JSON.stringify({ action: "resume", programId: p.id }),
        };
      });
    return {
      sections: tiles.length
        ? [{ title: "Jatka katsomista", position: 0, tiles: tiles }]
        : [],
    };
  }
  function action(data) {
    try {
      for (var i = 0; i < (data || []).length; i++) {
        if (data[i].key !== "PAYLOAD") continue;
        var value = JSON.parse(data[i].value[0]);
        if (value && value.values !== undefined)
          value =
            typeof value.values === "string"
              ? JSON.parse(value.values)
              : value.values;
        if (value && value.action === "resume" && programId(value.programId))
          return value.programId;
      }
    } catch (e) {}
    return null;
  }
  var model = { build: build, action: action };
  if (typeof module !== "undefined") module.exports = model;
  else root.areenaPreviewModel = model;
})(this);
