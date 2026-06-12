// Bow's App / Snäckan - Egenkontroll (temperaturloggning)
// Ren JavaScript, sparar i webbläsarens localStorage.

// ---------------------------------------------------------------------------
// Mörkt/ljust läge. Temat sätts redan i <head> innan ritning; här sköts bara
// växlingen och att valet sparas.
// ---------------------------------------------------------------------------
(function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('bowsapp.theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('bowsapp.theme', 'dark');
    }
  });
})();

// ---------------------------------------------------------------------------
// Lagringslager. All läsning/skrivning av data går genom dessa funktioner,
// så att lagringen senare kan bytas (t.ex. mot molnet) på ett ställe.
// ---------------------------------------------------------------------------
const Store = {
  UNITS_KEY: 'bowsapp.units',
  READINGS_KEY: 'bowsapp.readings',

  _read(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
      return [];
    }
  },
  _write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  getUnits() { return this._read(this.UNITS_KEY); },
  getReadings() { return this._read(this.READINGS_KEY); },

  saveUnit(unit) {
    const units = this.getUnits();
    if (unit.id) {
      const i = units.findIndex(u => u.id === unit.id);
      if (i !== -1) units[i] = unit;
    } else {
      unit.id = makeId();
      units.push(unit);
    }
    this._write(this.UNITS_KEY, units);
    return unit;
  },
  deleteUnit(id) {
    this._write(this.UNITS_KEY, this.getUnits().filter(u => u.id !== id));
    // Ta även bort loggningar som hör till enheten.
    this._write(this.READINGS_KEY, this.getReadings().filter(r => r.unitId !== id));
  },

  addReading(reading) {
    reading.id = makeId();
    const readings = this.getReadings();
    readings.push(reading);
    this._write(this.READINGS_KEY, readings);
    return reading;
  },
  readingsForUnit(unitId) {
    return this.getReadings()
      .filter(r => r.unitId === unitId)
      .sort((a, b) => b.tidpunkt.localeCompare(a.tidpunkt));
  },
  latestReading(unitId) {
    const list = this.readingsForUnit(unitId);
    return list.length ? list[0] : null;
  },
};

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------------------------------------------------------------------------
// Hjälpfunktioner
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

const ICONS = {
  kyl: '<svg viewBox="0 0 24 24"><path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v6h10V4H7Zm0 8v8h10v-8H7Zm2-6h2v3H9V6Zm0 8h2v4H9v-4Z" fill="currentColor"/></svg>',
  frys: '<svg viewBox="0 0 24 24"><path d="M11 2h2v3.6l2.5-1.5 1 1.7L13 7.9V11l2.7-1.6 .3-3 2 .2-.2 1.9 3.1-1.8 1 1.7-3.1 1.8 1.7.9-.9 1.8-2.7-1.4L14 13l2.9 1.7 2.7-1.4.9 1.8-1.7.9 3.1 1.8-1 1.7-3.1-1.8.2 1.9-2 .2-.3-3L13 16.1v3l3.5 2.1-1 1.7L13 21.4V22h-2v-.6l-2.5 1.5-1-1.7L11 19.1v-3l-2.7 1.6-.3 3-2-.2.2-1.9-3.1 1.8-1-1.7 3.1-1.8-1.7-.9.9-1.8 2.7 1.4L10 13l-2.9-1.7-2.7 1.4-.9-1.8 1.7-.9L2.1 8.2l1-1.7L6.2 8.3 6 6.4l2-.2.3 3L11 10.9v-3L7.5 5.8l1-1.7L11 5.6V2Z" fill="currentColor"/></svg>',
  thermo: '<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 1 3 3v8.3a5 5 0 1 1-6 0V5a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v9.4l-.5.3a3 3 0 1 0 3 0l-.5-.3V5a1 1 0 0 0-1-1Z" fill="currentColor"/></svg>',
};

function isOutOfRange(temp, maxTemp) {
  return Number(temp) > Number(maxTemp);
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('sv-SE') + ' ' +
    d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let toastTimer = null;
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}

// ---------------------------------------------------------------------------
// Vy-navigering
// ---------------------------------------------------------------------------
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + name).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  if (name === 'units') renderUnits();
  if (name === 'log') renderLogForm();
  if (name === 'history') renderHistory();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.view !== 'log') endWeekly(true);
    showView(btn.dataset.view);
  });
});

