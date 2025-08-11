# SETTINGS ARCHITECTURE

Локальные настройки (хранятся в IndexedDB или localStorage):
- `resource:name` — имя ресурса (по умолчанию «Переговорка»). Меняется через диалог «Изменить».
- Рабочие часы: в коде `app.js` (`defaultWorkingHours: 08:00–20:00`). Можно вынести в UI позднее.

Брони по дням хранятся с ключом даты `YYYY-MM-DD` и полями: `title`, `startMins`, `endMins`, `createdAt`.
