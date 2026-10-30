<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE TS>
<TS version="2.1" language="ru_RU">
<context>
    <message>
        <source>ACTIVE</source>
        <translation>АКТИВЕН</translation>
    </message>
    <message>
        <source>Available in Idle/Alarm state when no program is running</source>
        <translation>Доступно в состоянии Idle/Alarm, когда программа не выполняется</translation>
    </message>
    <message>
        <source>Door pin: %1 (GRBL reports it only while it considers the door OPEN)</source>
        <translation>Вход Door (дверца): %1 (GRBL сообщает о нём, только пока считает дверь ОТКРЫТОЙ)</translation>
    </message>
    <message>
        <source>Door pin: not monitored. Enable it in the plugin settings if the machine has a door sensor (the firmware must be built with ENABLE_SAFETY_DOOR_INPUT_PIN).</source>
        <translation>Вход Door (дверца): не отслеживается. Включите в настройках плагина, если на станке есть датчик двери (прошивка должна быть собрана с ENABLE_SAFETY_DOOR_INPUT_PIN).</translation>
    </message>
    <message>
        <source>Escape from the %1 switch towards %2: sends $T%1%2 (ALOE FIXED7+ firmware: slow move up to 10 mm + pull-off, done in firmware). In Alarm the button first sends a soft reset (Ctrl-X) to leave the hard-limit critical lock.</source>
        <translation>Съезд с концевика %1 в сторону %2: отправляет $T%1%2 (прошивка ALOE FIXED7+: медленный ход до 10 мм + отъезд, целиком в прошивке). Из Alarm кнопка сначала шлёт мягкий сброс (Ctrl-X), чтобы выйти из критической блокировки хард-лимита.</translation>
    </message>
    <message>
        <source>Status unavailable</source>
        <translation>Статус недоступен</translation>
    </message>
    <message>
        <source>GRBL reports no active input pins</source>
        <translation>GRBL не сообщает об активных входах</translation>
    </message>
    <message>
        <source>LIMIT: %1 !</source>
        <translation>КОНЦЕВИК: %1 !</translation>
    </message>
    <message>
        <source>OK</source>
        <translation>ОК</translation>
    </message>
    <message>
        <source>PRESSED</source>
        <translation>НАЖАТ</translation>
    </message>
    <message>
        <source>Probe pin: %1</source>
        <translation>Вход Probe (щуп): %1</translation>
    </message>
    <message>
        <source>X limit switch: %1</source>
        <translation>Концевик X: %1</translation>
    </message>
    <message>
        <source>Y limit switch: %1</source>
        <translation>Концевик Y: %1</translation>
    </message>
    <message>
        <source>Z limit switch: %1</source>
        <translation>Концевик Z: %1</translation>
    </message>
    <message>
        <source>no data</source>
        <translation>нет данных</translation>
    </message>
    <message>
        <source>running $T escape...</source>
        <translation>выполняется съезд $T...</translation>
    </message>
    <message>
        <source>no status...</source>
        <translation>нет статуса...</translation>
    </message>
    <message>
        <source>not connected</source>
        <translation>нет подключения</translation>
    </message>
    <message>
        <source>released</source>
        <translation>отпущен</translation>
    </message>
</context>
<context>
    <name>frmMain</name>
    <message>
        <source>Limit switches</source>
        <translation>Концевики</translation>
    </message>
</context>
<context>
    <name>LimitMonitorPanel</name>
    <message>
        <source>Limit switches</source>
        <translation>Концевики</translation>
    </message>
</context>
<context>
    <name>LimitMonitorSettings</name>
    <message>
        <source>Monitor the safety door pin (Pn:D)</source>
        <translation>Отслеживать вход защитной двери (Pn:D)</translation>
    </message>
    <message>
        <source>GRBL reports the door pin only while it considers the door OPEN, and only if the firmware was built with ENABLE_SAFETY_DOOR_INPUT_PIN (disabled in stock GRBL and in ALOE FIXED7+). Leave this off if the machine has no door sensor - otherwise the panel would show a false green "all ok" for a contact nobody is actually reading.</source>
        <translation>GRBL сообщает о входе двери, только пока считает дверь ОТКРЫТОЙ, и только если прошивка собрана с ENABLE_SAFETY_DOOR_INPUT_PIN (в стоковом GRBL и в ALOE FIXED7+ он выключен). Оставьте опцию выключенной, если на станке нет датчика двери — иначе панель показывала бы ложное зелёное «всё ок» для контакта, который на самом деле никто не читает.</translation>
    </message>
    <message>
        <source>Show $T escape buttons (ALOE FIXED7+ firmware)</source>
        <translation>Показывать кнопки съезда $T (прошивка ALOE FIXED7+)</translation>
    </message>
    <message>
        <source>The $T buttons send $TX-/$TX+/$TY-/$TY+/$TZ-/$TZ+ commands of the ALOE FIXED7+ firmware: the axis slowly backs off the pressed switch (up to 10 mm + pull-off) entirely inside the firmware. In Alarm state the button first sends a soft reset (Ctrl-X) automatically to leave the hard-limit critical lock. On stock GRBL these commands are rejected with error:2 and cause no motion.</source>
        <translation>Кнопки $T отправляют команды $TX-/$TX+/$TY-/$TY+/$TZ-/$TZ+ прошивки ALOE FIXED7+: ось сама медленно съезжает с нажатого концевика (до 10 мм + отъезд $27) целиком внутри прошивки. Из состояния Alarm кнопка сначала автоматически шлёт мягкий сброс (Ctrl-X), чтобы выйти из критической блокировки хард-лимита. На стоковом GRBL команда просто отклоняется с error:2, без движения.</translation>
    </message>
</context>
</TS>
