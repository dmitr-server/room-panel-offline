# DEPLOYMENT — Room Panel Offline Demo

## ПК (отладка)
- `python3 -m http.server 8000`
- Открыть `http://localhost:8000/offline-panel/index.html`

## Android — самый быстрый путь (киоск‑браузер)
1. Установить Fully Kiosk Browser.
2. Скопировать папку `offline-panel/` на устройство (например, `sdcard/RoomPanel/`).
3. Start URL: `file:///sdcard/RoomPanel/index.html`
4. Включить: автозапуск, полноэкранный, экран не гасить, PIN на выход.

## Android — APK (опционально)
- Обернуть в Capacitor/Ionic, собрать APK, ассеты офлайн. Позже.

## Бэкапы
- Экспортом JSON через UI («Экспорт JSON»). Хранить на внешнем накопителе.
