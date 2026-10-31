// "Limit switches" plugin for Candle (candleplugins / QtScript API).
//
// Shows in real time which GRBL input pins are active, based on the
// "Pn:" field of GRBL 1.1 status reports (<Idle|MPos:...|Pn:XYZ>).
// GRBL includes the Pn: field only when at least one pin is active,
// so the absence of the field means "everything released" - this is
// exactly how the indicators are driven.
//
// Extra (optional): when a limit switch is pressed, the panel offers
// $TX-/$TX+/... buttons - the auto-escape command of the ALOE FIXED7+
// firmware (FIXED7+). On stock GRBL the command is harmless (error:2, no motion).
//
// Structure and host API follow the official candleplugins examples
// and the spindle_laser plugin (config.ini + script.js + widget.ui).

script.importExtension("qt.core");
script.importExtension("qt.gui");
script.importExtension("qt.widgets");
script.importExtension("qt.uitools");

// qsTr is installed by Candle (QScriptEngine::installTranslatorFunctions);
// keep a fallback so the script also runs on hosts without it.
if (typeof qsTr == "undefined") qsTr = function(s) { return s; };

// Vars ---------------------------------------------------------------

var pluginPath = script.path;
var pluginName = script.name;
var designerPluginsPath = app.path + "/designerplugins";
var loader = new QUiLoader();

var uiPanel = null;
var uiSettings = null;

// Children of the widEscape container. The QtScript QObject wrapper only
// resolves DIRECT children by name (uiPanel.cmdXm is undefined because the
// buttons live inside widEscape), so the references are captured once at
// panel creation time via uiPanel.widEscape.<name>.
var widEscape = null;
var escButtons = null; // [["X", btnMinus, btnPlus], ...]

// One escape command per status window: set on send, cleared by the next
// status report / device state event. Blocks accidental double-clicks;
// the firmware additionally no-ops repeats ([MSG:Disabled] on a released
// axis).
var escapeSent = false;

// A $T command was sent and its ok/error response has not arrived yet.
// Unlike escapeSent (re-armed by every status report), this flag is cleared
// only by the actual response - or by a disconnect (5th-audit hardening).
var escapeInFlight = false;

// Firmware identification: null = unknown, true = ALOE fork ($I contains
// "ALOE_FIXED"), false = foreign firmware. The $T buttons and the Alarm
// Ctrl-X chain are suppressed when the firmware is known to be foreign -
// a plain limit monitor must never soft-reset somebody else's controller.
var fwAloe = null;
var fwProbeSent = false;

// Escape requested while in Alarm: the stock ALARM:1 critical lock discards
// line commands until a realtime reset, so the button first sends Ctrl-X.
// Candle then parses the "Grbl 1.1h" boot banner (frmMain::dataIsReset) and
// flips the device state to -1 (DeviceUnknown) - INCLUDING for the reset this
// plugin itself sent. The chain records that -1 as "reboot seen" and sends
// the stored $T on the FIRST status report after it (the controller is
// provably back up). The timer is only a watchdog: if the banner never
// reaches us it falls back to one timed validation, and a real disconnect
// (state stays -1, no statuses) makes that validation fail and abort.
var pendingEscape = null; // { axis: "X", dir: "+", resetSeen: bool }
var ESCAPE_CHAIN_TIMEOUT_MS = 3000;
var pendingTimer = new QTimer();
pendingTimer.singleShot = true;

// Host state (DeviceState/SenderState enums of frmMain)
var DEVICE_IDLE = 1;
var DEVICE_ALARM = 2;
var SENDER_STOPPED = 4;

var deviceState = -1;
var senderState = -1;

// Pin state
var pins = "";          // letters from the last Pn: field, "" = none
var statusSeen = false; // at least one status report received
var stale = true;       // no fresh status report lately

// Options (persisted in <plugin>/settings.ini)
var optEscape = true;   // show $T escape buttons
var optDoor = false;    // treat the safety-door pin as monitored (machine
                        // actually has a door sensor; see updateUi comment)