// ---------------------------------------------------------------------------
// Vy: Enheter
// ---------------------------------------------------------------------------
function renderUnits() {
  const units = Store.getUnits();
  const list = $('#units-list');
  list.innerHTML = '';
  $('#units-empty').classList.toggle('hidden', units.length > 0);
  $('#weekly-btn').classList.toggle('hidden', units.length === 0);

  units.forEach(unit => {
    const latest = Store.latestReading(unit.id);
    const card = document.createElement('div');
    card.className = 'unit-card';

    let readingHtml;
    if (latest) {
      const bad = isOutOfRange(latest.temp, unit.maxTemp);
      readingHtml = `<div class="temp ${bad ? 'bad' : 'ok'}">${latest.temp}°C</div>
        <div class="meta">${formatDateTime(latest.tidpunkt)}</div>`;
    } else {
      readingHtml = `<div class="temp none">Ingen logg</div>`;
    }

    // Hela kortet redigerar; "Logga ny"-knappen loggar (egen träffyta).
    card.setAttribute('role', 'button');
    card.innerHTML = `
      <div class="type-icon ${unit.typ}">${ICONS[unit.typ] || ICONS.kyl}</div>
      <div class="info">
        <div class="name">${escapeHtml(unit.namn)}</div>
        <div class="meta">${unit.typ === 'kyl' ? 'Kyl' : 'Frys'} · max ${unit.maxTemp}°C · redigera</div>
      </div>
      <div class="reading">${readingHtml}</div>
      <button type="button" class="btn-log" data-log="${unit.id}">
        ${ICONS.thermo}<span>Logga ny</span>
      </button>
    `;
    list.appendChild(card);

    // Klick var som helst på kortet öppnar redigering.
    card.addEventListener('click', () => openUnitModal(unit.id));

    // "Logga ny"-knappen loggar i stället, utan att trigga redigering.
    card.querySelector('[data-log]').addEventListener('click', (e) => {
      e.stopPropagation();
      showView('log');
      $('#log-unit').value = unit.id;
      onLogUnitChange();
    });
  });
}

// ---------------------------------------------------------------------------
// Modal: lägg till / redigera enhet
// ---------------------------------------------------------------------------
function setUnitType(type) {
  $('#unit-type').value = type;
  document.querySelectorAll('#unit-type-seg .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
}

function openUnitModal(unitId) {
  const modal = $('#unit-modal');
  const deleteBtn = $('#unit-delete');

  if (unitId) {
    const unit = Store.getUnits().find(u => u.id === unitId);
    if (!unit) return;
    $('#unit-modal-title').textContent = 'Redigera enhet';
    $('#unit-id').value = unit.id;
    $('#unit-name').value = unit.namn;
    setUnitType(unit.typ);
    $('#unit-max').value = unit.maxTemp;
    deleteBtn.classList.remove('hidden');
  } else {
    $('#unit-modal-title').textContent = 'Ny enhet';
    $('#unit-form').reset();
    $('#unit-id').value = '';
    setUnitType('kyl');
    $('#unit-max').value = '8';
    deleteBtn.classList.add('hidden');
  }
  modal.classList.remove('hidden');
}

function closeUnitModal() {
  $('#unit-modal').classList.add('hidden');
}

$('#add-unit-btn').addEventListener('click', () => openUnitModal(null));
$('#unit-cancel').addEventListener('click', closeUnitModal);

// Typ-väljare: föreslå rimligt gränsvärde när typ ändras.
document.querySelectorAll('#unit-type-seg .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setUnitType(btn.dataset.type);
    $('#unit-max').value = btn.dataset.type === 'frys' ? '-18' : '8';
  });
});

$('#unit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const unit = {
    id: $('#unit-id').value || null,
    namn: $('#unit-name').value.trim(),
    typ: $('#unit-type').value,
    maxTemp: parseFloat($('#unit-max').value),
  };
  if (!unit.namn || Number.isNaN(unit.maxTemp)) return;
  Store.saveUnit(unit);
  closeUnitModal();
  renderUnits();
  showToast('Enhet sparad');
});

$('#unit-delete').addEventListener('click', () => {
  const id = $('#unit-id').value;
  if (!id) return;
  if (confirm('Ta bort enheten och alla dess loggningar?')) {
    Store.deleteUnit(id);
    closeUnitModal();
    renderUnits();
    showToast('Enhet borttagen');
  }
});

// ---------------------------------------------------------------------------
// Veckokontroll: gå igenom alla enheter en i taget
// ---------------------------------------------------------------------------
const weekly = {
  active: false,
  queue: [],   // enhets-id:n kvar att logga
  total: 0,
  done: 0,
};

function startWeekly() {
  const units = Store.getUnits();
  if (units.length === 0) return;
  weekly.active = true;
  weekly.queue = units.map(u => u.id);
  weekly.total = units.length;
  weekly.done = 0;
  showView('log');
  setWeeklyUnit();
}

function setWeeklyUnit() {
  const unitId = weekly.queue[0];
  $('#log-unit').value = unitId;
  updateWeeklyBanner();
  onLogUnitChange();
}

