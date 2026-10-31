# Limit switches — plugin for Candle

A compact panel that shows **in real time** which GRBL input pins are active
and **warns** you when a limit switch is pressed.

```
[X][Y][Z] [P][D]  LIMIT: X !
$T: [X-][X+]
```

* **X / Y / Z** — axis limit switches: green = released, **red = pressed**, grey = no data.
* **P** — probe pin: amber = active (informational, no alarm).
* **D** — safety door pin: grey **"not monitored"** by default. GRBL reports
  `Pn:D` only while it considers the door OPEN, and only when the firmware is
  built with `ENABLE_SAFETY_DOOR_INPUT_PIN` (disabled in stock GRBL and in
  ALOE FIXED7+), so on a machine without a door sensor a green chip would be
  a false "all ok". Enable monitoring in the plugin settings if your machine
  actually has a door sensor; then amber = open, green = closed.
* Status text: `OK` / `LIMIT: X Y !` / `no status...` / `not connected`.
* If status reports stop arriving (>2.5 s) the indicators honestly turn grey
  ("no data") instead of showing a stale state.

## $T escape buttons (ALOE FIXED7+ firmware)

While a limit switch is pressed, a `$T:` block appears with buttons for the
pressed axes only, laid out in per-axis pairs (`X-`/`X+`, `Y-`/`Y+`,
`Z-`/`Z+` on separate rows), so the panel never grows wider than the narrow
dock column even when all axes trigger at once. A button sends `$TX-`, `$TX+`, `$TY-`... —
the auto-escape command of the **ALOE FIXED7+** firmware: the axis slowly
(at `$24`) backs off the switch (up to the `$29` budget, default 10 mm), then pulls off by `$27` —
entirely inside the firmware.

* Buttons are enabled only in **Idle/Alarm** and while no program is streaming.
* In **Alarm** the button first sends a soft reset (Ctrl-X) automatically —
  required to leave the stock `ALARM:1` critical lock, which discards line
  commands until a realtime reset. The `$T` is sent on the **first status
  report after Candle sees the boot banner** (so the controller is provably
  back up); a watchdog aborts the chain if the controller never comes back,
  and the chain also aborts if the switch is released meanwhile.
* On **stock GRBL** the command is harmless: the controller replies `error:2`,
  no motion occurs.
* The buttons can be hidden on the plugin settings page.

## How it works

GRBL 1.1 includes the `Pn:` field in the status report
`<Idle|MPos:...|Pn:XYZ>` only when at least one input pin is active; the
absence of the field means everything is released. Candle polls the
controller with `?` continuously, and the plugin receives every raw report
via the `app.device.statusReceived` signal and parses `Pn:`. The plugin sends
no extra commands to the controller (except `$T` on a button click).

`Pn:` letters: `X Y Z` — limits, `P` — probe, `D` — door, `H` — hold,
`R` — reset, `S` — cycle start. `H/R/S` are shown as `Pn: ...` text.

## Installation

1. Copy the `limit_monitor` folder into the `candleplugins/` folder next to
   the Candle executable.
2. Restart Candle. The "Limit switches" panel appears among the panels.

Requires a Candle build with JS plugin support (the `candleplugins` folder,
current Denvi/Candle sources) and GRBL 1.1+ with the `Pn:` status field
enabled (`REPORT_FIELD_PIN_STATE` in config.h — enabled by default in stock
GRBL; with it compiled out the plugin cannot tell "all released" from
"not reported" and will show released pins).

### Firmware check

On every connection the plugin sends `$I` and looks for the ALOE build tag
in the reply. GRBL answers `$I` only from Idle/Alarm (elsewhere it replies
`error:8`), so the probe is sent only in those states and is retried until
a real `[VER:...]` reply arrives — an error reply is never mistaken for a
verdict. The `$T` buttons and the Alarm-state Ctrl-X chain are enabled only
after the ALOE firmware is **confirmed**; on a foreign or still-unknown
firmware the plugin only monitors the pins (the identity survives the
chain's own Ctrl-X reboot, but not a real disconnect). While a `$T` escape
is running GRBL (like stock homing) does not answer `?` polls, so the panel
shows an explicit *"running $T escape..."* message instead of "no status";
a lost `$T` response unlocks the buttons by a 90 s watchdog. Verified with
ALOE FIXED12.

## Settings

* **Show $T escape buttons** (default on).
* **Monitor the safety door pin (Pn:D)** (default off — see the **D** chip
  note above).

Stored in Candle's data directory as `plugin_limit_monitor.ini`
(`QStandardPaths::AppDataLocation` — writable even when Candle is installed
under `C:\Program Files`). An old `limit_monitor/settings.ini` from previous
versions is read once as a fallback, so the options migrate automatically.

## Files

| File | Purpose |
|---|---|
| `config.ini` | plugin metadata (title, name) |
| `script.js` | logic (QtScript) |
| `widget.ui` | panel (Qt Designer form) |
| `settings.ui` | settings page |
| `translation_ru.ts/.qm` | Russian translation |
| `tests/harness.js` | offline logic tests (node tests/harness.js) |