// Status reports are polled continuously by Candle; if none arrives
// within this time the indicators fall back to "unknown".
var STALE_MS = 2500;
var staleTimer = new QTimer();
staleTimer.singleShot = true;

// Watchdog for escapeInFlight: if the ok/error response to $T is lost
// (6th audit), release the lock instead of blocking the buttons until a
// reconnect. 90 s covers a slow escape (low $24, large $29) with margin.
var ESCAPE_INFLIGHT_TIMEOUT_MS = 90000;
var escTimer = new QTimer();
escTimer.singleShot = true;

// Styles for the pin "chips"
var STYLE_ON_LIMIT = "QLabel { background: #d32f2f; color: white; border: 1px solid #8e0000; border-radius: 3px; font-weight: bold; }";
var STYLE_ON_INFO = "QLabel { background: #ef9a00; color: white; border: 1px solid #a66a00; border-radius: 3px; font-weight: bold; }";
var STYLE_OFF = "QLabel { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; border-radius: 3px; }";
var STYLE_UNKNOWN = "QLabel { background: #eeeeee; color: #9e9e9e; border: 1px solid #bdbdbd; border-radius: 3px; }";

var STYLE_MSG_ALARM = "QLabel { color: #d32f2f; font-weight: bold; }";
var STYLE_MSG_OK = "QLabel { color: #2e7d32; }";
var STYLE_MSG_DIM = "QLabel { color: #9e9e9e; }";
var STYLE_MSG_INFO = "QLabel { color: #b36b00; }";

// Helpers --------------------------------------------------------------

function trFill(text, map)
{
    // split/join, NOT String.replace: the templates repeat placeholders
    // ("sends $T%1%2" after "the %1 switch") and replace() only substitutes
    // the first occurrence (5th-audit find: tooltips showed a literal $T%1%2).
    var s = String(text);
    for (var k in map) s = s.split(k).join(String(map[k]));
    return s;
}

// Connect a host signal only if this Candle build exposes it.
function connectSignal(sig, fn)
{
    try {
        if (sig && sig.connect) { sig.connect(fn); return true; }
    } catch (e) {
    }
    return false;
}

function toBool(v, def)
{
    if (v === undefined || v === null) return def;
    if (v === true || v === "true" || v === 1 || v === "1") return true;
    if (v === false || v === "false" || v === 0 || v === "0") return false;
    return def;
}

// Settings live in Candle's writable data directory (app.dataLocation =
// QStandardPaths::AppDataLocation). The old location - settings.ini inside
// the plugin folder - is read once as a fallback: under C:\Program Files
// the plugin folder is not writable and the old file silently never
// persisted (5th-audit find).
function settingsFile()
{
    var dir = "";
    try { dir = String(app.dataLocation); } catch (e) {}
    if (!dir) return new QSettings(pluginPath + "/settings.ini", QSettings.IniFormat);
    return new QSettings(dir + "/plugin_limit_monitor.ini", QSettings.IniFormat);
}

function legacySettingsFile()
{
    return new QSettings(pluginPath + "/settings.ini", QSettings.IniFormat);
}

function loadOptions()
{
    try {
        var s = settingsFile();
        var legacy = legacySettingsFile();
        optEscape = toBool(s.value("escapeButtons", legacy.value("escapeButtons", true)), true);
        optDoor = toBool(s.value("doorSensor", legacy.value("doorSensor", false)), false);
    } catch (e) {
    }
}

function saveOptions()
{
    try {
        var s = settingsFile();
        s.setValue("escapeButtons", optEscape);
        s.setValue("doorSensor", optDoor);
        s.sync();
    } catch (e) {
    }
}

// Current host state; properties are always fresh, signals just trigger
// UI updates.
function readStates()
{
    try {
        var d = app.device.state;
        if (d !== undefined && d !== null) deviceState = d;
    } catch (e) {
    }
    try {
        var s = app.sender.state;
        if (s !== undefined && s !== null) senderState = s;
    } catch (e) {
    }
}

function connected()
{
    return deviceState != -1;
}

function pinActive(letter)
{
    return pins.indexOf(letter) != -1;
}