function updateWeeklyBanner() {
  const banner = $('#weekly-banner');
  banner.classList.toggle('hidden', !weekly.active);
  $('#log-unit-label').classList.toggle('hidden', weekly.active);
  if (weekly.active) {
    const unit = Store.getUnits().find(u => u.id === weekly.queue[0]);
    const pos = weekly.total - weekly.queue.length + 1;
    $('#weekly-progress').textContent = `${pos} av ${weekly.total}: ${unit ? unit.namn : ''}`;
    $('#log-title').textContent = 'Veckokontroll';
  } else {
    $('#log-title').textContent = 'Logga temperatur';
  }
}

function advanceWeekly(skipped) {
  weekly.queue.shift();
  if (!skipped) weekly.done++;
  if (weekly.queue.length === 0) {
    const done = weekly.done;
    endWeekly(false);
    showToast(`Veckokontroll klar – ${done} av ${weekly.total} loggade`);
    showView('units');
  } else {
    setWeeklyUnit();
  }
}

function endWeekly(silent) {
  if (!weekly.active) return;
  weekly.active = false;
  weekly.queue = [];
  updateWeeklyBanner();
  if (!silent) return;
}

$('#weekly-btn').addEventListener('click', startWeekly);
$('#weekly-skip').addEventListener('click', () => advanceWeekly(true));
$('#weekly-quit').addEventListener('click', () => {
  endWeekly(true);
  showView('units');
});

// ---------------------------------------------------------------------------
// Vy: Logga temp
// ---------------------------------------------------------------------------
function fillUnitSelect(select) {
  const units = Store.getUnits();
  const current = select.value;
  select.innerHTML = '';
  units.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.namn;
    select.appendChild(opt);
  });
  // Behåll tidigare val om det finns kvar, annars välj första enheten.
  if (current && units.some(u => u.id === current)) {
    select.value = current;
  } else if (units.length > 0) {
    select.selectedIndex = 0;
  }
  return units.length > 0;
}

function renderLogForm() {
  const hasUnits = fillUnitSelect($('#log-unit'));
  $('#log-form').classList.toggle('hidden', !hasUnits);
  // Stega-knapparna är bara meningsfulla med fler än en enhet.
  const multi = $('#log-unit').options.length > 1;
  $('#unit-prev').disabled = !multi;
  $('#unit-next').disabled = !multi;
  updateWeeklyBanner();
  if (!hasUnits) {
    $('#log-warning').textContent = 'Lägg till en enhet först (under fliken Enheter).';
    $('#log-warning').classList.remove('hidden');
  } else {
    onLogUnitChange();
  }
}

// Snabbval-chips: typiska värden för enhetstypen. Senaste värdet förifylls
// direkt i rutan, så det behövs inte som eget förslag här.
function renderTempChips() {
  const wrap = $('#temp-chips');
  wrap.innerHTML = '';
  const hint = $('#temp-limit-hint');
  const unit = Store.getUnits().find(u => u.id === $('#log-unit').value);
  if (!unit) { hint.textContent = ''; return; }

  hint.textContent = `Gränsvärde: max ${unit.maxTemp}°C`;

  // Helt intervall av rimliga värden för enhetstypen.
  const typical = unit.typ === 'frys'
    ? [-25, -24, -23, -22, -21, -20, -19, -18]
    : [1, 2, 3, 4, 5, 6, 7, 8];

  typical.forEach(t => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.temp = t;
    chip.textContent = `${t}°`;
    chip.addEventListener('click', () => {
      $('#log-temp').value = t;
      onTempChanged();
    });
    wrap.appendChild(chip);
  });
  highlightSelectedChip();
}

// Markera det snabbval som matchar inskrivet värde.
function highlightSelectedChip() {
  const val = $('#log-temp').value;
  document.querySelectorAll('#temp-chips .chip').forEach(c => {
    c.classList.toggle('selected', val !== '' && Number(c.dataset.temp) === Number(val));
  });
}

function onTempChanged() {
  updateLogWarning();
  highlightSelectedChip();
}

function onLogUnitChange() {
  // Förifyll med senaste loggade värdet (kyl/frys ändras sällan mycket).
  const unit = Store.getUnits().find(u => u.id === $('#log-unit').value);
  const latest = unit ? Store.latestReading(unit.id) : null;
  $('#log-temp').value = latest ? latest.temp : '';
  renderTempChips();
  updateLogWarning();
}

