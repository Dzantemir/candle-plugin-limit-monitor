# Метаданные для GitHub (не коммитить — шпаргалка)

## Имя репозитория

```
candle-plugin-limit-monitor
```

(в одном стиле с `candle-plugin-stk500-flasher` и `candle-spindle-laser-switcher`)

## About (описание репозитория)

Английский (рекомендуется для About, 243 символа):

```
Compact Candle GRBL plugin: real-time limit switch monitor. Per-axis X/Y/Z pin indicators from the Pn: status field, probe/door pins, beep + red warning when a switch trips, optional one-click $T escape buttons (ALOE FIXED7 firmware).
```

Короткий вариант (если нужен лаконичнее):

```
Real-time GRBL limit switch monitor panel for Candle: X/Y/Z pin indicators, beep + warning on trip, optional $T auto-escape buttons.
```

Русский вариант:

```
Компактный плагин Candle для GRBL: мониторинг концевиков в реальном времени. Индикаторы X/Y/Z по полю Pn: статус-репорта, входы щупа/дверцы, звук и красное предупреждение при срабатывании, кнопки съезда $T (прошивка ALOE FIXED7).
```

Поле Website в About: можно оставить пустым или указать
`https://github.com/Denvi/Candle`.

## Topics (теги)

Основные (в порядке важности, GitHub рекомендует до 20):

```
candle
grbl
cnc
limit-switch
endstop
cnc-controller
gcode
plugin
qtscript
qt
monitoring
real-time
machine-safety
grbl-plugin
candle-plugin
hobby-cnc
cnc3018
arduino
```

Минимальный набор, если хочется короче:

```
candle grbl cnc limit-switch plugin qtscript monitoring candle-plugin
```

## Раздел Releases (заготовка для v1)

Tag: `v1`
Title: `v1 — initial release`

Текст:

```
First public release.

- Real-time X/Y/Z limit switch indicators driven by the Pn: field of GRBL 1.1
  status reports (via the app.device.statusReceived plugin signal).
- Probe (P) and door (D) pin indicators (informational).
- Beep + red warning line on the released -> pressed edge of any limit switch.
- Stale-data honesty: indicators turn grey when status reports stop arriving.
- Optional one-click $T escape buttons for the ALOE FIXED7 firmware
  (Idle/Alarm only, hidden while a program is streaming; harmless error:3 on
  stock GRBL).
- Russian translation, settings page, offline test harness (node tests/harness.js).
```

## Скриншот

В README закомментирован блок `docs/screenshot.png` — сделайте снимок панели
(лучше два состояния: всё отпущено и нажат X с видимой строкой $T), положите
в `docs/screenshot.png` и раскомментируйте строку в обоих README.
