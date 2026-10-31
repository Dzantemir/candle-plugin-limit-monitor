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
      for (const n of ["chkEscape","lblNote","chkDoor","lblNoteDoor"])
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
const stores = {}; // per-file QSettings stores (dataLocation vs legacy plugin dir)
global.QSettings = class {
  constructor(p) { this.p = String(p); if (!stores[this.p]) stores[this.p] = {}; }
  value(k, d) { return k in stores[this.p] ? stores[this.p][k] : d; }
  setValue(k, v) { stores[this.p][k] = v; }
  sync() {}
};
global.QSettings.IniFormat = 1;

// ---- Candle host stubs ----------------------------------------------
const sent = [];
const runtime = []; // realtime commands (Ctrl-X etc.)
const probes = [];  // sendCommand() channel ($I firmware probe)
global.script = {
  importExtension: () => {},
  path: path.join(__dirname, ".."),
  name: "LimitMonitorPlugin",
};
global.app = {
  path: "/opt/candle",
  dataLocation: "/appdata",
  device: {
    state: -1,
    stateChanged: Signal(),
    statusReceived: Signal(),
    responseReceived: Signal(),
    sendCommands: (c) => sent.push(c),
    sendCommand: (c, i, show) => probes.push(c),
    sendRuntimeCommand: (c) => runtime.push(c),
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
const settingsStore = stores["/appdata/plugin_limit_monitor.ini"];
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
check(probes.length === 1 && probes[0] === "$I", "firmware probe sent once after connect");
app.device.responseReceived.emit("$I", -100, "[VER:1.1h.20261030_ALOE_FIXED10:]; ok");

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
app.device.responseReceived.emit("$TX-", -100, "ok"); // firmware replies

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
check(panel.lblD.styleSheet.indexOf("#eeeeee") >= 0, "D chip grey by default even with Pn:D (not monitored)");
check(panel.lblD.toolTip.indexOf("not monitored") >= 0, "D tooltip explains not monitored");

// Enable door monitoring in the settings (keep escape buttons on)
settings.chkEscape.checked = true; settings.chkDoor.checked = true;
app.settingsAccepted.emit();
check(settingsStore["doorSensor"] === true, "door option persisted");
check(panel.lblD.styleSheet.indexOf("#ef9a00") >= 0, "D chip amber when monitored and Pn:D active");
check(panel.widEscape.cmdYm.visible && panel.widEscape.cmdZm.visible, "Y/Z escape buttons shown");

// Release all
app.device.statusReceived.emit("<Idle|MPos:0,0,0>");
check(panel.lblMsg.text === "OK", "released again -> OK");
check(panel.lblD.styleSheet.indexOf("#e8f5e9") >= 0, "D chip green when monitored and released");

// Turn door monitoring back off -> grey again
settings.chkDoor.checked = false;
app.settingsAccepted.emit();
check(panel.lblD.styleSheet.indexOf("#eeeeee") >= 0, "D chip grey again after disabling");
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

// Click-time guards of sendEscape (audit findings)
settings.chkEscape.checked = true;
app.settingsAccepted.emit();
app.device.state = 1; app.sender.state = 4;
app.device.stateChanged.emit(1); app.sender.stateChanged.emit(4);
app.device.statusReceived.emit("<Idle|MPos:0,0,0|Pn:X>");
app.device.responseReceived.emit("$I", -100, "[VER:1.1h.20261030_ALOE_FIXED12:]; ok");
const sentBefore = sent.length;
staleTimer.fire(); // status went stale while the button was visible
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === sentBefore, "no $T sent on stale status");
app.device.statusReceived.emit("<Idle|MPos:0,0,0>"); // X released
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === sentBefore, "no $T sent for a released axis");
app.device.statusReceived.emit("<Idle|MPos:0,0,0|Pn:X>");
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === sentBefore + 1 && sent[sent.length-1] === "$TX-",
      "fresh pressed status -> $T sent again");
