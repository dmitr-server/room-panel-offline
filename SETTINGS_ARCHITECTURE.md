# Архитектура настроек

Локальные настройки сохраняются в IndexedDB (store `meta`) или в `localStorage` (fallback):
- `resource:name` — имя ресурса (по умолчанию «Переговорка»)
- `settings:workingHours` — рабочие часы ресурса, объект `{ start: 'HH:MM', end: 'HH:MM' }`
- `settings:allowWeekends` — разрешать ли выбор выходных (`true|false`)
- `settings:disableWorkingHoursForTests` — тестовый флаг: отключить проверку рабочих часов (08:00–20:00), при этом правило «< 20 минут до следующей встречи» остаётся активным

Брони по дням хранятся с ключом даты `YYYY-MM-DD` и полями: `title`, `startMins`, `endMins`, `createdAt`.
