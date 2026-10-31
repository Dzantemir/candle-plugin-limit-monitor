# Limit switches — real-time limit switch monitor plugin for Candle

[Русская версия](README.ru.md)

A compact Candle panel that shows **in real time** which GRBL input pins are
active and **warns** you the moment a limit switch is pressed — colored
per-axis indicators and a clear red warning line. When a
switch is pressed, the panel can also offer one-click `$T` escape buttons for
the [ALOE FIXED7+](#t-escape-buttons-aloe-fixed7-firmware) firmware.

```
[X][Y][Z] [P][D]      <- pin indicators
LIMIT: X !            <- warning line
$T: [X-][X+]          <- escape buttons (pressed axes only)
```

<img width="229" height="137" alt="panel" src="https://github.com/user-attachments/assets/23538c62-f449-46b8-a5fd-6cbbba7c55fb" />

## What it shows

| Indicator | Meaning |
|---|---|
| **X / Y / Z** | axis limit switches: green = released, **red = pressed**, grey = no data |
| **P** | probe pin active (amber, informational — no alarm) |
| **D** | safety door pin: grey "not monitored" unless enabled in the settings (GRBL reports `Pn:D` only while it considers the door OPEN and only with `ENABLE_SAFETY_DOOR_INPUT_PIN` built in, so a green chip without a real sensor would be a false "all ok") |
| status line | `OK` / `LIMIT: X Y !` / `no status...` / `not connected` |

Extra behavior:

* `H`/`R`/`S` pins (hold / reset / cycle start) are shown as a `Pn: ...` text line;
* **no stale lies**: if status reports stop arriving for more than 2.5 s, or
  the port is closed, all indicators turn grey ("no data") instead of showing
  the last known state.

## $T escape buttons (ALOE FIXED7+ firmware)

While a limit switch is pressed, a `$T:` block appears with buttons **only for
the pressed axes**, laid out in per-axis pairs (`X-`/`X+`, `Y-`/`Y+`, `Z-`/`Z+`
on separate rows) so the panel fits the narrow dock column even when all axes
trigger at once. A click sends `$TX-`, `$TX+`, `$TY-`, ... —
the auto-escape command of the ALOE FIXED7+ GRBL fork: the axis slowly backs
off the switch at the homing feed rate `$24` (up to the `$29` budget, default 10 mm), then pulls off by
`$27` — the whole move runs inside the firmware, no jogging involved.

* The buttons are enabled only in **Idle/Alarm** state and while no g-code
  program is streaming (same readiness gating as the official plugins).
* In **Alarm** the button first sends a soft reset (Ctrl-X) automatically —
  required to leave the stock `ALARM:1` critical lock, which discards line
  commands until a realtime reset. The `$T` is sent on the **first status
  report after Candle sees the boot banner** (the controller is provably back
  up); a watchdog aborts the chain if the controller never comes back, and
  the chain also aborts if the switch is released meanwhile.
* On **stock GRBL** the command is harmless: the controller replies `error:2`
  and nothing moves.
* The whole row can be hidden on the plugin settings page.

## How it works

GRBL 1.1 includes the `Pn:` field in its status reports
(`<Idle|MPos:...|Pn:XYZ|...>`) only when at least one input pin is active;
no `Pn:` field means every pin is released. Candle already polls the
controller with `?` continuously, and this plugin receives every raw report
through the `app.device.statusReceived` signal and parses the `Pn:` field.

The plugin sends **no commands of its own** to the controller — the serial
traffic stays exactly as it was (the only exceptions are `$T...` when you
click an escape button, and the Ctrl-X soft reset sent as the first step of
the escape chain from Alarm).

## Installation

1. Copy the `limit_monitor` folder into the `candleplugins/` folder next to
   the Candle executable.
2. Restart Candle. The "Limit switches" panel appears among the panels
   (enable it in the **View** menu if hidden).

## Requirements

* a current Candle build with JS plugin support — the `candleplugins` folder
  and the `app.device.statusReceived` script signal (current Denvi/Candle
  sources);
* **GRBL 1.1+** — the `Pn:` status report field format, with
  `REPORT_FIELD_PIN_STATE` enabled in config.h (default in stock GRBL;
  compiled out, the plugin cannot tell "all released" from "not reported");
* hard limits (`$21`) are **not** required: `Pn:` reports the physical pin
  state regardless of `$5`/`$21`/`$10` settings;
* the `$T` buttons are useful with the ALOE FIXED7+ firmware only (harmless
  elsewhere).

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

Plugin page in Candle settings:

* **Show $T escape buttons (ALOE FIXED7+ firmware)** (default: on).
* **Monitor the safety door pin (Pn:D)** (default: off) — enable only if the
  machine actually has a door sensor and the firmware was built with
  `ENABLE_SAFETY_DOOR_INPUT_PIN`; then amber = open, green = closed.

Stored in Candle's data directory as `plugin_limit_monitor.ini`
(`QStandardPaths::AppDataLocation` — writable even when Candle is installed
under `C:\Program Files`). An old `limit_monitor/settings.ini` from previous
versions is read once as a fallback, so the options migrate automatically.

## Development

The plugin is plain QtScript + Qt Designer forms — no compilation. The logic
(status parsing, indicator state machine, `$T` readiness
gating, settings round-trip) is covered by an offline test harness that stubs
the Candle host API, including its direct-children-only widget name lookup:

```
node tests/harness.js
```

Russian UI translation: `translation_ru.ts` (source) / `translation_ru.qm`
(compiled, loaded by Candle automatically when the interface language is
Russian). Rebuild with `lrelease translation_ru.ts -qm translation_ru.qm`.

## License

GPL-3.0 — see [LICENSE](LICENSE).