panel.widEscape.cmdXm.clicked.emit(); // immediate second click, same status window
check(sent.length === sentBefore + 1, "double-click within one status window sends once");
// The in-flight guard outlives the status window: a status alone must not re-arm
app.device.statusReceived.emit("<Idle|MPos:0,0,0|Pn:X>");
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === sentBefore + 1, "no re-send while the $T response is pending");
// Stale during the move -> honest "escaping" message, not "no status"
staleTimer.fire();
check(panel.lblMsg.text === "running $T escape...", "escaping message while $T runs");
// The ok closes the window; a fresh status re-arms the button
app.device.responseReceived.emit("$TX-", -100, "ok");
app.device.statusReceived.emit("<Idle|MPos:0,0,0|Pn:X>");
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === sentBefore + 2, "response + fresh status re-arm the escape button");
app.device.responseReceived.emit("$TX-", -100, "ok");

// ---- Alarm chain v2: Ctrl-X -> boot banner (-1) -> first status -> $T ----
const runtimeBefore = runtime.length;
app.device.state = 2; app.device.stateChanged.emit(2); // e.g. after ALARM:1
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:X>");
const sentAlarm = sent.length;
panel.widEscape.cmdXp.clicked.emit();
check(runtime.length === runtimeBefore + 1 && runtime[runtime.length - 1] === "\x18",
      "Alarm click sends a soft reset first");
check(sent.length === sentAlarm, "$T deferred until after the reset");
panel.widEscape.cmdXp.clicked.emit();
check(runtime.length === runtimeBefore + 1, "no second reset while the chain is pending");
check(panel.widEscape.cmdXm.enabled === false, "buttons disabled while the chain is pending");
// Candle parses the "Grbl 1.1h" boot banner -> setDeviceState(DeviceUnknown=-1).
// This -1 is caused by the plugin's OWN reset and must NOT cancel the chain
// (the FIXED8-era plugin cancelled here and never sent the $T).
app.device.state = -1; app.device.stateChanged.emit(-1);
check(sent.length === sentAlarm, "banner -1 alone does not trigger $T");
check(pendingTimer.running === true, "banner -1 does not cancel the chain");
// First post-reboot status: controller back in Alarm, pin still pressed
app.device.state = 2; app.device.stateChanged.emit(2);
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:X>");
check(sent.length === sentAlarm + 1 && sent[sent.length - 1] === "$TX+",
      "deferred $TX+ sent on the first status after the banner");
check(pendingTimer.running === false, "watchdog stopped after the send");
app.device.responseReceived.emit("$TX+", -100, "ok");

// Second chain; the switch is released while the controller reboots -> abort
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:X>");
panel.widEscape.cmdXm.clicked.emit();
check(runtime.length === runtimeBefore + 2, "second chain sends its own reset");
app.device.state = -1; app.device.stateChanged.emit(-1); // banner
app.device.state = 2; app.device.stateChanged.emit(2);
app.device.statusReceived.emit("<Alarm|MPos:0,0,0>"); // released meanwhile
check(sent.length === sentAlarm + 1, "chain aborted: axis released during the reset");
check(pendingTimer.running === false, "aborted chain stops the watchdog");

// Fallback: Candle misses the banner (no -1) - the watchdog still delivers
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:Y>");
panel.widEscape.cmdYp.clicked.emit();
check(runtime.length === runtimeBefore + 3, "third chain sends its reset");
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:Y>"); // fresh, but no banner seen
check(sent.length === sentAlarm + 1, "no $T before the banner or the watchdog");
pendingTimer.fire();
check(sent.length === sentAlarm + 2 && sent[sent.length - 1] === "$TY+",
      "watchdog fallback sends $T on a fresh valid status");
app.device.responseReceived.emit("$TY+", -100, "ok");

// Real disconnect during a chain: -1 arrives but no status ever follows
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:Z>");
panel.widEscape.cmdZm.clicked.emit();
check(runtime.length === runtimeBefore + 4, "fourth chain sends its reset");
app.device.state = -1; app.device.stateChanged.emit(-1);
pendingTimer.fire(); // watchdog expires: still -1, nothing fresh
check(sent.length === sentAlarm + 2, "chain aborted on a real disconnect");

// Idle clicks still send $T directly, no reset involved
app.device.state = 1; app.device.stateChanged.emit(1);
app.device.statusReceived.emit("<Idle|MPos:0,0,0|Pn:Y>");
panel.widEscape.cmdYm.clicked.emit();
check(sent.length === sentAlarm + 3 && sent[sent.length - 1] === "$TY-" &&
      runtime.length === runtimeBefore + 4,
      "Idle click sends $T directly without a reset");