function limitAxes()
{
    var a = [];
    if (pinActive("X")) a.push("X");
    if (pinActive("Y")) a.push("Y");
    if (pinActive("Z")) a.push("Z");
    return a;
}

// $T escape is allowed by the firmware in IDLE or ALARM, and only when
// the sender is not streaming a program.
function escapeReady()
{
    return (deviceState == DEVICE_IDLE || deviceState == DEVICE_ALARM) &&
           senderState == SENDER_STOPPED;
}

// UI update -------------------------------------------------------------

function setChip(lbl, active, unknown, styleActive, tip)
{
    if (!lbl) return;
    lbl.styleSheet = unknown ? STYLE_UNKNOWN : (active ? styleActive : STYLE_OFF);
    lbl.toolTip = tip;
}

function updateUi()
{
    if (!uiPanel) return;

    readStates();

    var unknown = !connected() || !statusSeen || stale;
    var axes = limitAxes();
    var anyLimit = axes.length > 0 && !unknown;

    // Pin chips: X/Y/Z limits (red), P probe / D door (amber info)
    var st = unknown ? qsTr("no data") : qsTr("released");
    setChip(uiPanel.lblX, pinActive("X"), unknown, STYLE_ON_LIMIT,
            trFill(qsTr("X limit switch: %1"), { "%1": pinActive("X") && !unknown ? qsTr("PRESSED") : st }));
    setChip(uiPanel.lblY, pinActive("Y"), unknown, STYLE_ON_LIMIT,
            trFill(qsTr("Y limit switch: %1"), { "%1": pinActive("Y") && !unknown ? qsTr("PRESSED") : st }));
    setChip(uiPanel.lblZ, pinActive("Z"), unknown, STYLE_ON_LIMIT,
            trFill(qsTr("Z limit switch: %1"), { "%1": pinActive("Z") && !unknown ? qsTr("PRESSED") : st }));
    setChip(uiPanel.lblP, pinActive("P"), unknown, STYLE_ON_INFO,
            trFill(qsTr("Probe pin: %1"), { "%1": pinActive("P") && !unknown ? qsTr("ACTIVE") : st }));
    // Door pin: GRBL includes "D" in Pn: only when it considers the door
    // OPEN, and only if the firmware was built with
    // ENABLE_SAFETY_DOOR_INPUT_PIN (disabled in stock config.h and in
    // ALOE FIXED7+). The plugin cannot tell "door closed" from "no door
    // sensor at all", so unless the user confirms in the settings that the
    // machine has a sensor, the chip stays grey "not monitored" instead of
    // a false green "all ok".
    if (!optDoor) {
        setChip(uiPanel.lblD, false, true, STYLE_ON_INFO,
                qsTr("Door pin: not monitored. Enable it in the plugin settings if the machine has a door sensor (the firmware must be built with ENABLE_SAFETY_DOOR_INPUT_PIN)."));
    } else {
        setChip(uiPanel.lblD, pinActive("D"), unknown, STYLE_ON_INFO,
                trFill(qsTr("Door pin: %1 (GRBL reports it only while it considers the door OPEN)"), { "%1": pinActive("D") && !unknown ? qsTr("ACTIVE") : st }));
    }

    // Message
    if (!connected()) {
        uiPanel.lblMsg.text = qsTr("not connected");
        uiPanel.lblMsg.styleSheet = STYLE_MSG_DIM;
    } else if (unknown) {
        // During the $T motion the firmware (like stock homing) does not
        // answer ? polls, so the status goes stale by design - say what is
        // actually happening instead of a confusing "no status".
        uiPanel.lblMsg.text = escapeInFlight ? qsTr("running $T escape...")
                                             : qsTr("no status...");
        uiPanel.lblMsg.styleSheet = escapeInFlight ? STYLE_MSG_INFO : STYLE_MSG_DIM;
    } else if (anyLimit) {
        uiPanel.lblMsg.text = trFill(qsTr("LIMIT: %1 !"), { "%1": axes.join(" ") });
        uiPanel.lblMsg.styleSheet = STYLE_MSG_ALARM;
    } else if (pins.length > 0) {
        // Only non-limit pins (P/D/H/R/S) are active: informational amber,
        // not the green "all clear" (an open door is not "OK").
        uiPanel.lblMsg.text = "Pn: " + pins;
        uiPanel.lblMsg.styleSheet = STYLE_MSG_INFO;
    } else {
        uiPanel.lblMsg.text = qsTr("OK");
        uiPanel.lblMsg.styleSheet = STYLE_MSG_OK;
    }

    // Raw report as panel tooltip. When the status is unknown (disconnected,
    // stale, nothing received yet) say so honestly instead of implying that
    // all pins are released.
    uiPanel.lblMsg.toolTip = unknown
        ? qsTr("Status unavailable")
        : (pins.length > 0 ? "Pn: " + pins
                           : qsTr("GRBL reports no active input pins"));

    // Escape row ($T buttons of the ALOE FIXED7+ firmware)
    if (!widEscape) return;
    var showEscape = optEscape && anyLimit && connected() && fwAloe !== false;
    widEscape.visible = showEscape;
    if (showEscape && escButtons) {
        var ready = escapeReady();
        var axBtns = escButtons;
        for (var i = 0; i < axBtns.length; i++) {
            var ax = axBtns[i][0];
            var pressed = pinActive(ax);
            for (var j = 1; j <= 2; j++) {
                var btn = axBtns[i][j];
                if (!btn) continue;
                var dir = (j == 1) ? "-" : "+";
                btn.visible = pressed;
                btn.enabled = pressed && ready && !pendingEscape && !escapeInFlight && fwAloe === true;
                btn.toolTip = ready
                    ? trFill(qsTr("Escape from the %1 switch towards %2: sends $T%1%2 (ALOE FIXED7+ firmware: slow move up to the $29 budget, default 10 mm, + pull-off, done in firmware). In Alarm the button first sends a soft reset (Ctrl-X) to leave the hard-limit critical lock."),
                             { "%1": ax, "%2": dir })
                    : qsTr("Available in Idle/Alarm state when no program is running");
            }
        }
    }
}

