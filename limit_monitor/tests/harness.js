// Node harness: stubs the Candle QtScript host API and exercises the
// plugin logic (status parsing, UI state machine, escape gating).
"use strict";
const fs = require("fs");
const path = require("path");

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("PASS: " + msg);
  else { failures++; console.log("FAIL: " + msg); }
}

// ---- Qt stubs -------------------------------------------------------
function Signal() {
  const fns = [];
  return { connect: (f) => fns.push(f), emit: (...a) => fns.forEach((f) => f(...a)) };
}
class Widget {
  constructor(name) { this.objectName = name; this.visible = true; this.enabled = true;
    this.text = ""; this.toolTip = ""; this.styleSheet = ""; this.checked = false;
    this.clicked = Signal(); }
}
global.QUiLoader = class {
  setWorkingDirectory() {}
  addPluginPath() {}
  load(f) {
    // Build fake widgets mirroring the real .ui hierarchy. IMPORTANT: like
    // Candle's QtScript wrapper, only DIRECT children are resolvable by
    // name (uiPanel.cmdXm must stay undefined - the buttons live inside
    // widEscape). This models the bug fixed on 2026-10-28.
    const w = new Widget(f.name);
    if (f.name === "widget.ui") {
      for (const n of ["lblX","lblY","lblZ","lblP","lblD","lblMsg"])
        w[n] = new Widget(n);
      const esc = new Widget("widEscape");
      for (const n of ["lblEsc","cmdXm","cmdXp","cmdYm","cmdYp","cmdZm","cmdZp"])
        esc[n] = new Widget(n);
      w.widEscape = esc;
    } else {
      for (const n of ["chkEscape","lblNote"])
        w[n] = new Widget(n);
    }
    return w;
  }
};
global.QDir = class { constructor(p) { this.path = p; } };
global.QFile = class {
  constructor(p) { this.p = p; this.name = path.basename(p); }
  open() { return fs.existsSync(this.p); }
  close() {}
};
global.QIODevice = { ReadOnly: 1 };
global.QTimer = class {
  constructor() { this.singleShot = false; this.timeout = Signal(); this.running = false; }
  start() { this.running = true; }
  stop() { this.running = false; }
  fire() { this.running = false; this.timeout.emit(); }
};
const settingsStore = {};
global.QSettings = class {
  constructor() {}
  value(k, d) { return k in settingsStore ? settingsStore[k] : d; }
  setValue(k, v) { settingsStore[k] = v; }
  sync() {}
};
global.QSettings.IniFormat = 1;

// ---- Candle host stubs ----------------------------------------------
const sent = [];
global.script = {
  importExtension: () => {},
  path: path.join(__dirname, ".."),
  name: "LimitMonitorPlugin",
};
global.app = {
  path: "/opt/candle",
  device: {
    state: -1,
    stateChanged: Signal(),
    statusReceived: Signal(),
    responseReceived: Signal(),
    sendCommands: (c) => sent.push(c),
  },
  sender: { state: -1, stateChanged: Signal() },
  settingsAboutToShow: Signal(),
  settingsAccepted: Signal(),
  settingsSetByDefault: Signal(),
};

// ---- load plugin ------------------------------------------------------
const src = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
(0, eval)(src); // evaluate in global scope like QScriptEngine does

init();
const panel = createPanelWidget();
const settings = createSettingsWidget();
check(!!panel, "panel widget created");
check(!!settings, "settings widget created");
check(panel.widEscape.visible === false, "escape row hidden initially");
check(panel.lblMsg.text === "not connected", "disconnected message");
check(panel.lblX.styleSheet.indexOf("#eeeeee") >= 0, "X chip unknown while disconnected");

// Connect: device goes Idle, sender stopped
app.device.state = 1; app.sender.state = 4;
app.device.stateChanged.emit(1);
app.sender.stateChanged.emit(4);
check(panel.lblMsg.text === "no status...", "connected but no status yet");

// Clean status (no Pn)
app.device.statusReceived.emit("<Idle|MPos:0.000,0.000,0.000|FS:0,0>");
check(panel.lblMsg.text === "OK", "all released -> OK");
check(panel.lblX.styleSheet.indexOf("#e8f5e9") >= 0, "X chip green");
check(panel.widEscape.visible === false, "no escape row when released");

// X limit pressed
app.device.statusReceived.emit("<Idle|MPos:0.000,0.000,0.000|Pn:X|FS:0,0>");
check(panel.lblMsg.text === "LIMIT: X !", "limit warning text");
check(panel.lblX.styleSheet.indexOf("#d32f2f") >= 0, "X chip red");
check(panel.widEscape.visible === true, "escape row visible");
check(panel.widEscape.cmdXm.visible && panel.widEscape.cmdXp.visible, "X escape buttons visible");
check(!panel.widEscape.cmdYm.visible && !panel.widEscape.cmdZp.visible, "Y/Z escape buttons hidden");
check(panel.widEscape.cmdXm.enabled, "X- enabled in Idle");

// Click X- sends $TX-
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === 1 && sent[0] === "$TX-", "click sends $TX-");

// During Run escape must be disabled
app.device.state = 3; app.device.stateChanged.emit(3);
check(panel.widEscape.cmdXm.enabled === false, "escape disabled in Run");
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === 1, "no command sent while not ready");

// Alarm state allows escape
app.device.state = 2; app.device.stateChanged.emit(2);
check(panel.widEscape.cmdXp.enabled === true, "escape enabled in Alarm");

// Multiple pins incl. probe and door
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:XYZPD>");
check(panel.lblMsg.text === "LIMIT: X Y Z !", "multi-axis warning");
check(panel.lblP.styleSheet.indexOf("#ef9a00") >= 0, "P chip amber");
check(panel.widEscape.cmdYm.visible && panel.widEscape.cmdZm.visible, "Y/Z escape buttons shown");

// Release all
app.device.statusReceived.emit("<Idle|MPos:0,0,0>");
check(panel.lblMsg.text === "OK", "released again -> OK");
check(panel.widEscape.visible === false, "escape row hidden after release");

// Second press is reported again after release
app.device.statusReceived.emit("<Idle|MPos:0,0,0|Pn:Y>");
check(panel.lblMsg.text === "LIMIT: Y !", "second press reported");

// Staleness
staleTimer.fire();
check(panel.lblMsg.text === "no status...", "stale -> no status message");
check(panel.lblY.styleSheet.indexOf("#eeeeee") >= 0, "chips grey when stale");

// Fresh status recovers
app.device.statusReceived.emit("<Idle|MPos:0,0,0>");
check(panel.lblMsg.text === "OK", "recovered from stale");

// Disconnect clears everything
app.device.state = -1; app.device.stateChanged.emit(-1);
check(panel.lblMsg.text === "not connected", "disconnect message");
check(panel.widEscape.visible === false, "escape hidden after disconnect");

// Settings roundtrip
settings.chkEscape.checked = false;
app.settingsAccepted.emit();
check(settingsStore["escapeButtons"] === false, "options persisted");
settings.chkEscape.checked = true;
app.settingsAboutToShow.emit();
check(settings.chkEscape.checked === false, "settings page reflects stored options");
// Escape disabled by option: press X while connected
app.device.state = 1; app.device.stateChanged.emit(1);
app.device.statusReceived.emit("<Idle|MPos:0,0,0|Pn:X>");
check(panel.widEscape.visible === false, "escape row suppressed by option");

console.log(failures === 0 ? "\nALL TESTS PASSED" : "\n" + failures + " FAILURES");
process.exit(failures ? 1 : 0);