// ---- Foreign firmware: monitoring only, never $T / Ctrl-X ----
app.device.state = -1; app.device.stateChanged.emit(-1);
app.device.state = 2; app.device.stateChanged.emit(2);
const probesBefore = probes.length;
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:X>");
check(probes.length === probesBefore + 1, "firmware re-probed after reconnect");
app.device.responseReceived.emit("$I", -100, "[VER:1.1h.20190825:]; ok");
check(panel.widEscape.visible === false, "foreign firmware: $T row hidden");
const sentFw = sent.length, runtimeFw = runtime.length;
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === sentFw && runtime.length === runtimeFw,
      "foreign firmware: click sends nothing (no Ctrl-X, no $T)");
// An ALOE $I response re-enables the buttons
app.device.responseReceived.emit("$I", -100, "[VER:1.1h.20261030_ALOE_FIXED10:]; ok");
check(panel.widEscape.visible === true, "ALOE firmware: $T row shown again");

// ---- trFill replaces every occurrence (5th-audit tooltip bug) ----
check(trFill("the %1 switch: $T%1%2", { "%1": "X", "%2": "+" }) === "the X switch: $TX+",
      "trFill replaces all placeholder occurrences");

// ---- settings: persisted in dataLocation, migrated from the legacy file ----
check("escapeButtons" in stores["/appdata/plugin_limit_monitor.ini"],
      "options persist in the dataLocation file");
delete stores["/appdata/plugin_limit_monitor.ini"]["doorSensor"];
stores[path.join(__dirname, "..") + "/settings.ini"] = { doorSensor: true };
loadOptions();
app.settingsAboutToShow.emit();
check(settings.chkDoor.checked === true,
      "legacy settings picked up when the new file lacks the key");

// ---- $I probe discipline (6th audit): error:8 is not a verdict ----
app.device.state = -1; app.device.stateChanged.emit(-1);   // real disconnect: forget identity
app.device.state = 3; app.device.stateChanged.emit(3);     // reconnect mid-job (Run)
const probesRun = probes.length;
app.device.statusReceived.emit("<Run|MPos:0,0,0|Pn:X>");
check(probes.length === probesRun, "no $I probe outside Idle/Alarm");
app.device.state = 2; app.device.stateChanged.emit(2);
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:X>");
check(probes.length === probesRun + 1, "probe sent on the first Alarm status");
const sentNull = sent.length, runtimeNull = runtime.length;
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === sentNull && runtime.length === runtimeNull,
      "unknown firmware: no Ctrl-X, no $T");
app.device.responseReceived.emit("$I", -100, "error:8");
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:X>");
check(probes.length === probesRun + 2, "probe retried after an error reply");
app.device.responseReceived.emit("$I", -100, "[VER:1.1h.20261030_ALOE_FIXED12:]; ok");
panel.widEscape.cmdXm.clicked.emit();
check(runtime.length === runtimeNull + 1, "confirmed ALOE: Alarm chain allowed again");
app.device.state = -1; app.device.stateChanged.emit(-1);   // own-chain reboot banner
app.device.state = 2; app.device.stateChanged.emit(2);
app.device.statusReceived.emit("<Alarm|MPos:0,0,0|Pn:X>");
check(sent[sent.length - 1] === "$TX-", "chain completed: identity kept across own reboot");
app.device.responseReceived.emit("$TX-", -100, "ok");

// ---- escapeInFlight watchdog: a lost $T response must not brick the UI ----
app.device.state = 1; app.device.stateChanged.emit(1);
app.device.statusReceived.emit("<Idle|MPos:0,0,0|Pn:X>");
app.device.responseReceived.emit("$I", -100, "[VER:1.1h.20261030_ALOE_FIXED12:]; ok");
const sentWd = sent.length;
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === sentWd + 1, "watchdog test: $T sent");
app.device.statusReceived.emit("<Idle|MPos:0,0,0|Pn:X>"); // response lost
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === sentWd + 1, "still locked while the response is pending");
escTimer.fire();
app.device.statusReceived.emit("<Idle|MPos:0,0,0|Pn:X>");
panel.widEscape.cmdXm.clicked.emit();
check(sent.length === sentWd + 2, "in-flight watchdog released the lock");
app.device.responseReceived.emit("$TX-", -100, "ok");

console.log(failures === 0 ? "\nALL TESTS PASSED" : "\n" + failures + " FAILURES");
process.exit(failures ? 1 : 0);