// Host event handlers -----------------------------------------------------

function onAppDeviceStateChanged(state)
{
    deviceState = state;
    escapeSent = false;
    if (state == -1) {
        // -1 arrives both on a real disconnect AND when Candle parses the
        // "Grbl" boot banner after a reset - including the soft reset this
        // plugin itself sends in the Alarm chain. While a chain is pending,
        // -1 is the expected reboot marker: record it and keep waiting for
        // the first fresh status. A real disconnect is caught by the
        // watchdog timer (its validation fails while the state stays -1).
        if (pendingEscape) {
            pendingEscape.resetSeen = true;
        } else {
            pendingTimer.stop();
        }
        escapeInFlight = false; // no response will come across a reset/disconnect
        escTimer.stop();
        fwProbeSent = false;    // re-identify the firmware after reboot/reconnect
        // Our own Alarm-chain Ctrl-X reboots a controller we have just
        // verified - keep the identity so the chain can finish; a real
        // disconnect means the controller may have been swapped: forget it.
        if (!pendingEscape) { fwAloe = null; }
        // Status unknown either way: forget everything we knew about the pins
        pins = "";
        statusSeen = false;
        stale = true;
        staleTimer.stop();
    }
    updateUi();
}

function onAppSenderStateChanged(state)
{
    senderState = state;
    updateUi();
}

// Raw GRBL status report: "<Idle|MPos:0.000,...|Pn:XZ|FS:0,0>"
function onAppStatusReceived(status)
{
    var m = /Pn:([A-Za-z]*)/.exec(String(status));
    var p = m ? m[1].toUpperCase() : "";

    pins = p;
    statusSeen = true;
    escapeSent = false;
    stale = false;
    staleTimer.stop();
    staleTimer.start(STALE_MS);
    // One firmware probe per connection: ask $I and look for the ALOE build
    // tag in the response (handled in onAppResponseReceived). GRBL answers
    // $I only from Idle/Alarm - everywhere else (Run/Hold/Jog/Door) the
    // reply is error:8, which must not be mistaken for "foreign firmware"
    // (6th audit). So probe only in those states; error replies re-arm the
    // probe for a later status.
    if (!fwProbeSent && optEscape &&
        (app.device.state == 1 || app.device.state == 2)) {
        fwProbeSent = true;
        try { app.device.sendCommand("$I", -100, false); } catch (e) {}
    }
    // Second half of the Alarm chain: the first status after the reboot
    // banner proves the controller is back up - decide right now instead of
    // guessing with a fixed delay. Statuses that arrive before the banner
    // (still in flight from before the reset) are ignored on purpose.
    if (pendingEscape && pendingEscape.resetSeen) {
        finishPendingEscape(); // calls updateUi() itself
        return;
    }
    updateUi();
}

