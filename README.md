# Limit switches — real-time limit switch monitor plugin for Candle

[Русская версия](README.ru.md)

A compact Candle panel that shows **in real time** which GRBL input pins are
active and **warns** you the moment a limit switch is pressed — colored
per-axis indicators, a clear red warning line and an optional beep. When a
switch is pressed, the panel can also offer one-click `$T` escape buttons for
the [ALOE FIXED7](#t-escape-buttons-aloe-fixed7-firmware) firmware.

```
[X][Y][Z] [P][D]      <- pin indicators
LIMIT: X !            <- warning line
$T: [X-][X+]          <- escape buttons (pressed axes only)
```

<img width="229" height="137" alt="{52F62AF7-1828-459F-BBA1-036FE14273E7}" src="https://github.com/user-attachments/assets/23538c62-f449-46b8-a5fd-6cbbba7c55fb" />


## What it shows

| Indicator | Meaning |
|---|---|
| **X / Y / Z** | axis limit switches: green = released, **red = pressed**, grey = no data |
| **P** | probe pin active (amber, informational — no alarm) |
| **D** | safety door pin active (amber, informational) |
| status line | `OK` / `LIMIT: X Y !` / `no status...` / `not connected` |

Extra behavior:

* a **beep** on the released → pressed edge of any limit switch (one beep per
  event, re-armed after release; can be disabled in settings);
* `H`/`R`/`S` pins (hold / reset / cycle start) are shown as a `Pn: ...` text line;
* **no stale lies**: if status reports stop arriving for more than 2.5 s, or
  the port is closed, all indicators turn grey ("no data") instead of showing
  the last known state.

## $T escape buttons (ALOE FIXED7 firmware)

While a limit switch is pressed, a `$T:` row appears with buttons **only for
the pressed axes** (`X-`/`X+`, ...). A click sends `$TX-`, `$TX+`, `$TY-`, ... —
the auto-escape command of the ALOE FIXED7 GRBL fork: the axis slowly backs
off the switch at the homing feed rate `$24` (up to 10 mm), then pulls off by
`$27` — the whole move runs inside the firmware, no jogging involved.

* The buttons are enabled only in **Idle/Alarm** state and while no g-code
  program is streaming (same readiness gating as the official plugins).
* On **stock GRBL** the command is harmless: the controller replies `error:3`
  and nothing moves.
* The whole row can be hidden on the plugin settings page.

## How it works

GRBL 1.1 includes the `Pn:` field in its status reports
(`<Idle|MPos:...|Pn:XYZ|...>`) only when at least one input pin is active;
no `Pn:` field means every pin is released. Candle already polls the
controller with `?` continuously, and this plugin receives every raw report
through the `app.device.statusReceived` signal and parses the `Pn:` field.

The plugin sends **no commands of its own** to the controller — the serial
traffic stays exactly as it was (the only exception is `$T...` when you click
an escape button).

## Installation

1. Copy the `limit_monitor` folder into the `candleplugins/` folder next to
   the Candle executable.
2. Restart Candle. The "Limit switches" panel appears among the panels
   (enable it in the **View** menu if hidden).

## Requirements

* a current Candle build with JS plugin support — the `candleplugins` folder
  and the `app.device.statusReceived` script signal (current Denvi/Candle
  sources);
* **GRBL 1.1+** — the `Pn:` status report field format;
* hard limits (`$21`) are **not** required: `Pn:` reports the physical pin
  state regardless of `$5`/`$21`/`$10` settings;
* the `$T` buttons are useful with the ALOE FIXED7 firmware only (harmless
  elsewhere).

## Settings

Plugin page in Candle settings:

* **Beep when a limit switch becomes active** (default: on);
* **Show $T escape buttons (ALOE FIXED7 firmware)** (default: on).

Stored in `limit_monitor/settings.ini`.

## Development

The plugin is plain QtScript + Qt Designer forms — no compilation. The logic
(status parsing, indicator state machine, beep edge detection, `$T` readiness
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
