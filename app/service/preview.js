/* On-device personal preview service. GPL-3.0-or-later. */
"use strict";
var stateFile = "oma-preview-state.json",
  active = false,
  timer;
function exit() {
  clearTimeout(timer);
  tizen.application.getCurrentApplication().exit();
}
function write(dir, state, done) {
  var file;
  try {
    try {
      file = dir.resolve(stateFile);
    } catch (e) {
      file = dir.createFile(stateFile);
    }
    file.openStream(
      "w",
      function (s) {
        s.write(JSON.stringify(state));
        s.close();
        done();
      },
      exit,
      "UTF-8",
    );
  } catch (e) {
    exit();
  }
}
function run(dir, state) {
  var request = tizen.application
    .getCurrentApplication()
    .getRequestedAppControl();
  var data = (request && request.appControl.data) || [];
  for (var i = 0; i < data.length; i++)
    if (data[i].key === "oma-preview") {
      try {
        state.preview = JSON.parse(data[i].value[0]);
      } catch (e) {}
    }
  if (!state.preview) return exit();
  // Keep latest history even while Samsung's update limit is in effect.
  if (Date.now() - (state.publishedAt || 0) < 600000)
    return write(dir, state, exit);
  write(dir, state, function () {
    try {
      webapis.preview.setPreviewData(
        JSON.stringify(state.preview),
        function () {
          state.publishedAt = Date.now();
          state.error = null;
          write(dir, state, exit);
        },
        function (e) {
          state.error = e.name + ": " + e.message;
          write(dir, state, exit);
        },
      );
    } catch (e) {
      state.error = String(e);
      write(dir, state, exit);
    }
  });
}
module.exports.onStart = function () {};
module.exports.onRequest = function () {
  if (active) return;
  active = true;
  timer = setTimeout(exit, 15000);
  tizen.filesystem.resolve(
    "wgt-private",
    function (dir) {
      try {
        dir.resolve(stateFile).readAsText(
          function (text) {
            var state;
            try {
              state = JSON.parse(text);
            } catch (e) {
              state = {};
            }
            run(dir, state);
          },
          function () {
            run(dir, {});
          },
          "UTF-8",
        );
      } catch (e) {
        run(dir, {});
      }
    },
    exit,
    "rw",
  );
};
module.exports.onExit = function () {
  clearTimeout(timer);
};