// Line responses to commands (frmMain::responseReceived, wired to every
// plugin). Used to close the $T in-flight window by the actual ok/error and
// to parse the $I probe.
function onAppResponseReceived(command, index, response)
{
    var cmd = String(command);
    if (cmd.indexOf("$T") == 0) {
        escapeInFlight = false;
        escTimer.stop();
        updateUi();
        return;
    }
    if (cmd == "$I") {
        var r = String(response);
        if (r.indexOf("[VER:") >= 0) {
            // A real build-info reply: now the verdict is trustworthy.
            fwAloe = r.indexOf("ALOE_FIXED") >= 0;
        } else {
            // error:8 (not Idle/Alarm) or similar - no verdict; retry on a
            // later status in a probe-friendly state.
            fwProbeSent = false;
        }
        updateUi();
    }
}

// The $T response never arrived (lost line, host glitch): release the
// in-flight lock so the buttons do not stay dead until a reconnect.
function onEscInFlightTimeout()
{
    escTimer.stop();
    if (escapeInFlight) {
        escapeInFlight = false;
        updateUi();
    }
}

function onStaleTimeout()
{
    stale = true;
    updateUi();
}

// Escape buttons ------------------------------------------------------------

function sendEscape(axis, dir)
{
    // Re-validate everything at click time (defense in depth: the firmware
    // itself also refuses - [MSG:Disabled] no-op for a released axis,
    // error:8 while running, error:5 with $28=0).
    if (escapeSent || escapeInFlight || pendingEscape) return; // one command/chain at a time
    if (fwAloe !== true) return; // $T/Ctrl-X only on a confirmed ALOE firmware
    readStates();
    if (!connected() || !statusSeen || stale) return;
    if (!pinActive(axis)) return;
    if (!escapeReady()) return;
    if (deviceState == DEVICE_ALARM) {
        // ALARM may be the stock ALARM:1 critical lock, which discards line
        // commands until a realtime reset. Send Ctrl-X now; the $T goes out
        // on the first status report after Candle sees the boot banner (a
        // soft reset in Alarm is always safe: no motion is running -
        // senderState is checked above).
        pendingEscape = { axis: axis, dir: dir, resetSeen: false };
        escapeSent = true;
        try {
            app.device.sendRuntimeCommand("\x18");
        } catch (e) {
            pendingEscape = null;
            escapeSent = false;
            return;
        }
        pendingTimer.start(ESCAPE_CHAIN_TIMEOUT_MS); // watchdog, not the trigger
        updateUi();
        return;
    }
    escapeSent = true;
    escapeInFlight = true;
    escTimer.stop();
    escTimer.start(ESCAPE_INFLIGHT_TIMEOUT_MS);
    app.device.sendCommands("$T" + axis + dir);
}

// Second half of the Alarm chain: re-validate against the fresh state and
// send the stored $T command - or abort (switch released during the reboot,
// device gone, sender busy). Called from the first post-banner status report
// (normal path) and from the watchdog timer (fallback path).
function finishPendingEscape()
{
    var p = pendingEscape;
    pendingEscape = null;
    pendingTimer.stop();
    escapeSent = false;
    if (!p) { updateUi(); return; }
    readStates();
    if (connected() && statusSeen && !stale && fwAloe === true &&
        pinActive(p.axis) && escapeReady()) {
        escapeSent = true;
        escapeInFlight = true;
        escTimer.stop();
        escTimer.start(ESCAPE_INFLIGHT_TIMEOUT_MS);
        app.device.sendCommands("$T" + p.axis + p.dir);
    }
    updateUi();
}