function updateLogWarning() {
  const warn = $('#log-warning');
  const unit = Store.getUnits().find(u => u.id === $('#log-unit').value);
  const temp = $('#log-temp').value;
  if (unit && temp !== '' && isOutOfRange(temp, unit.maxTemp)) {
    warn.textContent = `Varning: ${temp}°C är över gränsvärdet (max ${unit.maxTemp}°C för ${unit.namn}). Loggningen sparas men avvikelsen bör åtgärdas och antecknas.`;
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
}

function stepTemp(delta) {
  const input = $('#log-temp');
  const current = input.value === '' ? 0 : parseFloat(input.value);
  if (Number.isNaN(current)) return;
  const next = Math.round((current + delta) * 10) / 10;
  input.value = next;
  onTempChanged();
}

$('#temp-minus').addEventListener('click', () => stepTemp(-0.5));
$('#temp-plus').addEventListener('click', () => stepTemp(0.5));
$('#log-temp').addEventListener('input', onTempChanged);

// Stega mellan enheter med −/+ (slår runt i listan). Dropdownen fungerar kvar.
function stepUnit(delta) {
  const select = $('#log-unit');
  const n = select.options.length;
  if (n < 2) return;
  const next = (select.selectedIndex + delta + n) % n;
  select.selectedIndex = next;
  onLogUnitChange();
}

$('#unit-prev').addEventListener('click', () => stepUnit(-1));
$('#unit-next').addEventListener('click', () => stepUnit(1));
$('#log-unit').addEventListener('change', onLogUnitChange);

$('#log-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const unitId = $('#log-unit').value;
  const temp = parseFloat($('#log-temp').value);
  if (!unitId || Number.isNaN(temp)) return;

  Store.addReading({
    unitId,
    temp,
    anteckning: $('#log-note').value.trim(),
    tidpunkt: new Date().toISOString(),
  });

  $('#log-temp').value = '';
  $('#log-note').value = '';
  $('#log-warning').classList.add('hidden');

  if (weekly.active) {
    showToast('Sparat');
    advanceWeekly(false);
  } else {
    showToast('Loggning sparad');
    showView('units');
  }
});

// ---------------------------------------------------------------------------
// Vy: Historik
// ---------------------------------------------------------------------------
function renderHistory() {
  const select = $('#history-unit');
  const hasUnits = fillUnitSelect(select);
  if (!hasUnits) {
    $('#history-list').innerHTML = '';
    $('#history-empty').classList.remove('hidden');
    $('#history-empty').textContent = 'Lägg till en enhet och logga temperatur först.';
    $('#export-btn').disabled = true;
    return;
  }
  $('#export-btn').disabled = false;
  renderHistoryList();
}

function renderHistoryList() {
  const unitId = $('#history-unit').value;
  const unit = Store.getUnits().find(u => u.id === unitId);
  const readings = Store.readingsForUnit(unitId);
  const list = $('#history-list');
  list.innerHTML = '';

  $('#history-empty').classList.toggle('hidden', readings.length > 0);
  if (readings.length === 0) {
    $('#history-empty').textContent = 'Inga loggningar för den här enheten än.';
  }

  readings.forEach(r => {
    const bad = unit && isOutOfRange(r.temp, unit.maxTemp);
    const card = document.createElement('div');
    card.className = 'reading-card' + (bad ? ' bad' : '');
    card.innerHTML = `
      <div class="row">
        <span class="when">${formatDateTime(r.tidpunkt)}</span>
        <span class="val ${bad ? 'bad' : ''}">${r.temp}°C</span>
      </div>
      ${r.anteckning ? `<div class="note">${escapeHtml(r.anteckning)}</div>` : ''}
    `;
    list.appendChild(card);
  });
}

$('#history-unit').addEventListener('change', renderHistoryList);

// ---------------------------------------------------------------------------
// Export till CSV
// ---------------------------------------------------------------------------
$('#export-btn').addEventListener('click', () => {
  const unitId = $('#history-unit').value;
  const unit = Store.getUnits().find(u => u.id === unitId);
  if (!unit) return;
  const readings = Store.readingsForUnit(unitId);
  if (readings.length === 0) {
    showToast('Inget att exportera för den här enheten');
    return;
  }

  const rows = [['Datum/tid', 'Enhet', 'Typ', 'Temp (C)', 'Max (C)', 'Avvikelse', 'Anteckning']];
  readings.forEach(r => {
    rows.push([
      formatDateTime(r.tidpunkt),
      unit.namn,
      unit.typ,
      String(r.temp).replace('.', ','),
      String(unit.maxTemp).replace('.', ','),
      isOutOfRange(r.temp, unit.maxTemp) ? 'JA' : '',
      r.anteckning || '',
    ]);
  });

  const csv = rows.map(row =>
    row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(';')
  ).join('\r\n');

  // BOM så att Excel läser å/ä/ö rätt.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = unit.namn.replace(/[^\wåäöÅÄÖ -]/g, '').trim() || 'enhet';
  a.href = url;
  a.download = `egenkontroll_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV-fil nedladdad');
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
showView('units');
