// Simple offline room panel using IndexedDB (via minimal wrapper) or localStorage fallback

const DB_NAME = 'room-panel-db';
const DB_VERSION = 1;
const STORE_BOOKINGS = 'bookings';
const STORE_META = 'meta';

// Utilities
const $ = (id) => document.getElementById(id);
const formatDateISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const pad2 = (n) => String(n).padStart(2, '0');
const parseTimeToMinutes = (input) => {
  if (!input) return NaN;
  const s = String(input).trim().toLowerCase();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return NaN;
  let hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const period = (m[4] || '').toLowerCase();
  if (period === 'pm' && hours < 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;
  return hours * 60 + mins;
};
const minutesToHHMM = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;

const defaultWorkingHours = { start: '08:00', end: '20:00' };

// IndexedDB minimal helper
let db = null;
function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore(STORE_BOOKINGS, { keyPath: 'id', autoIncrement: true });
      db.createObjectStore(STORE_META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(store, key) {
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const st = tx.objectStore(store);
    const req = st.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(store, key, value) {
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const st = tx.objectStore(store);
    const req = st.put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function dbAdd(store, value) {
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const st = tx.objectStore(store);
    const v = { ...value };
    if (Object.prototype.hasOwnProperty.call(v, 'id') && (v.id === undefined || v.id === null)) {
      delete v.id;
    }
    const req = st.add(v);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(store, key) {
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const st = tx.objectStore(store);
    const req = st.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAllBookingsByDate(dateISO) {
  if (!db) return JSON.parse(localStorage.getItem(`bookings:${dateISO}`) || '[]');
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKINGS, 'readonly');
    const st = tx.objectStore(STORE_BOOKINGS);
    const req = st.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      resolve(all.filter((b) => b.date === dateISO).sort((a, b) => a.startMins - b.startMins));
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbPutBooking(booking) {
  if (!db) {
    const arr = JSON.parse(localStorage.getItem(`bookings:${booking.date}`) || '[]');
    if (!booking.id) booking.id = Date.now();
    arr.push(booking);
    localStorage.setItem(`bookings:${booking.date}`, JSON.stringify(arr));
    return booking.id;
  }
  return dbAdd(STORE_BOOKINGS, booking);
}

async function dbRemoveBooking(id) {
  if (!db) {
    // brute force localStorage across keys
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('bookings:'));
    for (const k of keys) {
      const arr = JSON.parse(localStorage.getItem(k) || '[]');
      const next = arr.filter((b) => b.id !== id);
      localStorage.setItem(k, JSON.stringify(next));
    }
    return true;
  }
  return dbDelete(STORE_BOOKINGS, id);
}

// Resource meta
async function getResourceName() {
  if (!db) return localStorage.getItem('resource:name') || 'Переговорка';
  const v = await dbGet(STORE_META, 'resource:name');
  return v ?? 'Переговорка';
}
async function setResourceName(name) {
  if (!db) return localStorage.setItem('resource:name', name);
  return dbSet(STORE_META, 'resource:name', name);
}

// App state
let currentDate = new Date();

function updateNowClock() {
  const now = new Date();
  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  $('nowClock').textContent = hhmm;
  // Update availability status regularly
  updateStatus();
}

function updateDateLabel() {
  const d = currentDate;
  const label = d.toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' });
  $('dateLabel').textContent = label;
  const short = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', weekday: 'long' });
  const dateShort = $('dateShort');
  if (dateShort) dateShort.textContent = short;
}

function setFormDefaults() {
  const now = new Date();
  const rounded = Math.ceil(now.getMinutes() / 15) * 15;
  const startMins = now.getHours() * 60 + rounded;
  const start = minutesToHHMM(Math.max(parseTimeToMinutes(defaultWorkingHours.start), Math.min(startMins, parseTimeToMinutes(defaultWorkingHours.end) - 15)));
  $('startTime').value = start;
  $('duration').value = '30';
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function renderBookings() {
  const dateISO = formatDateISO(currentDate);
  const list = $('bookingsList');
  list.innerHTML = '';

  const bookings = await dbGetAllBookingsByDate(dateISO);
  $('emptyState').style.display = bookings.length ? 'none' : 'block';

  for (const b of bookings) {
    const li = document.createElement('li');
    li.className = 'booking-item';
    const timeRange = `${minutesToHHMM(b.startMins)}–${minutesToHHMM(b.endMins)}`;
    li.innerHTML = `
      <div>
        <div>${b.title}</div>
        <div class="booking-meta">${timeRange}</div>
      </div>
      <div>
        <button class="btn btn-danger btn-sm" data-id="${b.id}">Отменить</button>
      </div>
    `;
    list.appendChild(li);
  }

  list.addEventListener('click', async (e) => {
    const target = e.target;
    if (target.matches('button[data-id]')) {
      const id = Number(target.getAttribute('data-id'));
      await dbRemoveBooking(id);
      renderBookings();
    }
  }, { once: true });

  // Refresh header status based on current list
  updateStatus();
}

async function updateStatus() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const dateISO = formatDateISO(currentDate);
  const bookings = await dbGetAllBookingsByDate(dateISO);
  const active = bookings.find((b) => b.startMins <= minutes && minutes < b.endMins);
  const dot = $('statusDot');
  const text = $('statusText');
  if (!dot || !text) return;
  if (active) {
    dot.style.background = '#ef4444';
    text.textContent = `Занята до ${minutesToHHMM(active.endMins)}`;
    const brandDot = document.getElementById('brandDot');
    if (brandDot) brandDot.style.background = '#ef4444';
    updateHeroBusy(active.endMins);
  } else {
    dot.style.background = '#22c55e';
    const future = bookings.find((b) => b.startMins > minutes);
    text.textContent = future ? `Свободна до ${minutesToHHMM(future.startMins)}` : 'Свободна весь день';
    const brandDot = document.getElementById('brandDot');
    if (brandDot) brandDot.style.background = '#22c55e';
    updateHeroFree(future?.startMins, minutes);
  }
}

function updateHeroBusy(endMins) {
  const card = document.getElementById('heroCard');
  const title = document.getElementById('heroTitle');
  const sub = document.getElementById('heroSub');
  const chip = document.getElementById('heroChip');
  const action = document.getElementById('heroAction');
  if (!card || !title || !sub || !chip || !action) return;
  card.classList.add('is-busy');
  title.textContent = 'Занято';
  sub.textContent = `Идёт встреча. До ${minutesToHHMM(endMins)}`;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  chip.textContent = `Освободится через ${minutesToHHMM(endMins - mins)}`;
  action.textContent = 'Завершить';
}

function updateHeroFree(nextStart, nowMins) {
  const card = document.getElementById('heroCard');
  const title = document.getElementById('heroTitle');
  const sub = document.getElementById('heroSub');
  const chip = document.getElementById('heroChip');
  const action = document.getElementById('heroAction');
  if (!card || !title || !sub || !chip || !action) return;
  card.classList.remove('is-busy');
  title.textContent = 'Свободно';
  if (typeof nextStart === 'number') {
    sub.textContent = `До ${minutesToHHMM(nextStart)}`;
    chip.textContent = `Свободна ещё ${minutesToHHMM(nextStart - nowMins)}`;
  } else {
    sub.textContent = 'Свободна весь день';
    chip.textContent = '—';
  }
  action.textContent = 'Начать';
  // Кнопка «Начать»: открывает поповер с вариантами
  const pop = document.getElementById('startPopover');
  let popOutsideHandler = null;
  const showPop = () => {
    if (!pop) return;
    pop.classList.add('show');
    // клик вне — закрыть
    popOutsideHandler = (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (!path.includes(pop) && e.target !== action) {
        hidePop();
      }
    };
    document.addEventListener('mousedown', popOutsideHandler, { capture: true });
    document.addEventListener('touchstart', popOutsideHandler, { capture: true });
  };
  const hidePop = () => {
    if (!pop) return;
    pop.classList.remove('show');
    if (popOutsideHandler) {
      document.removeEventListener('mousedown', popOutsideHandler, { capture: true });
      document.removeEventListener('touchstart', popOutsideHandler, { capture: true });
      popOutsideHandler = null;
    }
  };
  action.onclick = () => { pop?.classList.contains('show') ? hidePop() : showPop(); };
  if (pop) {
    // быстрые варианты
    pop.querySelectorAll('.pop-btn[data-mins]').forEach((btn) => {
      btn.onclick = async () => {
        const mins = Number(btn.getAttribute('data-mins')) || 30;
        await tryCreateQuick(mins);
      };
    });
    // ручной выбор
    initTimePicker();
    const manualToggle = document.getElementById('manualToggle');
    const manualRow = pop.querySelector('.pop-row.manual');
    manualToggle.onclick = () => {
      if (!manualRow) return;
      manualRow.classList.toggle('hidden');
      if (!manualRow.classList.contains('hidden')) {
        setTimePickerToNowPlus(15);
      }
    };
    const applyBtn = document.getElementById('manualApply');
    applyBtn.onclick = async () => {
      const { hour, minute } = readTimePicker();
      const end = hour * 60 + minute;
      const now = new Date();
      let start = now.getHours() * 60 + now.getMinutes(); // старт немедленно
      if (end <= start) { showToast('Время окончания раньше начала'); return; }
      await tryCreateRange(start, end);
    };
  }
}

function initTimePicker() {
  const hourSel = document.getElementById('tpHour');
  const minSel = document.getElementById('tpMin');
  if (!hourSel || !minSel) return;
  if (!hourSel.options.length) {
    for (let h = 0; h < 24; h++) {
    const opt = document.createElement('option');
    opt.value = String(h);
    opt.textContent = pad2(h);
    hourSel.appendChild(opt);
    }
    for (let m = 0; m < 60; m += 5) { // шаг 5 минут для удобства
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = pad2(m);
    minSel.appendChild(opt);
    }
  }
  // Ставим время к текущему +15 минут при каждом открытии ручного выбора
  setTimePickerToNowPlus(15);
}

function readTimePicker() {
  const hourSel = document.getElementById('tpHour');
  const minSel = document.getElementById('tpMin');
  return { hour: Number(hourSel?.value || 0), minute: Number(minSel?.value || 0) };
}

async function tryCreateQuick(mins) {
  const now = new Date();
  let start = now.getHours() * 60 + now.getMinutes(); // старт немедленно
  const whStart = parseTimeToMinutes(defaultWorkingHours.start);
  const whEnd = parseTimeToMinutes(defaultWorkingHours.end);
  if (start < whStart) start = whStart;
  let end = start + mins;
  // Округление конца к ближайшим 15 минутам вверх
  end = Math.ceil(end / 15) * 15;
  await tryCreateRange(start, end);
}

async function tryCreateRange(startMins, endMins) {
  // Минимальная длительность 15 минут и выравнивание конца к 15 → 30 минутам
  if (endMins < startMins + 15) endMins = startMins + 15;
  endMins = Math.ceil(endMins / 15) * 15; // только к 15‑минутной сетке
  const whStart = parseTimeToMinutes(defaultWorkingHours.start);
  const whEnd = parseTimeToMinutes(defaultWorkingHours.end);
  if (startMins < whStart || endMins > whEnd) {
    showToast('За пределами рабочих часов');
    return;
  }
  const dateISO = formatDateISO(currentDate);
  const dayBookings = await dbGetAllBookingsByDate(dateISO);
  // найти ближайшую будущую встречу
  const next = dayBookings.find((b) => b.startMins > startMins);
  if (next && endMins > next.startMins) {
    // есть пересечение — предложить меньшее время
    showToast('Выберите меньшее время брони');
    return;
  }
  const conflict = dayBookings.some((b) => rangesOverlap(startMins, endMins, b.startMins, b.endMins));
  if (conflict) {
    showToast('Ближайшее время занято. Запланируйте встречу в меню справа вверху');
    return;
  }
  const booking = { date: dateISO, title: 'Встреча', startMins, endMins, createdAt: Date.now() };
  await dbPutBooking(booking);
  await renderBookings();
  const pop = document.getElementById('startPopover');
  pop?.classList.remove('show');
  showToast('Забронировано');
}

function setTimePickerToNowPlus(mins) {
  const hourSel = document.getElementById('tpHour');
  const minSel = document.getElementById('tpMin');
  if (!hourSel || !minSel) return;
  const now = new Date();
  let end = now.getHours() * 60 + now.getMinutes() + (mins || 0);
  end = Math.ceil(end / 5) * 5;
  const eh = Math.floor(end / 60);
  const em = end % 60;
  hourSel.value = String(eh % 24);
  minSel.value = String(em);
  const hs = hourSel.selectedIndex >= 0 ? hourSel.selectedIndex : 0;
  const ms = minSel.selectedIndex >= 0 ? minSel.selectedIndex : 0;
  hourSel.options[hs]?.scrollIntoView({ block: 'center' });
  minSel.options[ms]?.scrollIntoView({ block: 'center' });
}

async function submitBookingForm(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const titleEl = $('title');
  const startEl = $('startTime');
  const durationEl = $('duration');
  const title = titleEl.value.trim();
  const startTime = startEl.value;
  const duration = Number(durationEl.value);
  if (!title || !startTime || !duration) return;

  const startMins = parseTimeToMinutes(startTime);
  if (Number.isNaN(startMins)) {
    alert('Некорректное время начала. Укажите время формата ЧЧ:ММ');
    return;
  }
  const endMins = startMins + duration;

  // Working hours rule
  const whStart = parseTimeToMinutes(defaultWorkingHours.start);
  const whEnd = parseTimeToMinutes(defaultWorkingHours.end);
  if (startMins < whStart || endMins > whEnd) {
    alert(`Слот вне рабочих часов (${defaultWorkingHours.start}–${defaultWorkingHours.end})`);
    return;
  }

  // Overlap rule
  const dateISO = formatDateISO(currentDate);
  const dayBookings = await dbGetAllBookingsByDate(dateISO);
  const conflict = dayBookings.some((b) => rangesOverlap(startMins, endMins, b.startMins, b.endMins));
  if (conflict) {
    alert('Конфликт: слот пересекается с существующей бронью');
    return;
  }

  // Save
  const booking = { id: undefined, date: dateISO, title, startMins, endMins, createdAt: Date.now() };
  await dbPutBooking(booking);
  form.reset();
  setFormDefaults();
  renderBookings();
  showToast('Забронировано');
}

function exportJson() {
  // Gather everything
  const data = { meta: {}, bookingsByDate: {} };
  if (!db) {
    // localStorage mode
    data.meta.resourceName = localStorage.getItem('resource:name') || 'Переговорка';
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('bookings:')) {
        data.bookingsByDate[k.slice('bookings:'.length)] = JSON.parse(localStorage.getItem(k) || '[]');
      }
    }
    downloadJson(data);
    return;
  }

  // IndexedDB mode: read via getAll
  const tx = db.transaction([STORE_META, STORE_BOOKINGS], 'readonly');
  const metaStore = tx.objectStore(STORE_META);
  const bookingsStore = tx.objectStore(STORE_BOOKINGS);
  const metaReq = metaStore.get('resource:name');
  const allReq = bookingsStore.getAll();
  allReq.onsuccess = () => {
    const all = allReq.result || [];
    const byDate = {};
    for (const b of all) {
      if (!byDate[b.date]) byDate[b.date] = [];
      byDate[b.date].push(b);
    }
    const out = { meta: { resourceName: metaReq.result || 'Переговорка' }, bookingsByDate: byDate };
    downloadJson(out);
  };
}

function downloadJson(obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'room-panel-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(String(reader.result || '{}'));
      if (data?.meta?.resourceName) await setResourceName(data.meta.resourceName);
      if (db) {
        const tx = db.transaction(STORE_BOOKINGS, 'readwrite');
        const st = tx.objectStore(STORE_BOOKINGS);
        // naive clear and reimport
        st.clear();
        for (const [date, arr] of Object.entries(data.bookingsByDate || {})) {
          for (const b of arr) {
            // re-add without trusting provided id
            st.add({ date, title: b.title, startMins: b.startMins, endMins: b.endMins, createdAt: Date.now() });
          }
        }
      } else {
        // localStorage mode
        for (const k of Object.keys(localStorage)) if (k.startsWith('bookings:')) localStorage.removeItem(k);
        for (const [date, arr] of Object.entries(data.bookingsByDate || {})) {
          localStorage.setItem(`bookings:${date}`, JSON.stringify(arr));
        }
        if (data?.meta?.resourceName) localStorage.setItem('resource:name', data.meta.resourceName);
      }
      await refreshTitle();
      await renderBookings();
      alert('Импорт завершён');
    } catch (e) {
      alert('Ошибка импорта: ' + e.message);
    }
  };
  reader.readAsText(file);
}

async function refreshTitle() {
  $('resourceTitle').textContent = 'Главный зал';
}

function attachEvents() {
  $('prevDay').addEventListener('click', () => { currentDate.setDate(currentDate.getDate() - 1); updateDateLabel(); renderBookings();});
  $('nextDay').addEventListener('click', () => { currentDate.setDate(currentDate.getDate() + 1); updateDateLabel(); renderBookings();});
  $('bookingForm').addEventListener('submit', submitBookingForm);
  $('exportBtn').addEventListener('click', exportJson);
  $('importInput').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; });
  // Quick booking buttons
  document.querySelectorAll('.quick-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mins = Number(btn.getAttribute('data-mins')) || 30;
      // Compute rounded start time from now with 15-min steps and clamp to working hours
      const now = new Date();
      const rounded = Math.ceil(now.getMinutes() / 15) * 15;
      let startMins = now.getHours() * 60 + rounded;
      const whStart = parseTimeToMinutes(defaultWorkingHours.start);
      const whEnd = parseTimeToMinutes(defaultWorkingHours.end);
      if (startMins < whStart) startMins = whStart;
      if (startMins + mins > whEnd) {
        alert('Не хватает времени до конца рабочих часов');
        return;
      }
      // Check conflicts
      const dateISO = formatDateISO(currentDate);
      const dayBookings = await dbGetAllBookingsByDate(dateISO);
      const endMins = startMins + mins;
      const conflict = dayBookings.some((b) => rangesOverlap(startMins, endMins, b.startMins, b.endMins));
      if (conflict) {
        alert('Конфликт: ближайший слот занят');
        return;
      }
      // Fill form and submit
      $('title').value = 'Быстрая бронь';
      $('startTime').value = minutesToHHMM(startMins);
      $('duration').value = String(mins);
      $('bookingForm').requestSubmit();
    });
  });
  $('clearBtn').addEventListener('click', async () => {
    if (!confirm('Удалить все брони выбранного дня?')) return;
    const dateISO = formatDateISO(currentDate);
    if (!db) {
      localStorage.removeItem(`bookings:${dateISO}`);
    } else {
      // delete by filtering
      const all = await dbGetAllBookingsByDate(dateISO);
      for (const b of all) await dbRemoveBooking(b.id);
    }
    renderBookings();
  });

  const editBtn = $('editResourceBtn');
  if (editBtn) {
    editBtn.addEventListener('click', async () => {
      const dlg = $('resourceDialog');
      const input = $('resourceNameInput');
      input.value = await getResourceName();
      dlg.showModal();
      dlg.addEventListener('close', async () => {
        if (dlg.returnValue === 'ok') {
          const name = input.value.trim() || 'Переговорка';
          await setResourceName(name);
          await refreshTitle();
        }
      }, { once: true });
    });
  }
  // Drawer
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const openDrawer = () => { drawer?.classList.add('open'); backdrop?.classList.add('show'); };
  const closeDrawer = () => { drawer?.classList.remove('open'); backdrop?.classList.remove('show'); };
  document.getElementById('menuBtn')?.addEventListener('click', openDrawer);
  document.getElementById('drawerClose')?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
}

async function main() {
  try { db = await openDb(); } catch {}
  attachEvents();
  updateDateLabel();
  setFormDefaults();
  await refreshTitle();
  await renderBookings();
  updateNowClock();
  setInterval(updateNowClock, 1000 * 30);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  // DOM is already ready when script is placed at the end of body
  main();
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, 1800);
  setTimeout(() => { el.remove(); }, 2300);
}