// Watchdog: the boot banner (or the first status after it) never arrived in
// time. Candle missed the banner -> the validation passes and the $T is sent
// anyway; real disconnect -> the validation fails and the chain aborts.
function onPendingEscapeTimeout() { finishPendingEscape(); }

function onXmClicked() { sendEscape("X", "-"); }
function onXpClicked() { sendEscape("X", "+"); }
function onYmClicked() { sendEscape("Y", "-"); }
function onYpClicked() { sendEscape("Y", "+"); }
function onZmClicked() { sendEscape("Z", "-"); }
function onZpClicked() { sendEscape("Z", "+"); }

// Settings page -----------------------------------------------------------

function onAppSettingsAboutToShow()
{
    if (!uiSettings) return;
    uiSettings.chkEscape.checked = optEscape;
    uiSettings.chkDoor.checked = optDoor;
}

function onAppSettingsAccepted()
{
    if (!uiSettings) return;
    optEscape = uiSettings.chkEscape.checked;
    optDoor = uiSettings.chkDoor.checked;
    saveOptions();
    updateUi();
}

function onAppSettingsDefault()
{
    if (!uiSettings || !uiSettings.visible) return;
    uiSettings.chkEscape.checked = true;
    uiSettings.chkDoor.checked = false;
}

// Plugin entry points --------------------------------------------------------

function init()
{
    loader.setWorkingDirectory(new QDir(pluginPath));
    loader.addPluginPath(designerPluginsPath);

    loadOptions();

    staleTimer.timeout.connect(onStaleTimeout);
    pendingTimer.timeout.connect(onPendingEscapeTimeout);
    escTimer.timeout.connect(onEscInFlightTimeout);

    connectSignal(app.device.stateChanged, onAppDeviceStateChanged);
    connectSignal(app.sender.stateChanged, onAppSenderStateChanged);
    connectSignal(app.device.statusReceived, onAppStatusReceived);
    connectSignal(app.device.responseReceived, onAppResponseReceived);

    connectSignal(app.settingsAboutToShow, onAppSettingsAboutToShow);
    connectSignal(app.settingsAccepted, onAppSettingsAccepted);
    connectSignal(app.settingsSetByDefault, onAppSettingsDefault);
}

function createPanelWidget()
{
    var f = new QFile(pluginPath + "/widget.ui");
    if (f.open(QIODevice.ReadOnly)) {
        uiPanel = loader.load(f);
        f.close();
        // Defensive: a damaged/incompatible form must not throw out of the
        // plugin entry point (4th-audit hardening).
        if (!uiPanel || !uiPanel.widEscape || !uiPanel.lblMsg) {
            uiPanel = null;
            return null;
        }

        // The $T buttons are nested inside widEscape: resolve them through
        // the container (direct-children-only lookup in QtScript).
        widEscape = uiPanel.widEscape;
        escButtons = [["X", widEscape.cmdXm, widEscape.cmdXp],
                      ["Y", widEscape.cmdYm, widEscape.cmdYp],
                      ["Z", widEscape.cmdZm, widEscape.cmdZp]];

        widEscape.cmdXm.clicked.connect(onXmClicked);
        widEscape.cmdXp.clicked.connect(onXpClicked);
        widEscape.cmdYm.clicked.connect(onYmClicked);
        widEscape.cmdYp.clicked.connect(onYpClicked);
        widEscape.cmdZm.clicked.connect(onZmClicked);
        widEscape.cmdZp.clicked.connect(onZpClicked);

        widEscape.visible = false;

        updateUi();
    }
    return uiPanel;
}

function createWindowWidget()
{
}

function createSettingsWidget()
{
    var f = new QFile(pluginPath + "/settings.ui");
    if (f.open(QIODevice.ReadOnly)) {
        uiSettings = loader.load(f);
        f.close();
        if (!uiSettings || !uiSettings.chkEscape) { uiSettings = null; }
    }
    return uiSettings;
}
