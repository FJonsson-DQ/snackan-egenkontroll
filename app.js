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
// Lagringslagret pratar med Supabase men håller ett synkront minne (cache) så att
// alla render-funktioner kan läsa data direkt. Skrivningar går till molnet och
// laddar om cachen; realtidsprenumerationen håller cachen uppdaterad när ANDRA
// användare ändrar något. Översätter mellan appens fält (maxTemp, unitId) och
// databasens (max_temp, unit_id).
function mapUnitFromDb(u) {
  return { id: u.id, namn: u.namn, typ: u.typ, maxTemp: Number(u.max_temp) };
}
function mapReadingFromDb(r) {
  return {
    id: r.id,
    unitId: r.unit_id,
    temp: Number(r.temp),
    anteckning: r.anteckning || '',
    loggad_av: r.loggad_av || '',
    tidpunkt: r.tidpunkt,
  };
}
function mapItemFromDb(i) {
  return {
    id: i.id,
    namn: i.namn,
    huvud: i.huvud,
    underkategoriId: i.underkategori_id || null,
    artikelnummer: i.artikelnummer || '',
    enhet: i.enhet,
    antal: Number(i.antal),
    updated_by: i.updated_by || '',
  };
}
function mapSubcatFromDb(s) {
  return { id: s.id, huvud: s.huvud, namn: s.namn };
}

const Store = {
  units: [],
  readings: [],
  inventory: [],
  subcategories: [],

  getUnits() { return this.units; },
  getReadings() { return this.readings; },
  getInventory() { return this.inventory; },
  getSubcategories() { return this.subcategories; },
  subcategoriesFor(huvud) { return this.subcategories.filter(s => s.huvud === huvud); },

  readingsForUnit(unitId) {
    return this.readings
      .filter(r => r.unitId === unitId)
      .sort((a, b) => b.tidpunkt.localeCompare(a.tidpunkt));
  },
  latestReading(unitId) {
    const list = this.readingsForUnit(unitId);
    return list.length ? list[0] : null;
  },

  // Hämtar all delad data från molnet till cachen.
  async load() {
    const [unitsRes, readingsRes, invRes, subRes] = await Promise.all([
      window.sb.from('units').select('*').order('created_at', { ascending: true }),
      window.sb.from('readings').select('*').order('tidpunkt', { ascending: false }),
      window.sb.from('inventory').select('*').order('namn', { ascending: true }),
      window.sb.from('subcategories').select('*').order('namn', { ascending: true }),
    ]);
    if (unitsRes.error) console.error('Kunde inte hämta enheter:', unitsRes.error);
    if (readingsRes.error) console.error('Kunde inte hämta loggar:', readingsRes.error);
    if (invRes.error) console.error('Kunde inte hämta lager:', invRes.error);
    if (subRes.error) console.error('Kunde inte hämta underkategorier:', subRes.error);
    this.units = (unitsRes.data || []).map(mapUnitFromDb);
    this.readings = (readingsRes.data || []).map(mapReadingFromDb);
    this.inventory = (invRes.data || []).map(mapItemFromDb);
    this.subcategories = (subRes.data || []).map(mapSubcatFromDb);
  },

  async saveUnit(unit) {
    if (unit.id) {
      const { error } = await window.sb.from('units')
        .update({ namn: unit.namn, typ: unit.typ, max_temp: unit.maxTemp })
        .eq('id', unit.id);
      if (error) throw error;
    } else {
      const { error } = await window.sb.from('units')
        .insert({ namn: unit.namn, typ: unit.typ, max_temp: unit.maxTemp });
      if (error) throw error;
    }
    await this.load();
  },

  async deleteUnit(id) {
    // Loggar för enheten tas bort automatiskt (on delete cascade).
    const { error } = await window.sb.from('units').delete().eq('id', id);
    if (error) throw error;
    await this.load();
  },

  async addReading(reading) {
    const { error } = await window.sb.from('readings').insert({
      unit_id: reading.unitId,
      temp: reading.temp,
      anteckning: reading.anteckning || '',
      loggad_av: window.currentUserEmail || null,
      tidpunkt: reading.tidpunkt || new Date().toISOString(),
    });
    if (error) throw error;
    await this.load();
  },

  // --- Lager (inventory) ---
  async saveItem(item) {
    const fields = {
      namn: item.namn,
      huvud: item.huvud,
      underkategori_id: item.underkategoriId,
      artikelnummer: item.artikelnummer || null,
      enhet: item.enhet,
      antal: item.antal,
      updated_by: window.currentUserEmail || null,
      updated_at: new Date().toISOString(),
    };
    if (item.id) {
      const { error } = await window.sb.from('inventory').update(fields).eq('id', item.id);
      if (error) throw error;
    } else {
      const { error } = await window.sb.from('inventory').insert(fields);
      if (error) throw error;
    }
    await this.load();
  },

  async deleteItem(id) {
    const { error } = await window.sb.from('inventory').delete().eq('id', id);
    if (error) throw error;
    await this.load();
  },

  // Sätter en varas antal (>= 0). Uppdaterar cachen direkt för snabb känsla.
  async setAmount(id, antal) {
    const value = Math.max(0, Math.round(antal * 100) / 100);
    const item = this.inventory.find(i => i.id === id);
    if (item) item.antal = value; // optimistiskt
    const { error } = await window.sb.from('inventory')
      .update({ antal: value, updated_by: window.currentUserEmail || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // --- Underkategorier ---
  async addSubcategory(huvud, namn) {
    const { data, error } = await window.sb.from('subcategories')
      .insert({ huvud, namn }).select().single();
    if (error) throw error;
    await this.load();
    return data ? data.id : null;
  },

  async renameSubcategory(id, namn) {
    const { error } = await window.sb.from('subcategories').update({ namn }).eq('id', id);
    if (error) throw error;
    await this.load();
  },

  async deleteSubcategory(id) {
    const { error } = await window.sb.from('subcategories').delete().eq('id', id);
    if (error) throw error;
    await this.load();
  },

  // --- Inventering (ögonblicksbild + nollställ) ---
  async saveSnapshotAndReset() {
    const subById = Object.fromEntries(this.subcategories.map(s => [s.id, s.namn]));
    const data = this.inventory.map(i => ({
      namn: i.namn,
      huvud: i.huvud,
      underkategori: subById[i.underkategoriId] || 'Övrigt',
      artikelnummer: i.artikelnummer || '',
      enhet: i.enhet,
      antal: i.antal,
    }));
    const { error: insErr } = await window.sb.from('inventory_snapshots')
      .insert({ skapad_av: window.currentUserEmail || null, data });
    if (insErr) throw insErr;
    // Nollställ alla antal
    const ids = this.inventory.map(i => i.id);
    if (ids.length) {
      const { error: updErr } = await window.sb.from('inventory')
        .update({ antal: 0, updated_by: window.currentUserEmail || null, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (updErr) throw updErr;
    }
    await this.load();
  },

  async getSnapshots() {
    const { data, error } = await window.sb.from('inventory_snapshots')
      .select('*').order('skapad_at', { ascending: false });
    if (error) { console.error('Kunde inte hämta inventeringar:', error); return []; }
    return data || [];
  },
};

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

// Måndag 00:00 för veckan som datumet ligger i.
function startOfWeek(date) {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  const mondayOffset = (x.getDay() + 6) % 7; // söndag=0 → 6, måndag=1 → 0
  x.setDate(x.getDate() - mondayOffset);
  return x;
}
function isThisWeek(iso) {
  const start = startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const d = new Date(iso);
  return d >= start && d < end;
}
function relativeTime(iso) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(iso); that.setHours(0, 0, 0, 0);
  const days = Math.round((today - that) / 86400000);
  if (days <= 0) return 'idag';
  if (days === 1) return 'igår';
  if (days < 14) return `${days} dagar sedan`;
  return new Date(iso).toLocaleDateString('sv-SE');
}
// 'bad' = senaste värdet över gränsen, 'due' = ej loggad denna vecka, 'ok' annars.
function unitStatus(unit) {
  const latest = Store.latestReading(unit.id);
  if (latest && isOutOfRange(latest.temp, unit.maxTemp)) return 'bad';
  if (!latest || !isThisWeek(latest.tidpunkt)) return 'due';
  return 'ok';
}
const STATUS_TEXT = {
  ok: '✓ Loggad denna vecka',
  due: 'Behöver loggas denna vecka',
  bad: '⚠ Senaste värdet över gränsen',
};
const PENCIL_SVG = '<svg class="edit-pencil" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.75 3.75L20.7 7Z" fill="currentColor"/></svg>';

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
  if (name === 'lager') renderInventory();
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

  renderUnitsStatus(units);

  units.forEach(unit => {
    const latest = Store.latestReading(unit.id);
    const status = unitStatus(unit);
    const card = document.createElement('div');
    card.className = `unit-card status-${status}`;

    let readingHtml;
    if (latest) {
      const bad = isOutOfRange(latest.temp, unit.maxTemp);
      const who = latest.loggad_av ? latest.loggad_av.split('@')[0] : '';
      readingHtml = `<div class="temp ${bad ? 'bad' : 'ok'}">${latest.temp}°C</div>
        <div class="meta">${relativeTime(latest.tidpunkt)}</div>
        ${who ? `<span class="who">${escapeHtml(who)}</span>` : ''}`;
    } else {
      readingHtml = `<div class="temp none">Ingen logg</div>`;
    }

    // Hela kortet redigerar; "Logga ny"-knappen loggar (egen träffyta).
    card.setAttribute('role', 'button');
    card.innerHTML = `
      <div class="type-icon ${unit.typ}">${ICONS[unit.typ] || ICONS.kyl}</div>
      <div class="info">
        <div class="name-row"><span class="name">${escapeHtml(unit.namn)}</span>${PENCIL_SVG}</div>
        <div class="meta">${unit.typ === 'kyl' ? 'Kyl' : 'Frys'} · max ${unit.maxTemp}°C</div>
        <div class="unit-status ${status}">${STATUS_TEXT[status]}</div>
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

// Statusbannrar: avvikelser (rött) och veckans framsteg.
function renderUnitsStatus(units) {
  const alert = $('#deviation-alert');
  const summary = $('#weekly-summary');

  if (units.length === 0) {
    alert.classList.add('hidden');
    summary.classList.add('hidden');
    return;
  }

  const deviations = units.filter(u => unitStatus(u) === 'bad').length;
  if (deviations > 0) {
    alert.textContent = deviations === 1
      ? '⚠ 1 enhet över gränsvärdet'
      : `⚠ ${deviations} enheter över gränsvärdet`;
    alert.classList.remove('hidden');
  } else {
    alert.classList.add('hidden');
  }

  const logged = units.filter(u => {
    const latest = Store.latestReading(u.id);
    return latest && isThisWeek(latest.tidpunkt);
  }).length;
  summary.classList.remove('hidden');
  if (logged === units.length) {
    summary.className = 'status-banner success';
    summary.textContent = '✓ Alla enheter loggade denna vecka';
  } else {
    summary.className = 'status-banner info';
    summary.textContent = `${logged} av ${units.length} enheter loggade denna vecka`;
  }
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

$('#unit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const unit = {
    id: $('#unit-id').value || null,
    namn: $('#unit-name').value.trim(),
    typ: $('#unit-type').value,
    maxTemp: parseFloat($('#unit-max').value),
  };
  if (!unit.namn || Number.isNaN(unit.maxTemp)) return;
  try {
    await Store.saveUnit(unit);
    closeUnitModal();
    renderUnits();
    showToast('Enhet sparad');
  } catch (err) {
    console.error(err);
    showToast('Kunde inte spara – kolla nätet');
  }
});

$('#unit-delete').addEventListener('click', async () => {
  const id = $('#unit-id').value;
  if (!id) return;
  if (!confirm('Ta bort enheten och alla dess loggningar?')) return;
  try {
    await Store.deleteUnit(id);
    closeUnitModal();
    renderUnits();
    showToast('Enhet borttagen');
  } catch (err) {
    console.error(err);
    showToast('Kunde inte ta bort – kolla nätet');
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
  // ±-knappen behövs bara för frys (negativa värden, som mobilens sifferknappsats saknar).
  $('#temp-sign').classList.toggle('hidden', !unit || unit.typ !== 'frys');
  renderTempChips();
  updateLogWarning();
}

// Växlar tecken på inskrivet värde (skriv siffran, tryck ± → negativt).
function toggleTempSign() {
  const input = $('#log-temp');
  const n = parseFloat(input.value);
  if (Number.isNaN(n)) { input.focus(); return; }
  input.value = String(-n);
  onTempChanged();
}

function updateLogWarning() {
  const warn = $('#log-warning');
  const noteLabel = $('#note-label');
  const unit = Store.getUnits().find(u => u.id === $('#log-unit').value);
  const temp = $('#log-temp').value;
  const outOfRange = unit && temp !== '' && isOutOfRange(temp, unit.maxTemp);
  if (outOfRange) {
    warn.textContent = `Varning: ${temp}°C är över gränsvärdet (max ${unit.maxTemp}°C för ${unit.namn}). Skriv vilken åtgärd som vidtogs innan du sparar.`;
    warn.classList.remove('hidden');
    noteLabel.textContent = 'Åtgärd vid avvikelse (obligatorisk)';
    noteLabel.classList.add('required');
  } else {
    warn.classList.add('hidden');
    noteLabel.textContent = 'Anteckning (frivillig)';
    noteLabel.classList.remove('required');
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

$('#temp-sign').addEventListener('click', toggleTempSign);
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

$('#log-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const unitId = $('#log-unit').value;
  const temp = parseFloat($('#log-temp').value);
  if (!unitId || Number.isNaN(temp)) return;

  // Vid avvikelse krävs en åtgärdsnotering innan loggen kan sparas.
  const unit = Store.getUnits().find(u => u.id === unitId);
  const note = $('#log-note').value.trim();
  if (unit && isOutOfRange(temp, unit.maxTemp) && !note) {
    showToast('Skriv vilken åtgärd som vidtogs');
    $('#log-note').focus();
    return;
  }

  const saveBtn = $('#log-save');
  saveBtn.disabled = true;
  try {
    await Store.addReading({
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
  } catch (err) {
    console.error(err);
    showToast('Kunde inte spara – kolla nätet');
  } finally {
    saveBtn.disabled = false;
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
    const who = r.loggad_av ? r.loggad_av.split('@')[0] : '';
    card.className = 'reading-card' + (bad ? ' bad' : '');
    card.innerHTML = `
      <div class="row">
        <span class="when">${formatDateTime(r.tidpunkt)}${who ? ' · ' + escapeHtml(who) : ''}</span>
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
function unitsById() {
  return Object.fromEntries(Store.getUnits().map(u => [u.id, u]));
}

function csvRowsFor(readings, byId) {
  const rows = [['Datum/tid', 'Enhet', 'Typ', 'Temp (C)', 'Max (C)', 'Avvikelse', 'Loggad av', 'Anteckning']];
  readings.forEach(r => {
    const unit = byId[r.unitId];
    if (!unit) return;
    rows.push([
      formatDateTime(r.tidpunkt),
      unit.namn,
      unit.typ,
      String(r.temp).replace('.', ','),
      String(unit.maxTemp).replace('.', ','),
      isOutOfRange(r.temp, unit.maxTemp) ? 'JA' : '',
      r.loggad_av || '',
      r.anteckning || '',
    ]);
  });
  return rows;
}

function downloadCsv(rows, filename) {
  const csv = rows.map(row =>
    row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(';')
  ).join('\r\n');
  // BOM (﻿) så att Excel läser å/ä/ö rätt.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFileName(s) {
  return s.replace(/[^\wåäöÅÄÖ -]/g, '').trim() || 'enhet';
}

const todayStamp = () => new Date().toISOString().slice(0, 10);

$('#export-btn').addEventListener('click', () => {
  const unitId = $('#history-unit').value;
  const unit = Store.getUnits().find(u => u.id === unitId);
  if (!unit) return;
  const readings = Store.readingsForUnit(unitId);
  if (readings.length === 0) {
    showToast('Inget att exportera för den här enheten');
    return;
  }
  downloadCsv(csvRowsFor(readings, unitsById()),
    `egenkontroll_${safeFileName(unit.namn)}_${todayStamp()}.csv`);
  showToast('CSV-fil nedladdad');
});

$('#export-all-btn').addEventListener('click', () => {
  const byId = unitsById();
  const readings = Store.getReadings().slice().sort((a, b) => {
    const na = (byId[a.unitId] && byId[a.unitId].namn) || '';
    const nb = (byId[b.unitId] && byId[b.unitId].namn) || '';
    return na.localeCompare(nb) || b.tidpunkt.localeCompare(a.tidpunkt);
  });
  if (readings.length === 0) {
    showToast('Inget att exportera');
    return;
  }
  downloadCsv(csvRowsFor(readings, byId), `egenkontroll_alla_${todayStamp()}.csv`);
  showToast('CSV-fil nedladdad (alla enheter)');
});

// ---------------------------------------------------------------------------
// Vy: Lager (inventory)
// ---------------------------------------------------------------------------
const HUVUD = [
  { key: 'forrad', label: 'Förråd' },
  { key: 'kyl', label: 'Kyl' },
  { key: 'frys', label: 'Frys' },
];
const HUVUD_LABEL = { forrad: 'Förråd', kyl: 'Kyl', frys: 'Frys' };

function formatNum(n) {
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}
function formatAmount(item) { return formatNum(item.antal); }

// Fällbara kategorier: vilka som är ihopfällda sparas (överlever omladdning).
let collapsedGroups = null;
function getCollapsed() {
  if (!collapsedGroups) {
    try { collapsedGroups = new Set(JSON.parse(localStorage.getItem('bowsapp.collapsed') || '[]')); }
    catch (e) { collapsedGroups = new Set(); }
  }
  return collapsedGroups;
}
function toggleCollapsed(key) {
  const c = getCollapsed();
  if (c.has(key)) c.delete(key); else c.add(key);
  localStorage.setItem('bowsapp.collapsed', JSON.stringify([...c]));
  renderInventory();
}

function renderInventory() {
  const wrap = $('#inventory-list');
  const items = Store.getInventory();
  wrap.innerHTML = '';
  $('#inventory-empty').classList.toggle('hidden', items.length > 0);
  const subById = Object.fromEntries(Store.getSubcategories().map(s => [s.id, s]));
  const collapsed = getCollapsed();

  HUVUD.forEach(h => {
    const inH = items.filter(i => i.huvud === h.key);
    if (inH.length === 0) return;
    const group = document.createElement('div');
    group.className = 'inv-group';

    const hKey = 'h:' + h.key;
    const hCollapsed = collapsed.has(hKey);
    const title = document.createElement('div');
    title.className = 'inv-group-title' + (hCollapsed ? ' collapsed' : '');
    title.innerHTML = `<span class="inv-chevron">▸</span><span>${h.label}</span><span class="inv-count">${inH.length}</span>`;
    title.addEventListener('click', () => toggleCollapsed(hKey));
    group.appendChild(title);

    if (!hCollapsed) {
      // Gruppera per underkategori-namn.
      const bySub = {};
      inH.forEach(i => {
        const namn = (subById[i.underkategoriId] && subById[i.underkategoriId].namn) || 'Övrigt';
        (bySub[namn] = bySub[namn] || []).push(i);
      });
      Object.keys(bySub).sort((a, b) => a.localeCompare(b)).forEach(subNamn => {
        const sub = document.createElement('div');
        sub.className = 'inv-subgroup';
        const sKey = 's:' + h.key + ':' + subNamn;
        const sCollapsed = collapsed.has(sKey);
        const subTitle = document.createElement('div');
        subTitle.className = 'inv-sub-title' + (sCollapsed ? ' collapsed' : '');
        subTitle.innerHTML = `<span class="inv-chevron">▸</span><span>${escapeHtml(subNamn)}</span><span class="inv-count">${bySub[subNamn].length}</span>`;
        subTitle.addEventListener('click', () => toggleCollapsed(sKey));
        sub.appendChild(subTitle);
        if (!sCollapsed) {
          bySub[subNamn].forEach(item => sub.appendChild(renderInventoryItem(item)));
        }
        group.appendChild(sub);
      });
    }
    wrap.appendChild(group);
  });
}

function renderInventoryItem(item) {
  const step = item.enhet === 'antal' ? 1 : 0.5;
  const row = document.createElement('div');
  row.className = 'inv-item';
  const art = item.artikelnummer ? `<small class="inv-art">#${escapeHtml(item.artikelnummer)}</small>` : '';
  row.innerHTML = `
    <span class="inv-name">${escapeHtml(item.namn)}${art}</span>
    <div class="inv-stepper">
      <button type="button" class="inv-step" data-act="dec" aria-label="Minska">−</button>
      <div class="inv-qty" data-act="edit">
        <span class="num">${formatAmount(item)}</span>
        <span class="unit">${item.enhet}</span>
      </div>
      <button type="button" class="inv-step" data-act="inc" aria-label="Öka">+</button>
    </div>
  `;

  // Hela raden (utom stepper) öppnar redigering av varan.
  row.addEventListener('click', () => openItemModal(item.id));
  row.querySelector('.inv-stepper').addEventListener('click', (e) => e.stopPropagation());

  row.querySelector('[data-act="dec"]').addEventListener('click', () => adjustItem(item, -step));
  row.querySelector('[data-act="inc"]').addEventListener('click', () => adjustItem(item, step));
  row.querySelector('[data-act="edit"]').addEventListener('click', () => editAmountInline(item, row));
  return row;
}

async function adjustItem(item, delta) {
  const next = Math.max(0, Math.round((item.antal + delta) * 100) / 100);
  try {
    await Store.setAmount(item.id, next);
    renderInventory();
  } catch (err) {
    console.error(err);
    showToast('Kunde inte uppdatera – kolla nätet');
    await Store.load();
    renderInventory();
  }
}

// Tryck på mängden → byt till ett inmatningsfält för exakt värde.
function editAmountInline(item, row) {
  const qty = row.querySelector('.inv-qty');
  const input = document.createElement('input');
  input.type = 'number';
  input.step = item.enhet === 'antal' ? '1' : '0.1';
  input.inputMode = 'decimal';
  input.className = 'inv-qty-input';
  input.value = item.antal;
  qty.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = async () => {
    if (done) return;
    done = true;
    const val = parseFloat(input.value);
    if (!Number.isNaN(val)) {
      try { await Store.setAmount(item.id, val); }
      catch (err) { console.error(err); showToast('Kunde inte spara'); await Store.load(); }
    }
    renderInventory();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { done = true; renderInventory(); }
  });
}

// --- Modal: lägg till / redigera vara ---
function setSeg(segSelector, hiddenSelector, value, dataAttr) {
  $(hiddenSelector).value = value;
  document.querySelectorAll(`${segSelector} .seg-btn`).forEach(b => {
    b.classList.toggle('active', b.dataset[dataAttr] === value);
  });
}

// Fyller underkategori-dropdownen för ett huvud, med valt id om angivet.
function fillSubcatSelect(huvud, selectedId) {
  const select = $('#item-underkategori');
  const subs = Store.subcategoriesFor(huvud).slice().sort((a, b) => a.namn.localeCompare(b.namn));
  select.innerHTML = '';
  subs.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.namn;
    select.appendChild(opt);
  });
  if (selectedId && subs.some(s => s.id === selectedId)) select.value = selectedId;
  else if (subs.length) select.selectedIndex = 0;
  updateSubActions();
}

// Visar Byt namn/Ta bort om vald underkategori inte är skyddade "Övrigt".
function updateSubActions() {
  const id = $('#item-underkategori').value;
  const sub = Store.getSubcategories().find(s => s.id === id);
  const editable = !!sub && sub.namn !== 'Övrigt';
  $('#item-sub-actions').classList.toggle('hidden', !editable);
  $('#item-sub-rename-row').classList.add('hidden');
}

function openItemModal(itemId) {
  const modal = $('#item-modal');
  const deleteBtn = $('#item-delete');
  if (itemId) {
    const item = Store.getInventory().find(i => i.id === itemId);
    if (!item) return;
    $('#item-modal-title').textContent = 'Redigera vara';
    $('#item-id').value = item.id;
    $('#item-name').value = item.namn;
    setSeg('#item-huvud-seg', '#item-huvud', item.huvud, 'huvud');
    fillSubcatSelect(item.huvud, item.underkategoriId);
    $('#item-artikelnummer').value = item.artikelnummer || '';
    setSeg('#item-enhet-seg', '#item-enhet', item.enhet, 'enhet');
    $('#item-antal').value = item.antal;
    deleteBtn.classList.remove('hidden');
  } else {
    $('#item-modal-title').textContent = 'Ny vara';
    $('#item-form').reset();
    $('#item-id').value = '';
    setSeg('#item-huvud-seg', '#item-huvud', 'forrad', 'huvud');
    fillSubcatSelect('forrad');
    $('#item-artikelnummer').value = '';
    setSeg('#item-enhet-seg', '#item-enhet', 'kg', 'enhet');
    $('#item-antal').value = '0';
    deleteBtn.classList.add('hidden');
  }
  hideNewSubRow();
  modal.classList.remove('hidden');
}
function closeItemModal() { $('#item-modal').classList.add('hidden'); }

$('#add-item-btn').addEventListener('click', () => openItemModal(null));
$('#item-cancel').addEventListener('click', closeItemModal);

document.querySelectorAll('#item-huvud-seg .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setSeg('#item-huvud-seg', '#item-huvud', btn.dataset.huvud, 'huvud');
    fillSubcatSelect(btn.dataset.huvud);
    hideNewSubRow();
  });
});
document.querySelectorAll('#item-enhet-seg .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => setSeg('#item-enhet-seg', '#item-enhet', btn.dataset.enhet, 'enhet'));
});

function hideNewSubRow() {
  $('#item-sub-new-row').classList.add('hidden');
  $('#item-sub-new-name').value = '';
}

$('#item-sub-new').addEventListener('click', () => {
  $('#item-sub-new-row').classList.remove('hidden');
  $('#item-sub-new-name').focus();
});
$('#item-sub-new-cancel').addEventListener('click', hideNewSubRow);

$('#item-sub-new-save').addEventListener('click', async () => {
  const huvud = $('#item-huvud').value;
  const namn = $('#item-sub-new-name').value.trim();
  if (!namn) { $('#item-sub-new-name').focus(); return; }
  try {
    const id = await Store.addSubcategory(huvud, namn);
    fillSubcatSelect(huvud, id);
    hideNewSubRow();
    showToast('Underkategori skapad');
  } catch (err) {
    console.error(err);
    showToast('Kunde inte skapa underkategori');
  }
});

// Visa/dölj knapparna när man byter underkategori i listan.
$('#item-underkategori').addEventListener('change', updateSubActions);

// Byt namn på vald underkategori (inline-fält).
$('#item-sub-rename').addEventListener('click', () => {
  const sub = Store.getSubcategories().find(s => s.id === $('#item-underkategori').value);
  if (!sub) return;
  $('#item-sub-rename-name').value = sub.namn;
  $('#item-sub-rename-row').classList.remove('hidden');
  $('#item-sub-rename-name').focus();
});
$('#item-sub-rename-cancel').addEventListener('click', () => {
  $('#item-sub-rename-row').classList.add('hidden');
});
$('#item-sub-rename-save').addEventListener('click', async () => {
  const id = $('#item-underkategori').value;
  const huvud = $('#item-huvud').value;
  const namn = $('#item-sub-rename-name').value.trim();
  if (!namn) { $('#item-sub-rename-name').focus(); return; }
  try {
    await Store.renameSubcategory(id, namn);
    fillSubcatSelect(huvud, id);
    showToast('Namn ändrat');
  } catch (err) {
    console.error(err);
    showToast('Kunde inte byta namn');
  }
});

// Ta bort vald underkategori (blockeras om den har varor; "Övrigt" skyddad).
$('#item-sub-delete').addEventListener('click', async () => {
  const id = $('#item-underkategori').value;
  const huvud = $('#item-huvud').value;
  const sub = Store.getSubcategories().find(s => s.id === id);
  if (!sub || sub.namn === 'Övrigt') return;
  if (Store.getInventory().some(i => i.underkategoriId === id)) {
    showToast('Flytta varorna först');
    return;
  }
  try {
    await Store.deleteSubcategory(id);
    fillSubcatSelect(huvud);
    showToast('Underkategori borttagen');
  } catch (err) {
    console.error(err);
    showToast('Kunde inte ta bort');
  }
});

$('#item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const item = {
    id: $('#item-id').value || null,
    namn: $('#item-name').value.trim(),
    huvud: $('#item-huvud').value,
    underkategoriId: $('#item-underkategori').value || null,
    artikelnummer: $('#item-artikelnummer').value.trim(),
    enhet: $('#item-enhet').value,
    antal: Math.max(0, parseFloat($('#item-antal').value) || 0),
  };
  if (!item.namn) return;
  if (!item.underkategoriId) { showToast('Välj en underkategori'); return; }
  try {
    await Store.saveItem(item);
    closeItemModal();
    renderInventory();
    showToast('Vara sparad');
  } catch (err) {
    console.error(err);
    showToast('Kunde inte spara – kolla nätet');
  }
});

$('#item-delete').addEventListener('click', async () => {
  const id = $('#item-id').value;
  if (!id) return;
  if (!confirm('Ta bort varan?')) return;
  try {
    await Store.deleteItem(id);
    closeItemModal();
    renderInventory();
    showToast('Vara borttagen');
  } catch (err) {
    console.error(err);
    showToast('Kunde inte ta bort – kolla nätet');
  }
});

// --- Inventering: sammanfatta & nollställ + historik ---
$('#snapshot-btn').addEventListener('click', async () => {
  if (Store.getInventory().length === 0) { showToast('Inget att sammanfatta'); return; }
  if (!confirm('Spara en sammanfattning av lagret och nollställ alla antal?')) return;
  try {
    await Store.saveSnapshotAndReset();
    renderInventory();
    showToast('Inventering sparad, antal nollställda');
  } catch (err) {
    console.error(err);
    showToast('Kunde inte spara – kolla nätet');
  }
});

let currentSnapshot = null;

async function openSnapshots() {
  $('#snapshot-detail').classList.add('hidden');
  $('#snapshot-detail').innerHTML = '';
  $('#snapshot-export').classList.add('hidden');
  $('#snapshots-list').classList.remove('hidden');
  $('#snapshots-title').textContent = 'Tidigare inventeringar';
  $('#snapshots-modal').classList.remove('hidden');
  renderSnapshotList(await Store.getSnapshots());
}

function renderSnapshotList(snaps) {
  const list = $('#snapshots-list');
  list.innerHTML = '';
  $('#snapshots-empty').classList.toggle('hidden', snaps.length > 0);
  snaps.forEach(s => {
    const who = s.skapad_av ? s.skapad_av.split('@')[0] : '';
    const count = Array.isArray(s.data) ? s.data.length : 0;
    const card = document.createElement('div');
    card.className = 'reading-card snap-card';
    card.innerHTML = `<div class="row">
      <span class="when">${formatDateTime(s.skapad_at)}${who ? ' · ' + escapeHtml(who) : ''}</span>
      <span class="val">${count} varor</span></div>`;
    card.addEventListener('click', () => showSnapshotDetail(s));
    list.appendChild(card);
  });
}

function showSnapshotDetail(s) {
  currentSnapshot = s;
  $('#snapshots-list').classList.add('hidden');
  $('#snapshots-empty').classList.add('hidden');
  $('#snapshots-title').textContent = formatDateTime(s.skapad_at);
  const data = Array.isArray(s.data) ? s.data : [];
  let html = '';
  ['forrad', 'kyl', 'frys'].forEach(h => {
    const inH = data.filter(d => d.huvud === h);
    if (!inH.length) return;
    html += `<div class="inv-group-title">${HUVUD_LABEL[h] || h}</div>`;
    inH.forEach(d => {
      const art = d.artikelnummer ? ` · #${escapeHtml(d.artikelnummer)}` : '';
      html += `<div class="snap-row">
        <span>${escapeHtml(d.namn)}<small>${escapeHtml(d.underkategori || '')}${art}</small></span>
        <span class="snap-amt">${formatNum(d.antal)} ${escapeHtml(d.enhet)}</span></div>`;
    });
  });
  const detail = $('#snapshot-detail');
  detail.innerHTML = html || '<p class="empty-msg">Tomt.</p>';
  detail.classList.remove('hidden');
  $('#snapshot-export').classList.remove('hidden');
}

$('#snapshots-history-btn').addEventListener('click', openSnapshots);

$('#snapshots-close').addEventListener('click', () => {
  // Från detaljvy → tillbaka till listan; annars stäng modalen.
  if (!$('#snapshot-detail').classList.contains('hidden')) {
    $('#snapshot-detail').classList.add('hidden');
    $('#snapshot-export').classList.add('hidden');
    $('#snapshots-list').classList.remove('hidden');
    $('#snapshots-title').textContent = 'Tidigare inventeringar';
    currentSnapshot = null;
  } else {
    $('#snapshots-modal').classList.add('hidden');
  }
});

$('#snapshot-export').addEventListener('click', () => {
  if (!currentSnapshot) return;
  const data = Array.isArray(currentSnapshot.data) ? currentSnapshot.data : [];
  const rows = [['Huvudkategori', 'Underkategori', 'Vara', 'Artikelnummer', 'Antal', 'Enhet']];
  data.forEach(d => rows.push([
    HUVUD_LABEL[d.huvud] || d.huvud, d.underkategori || '', d.namn,
    d.artikelnummer || '', String(d.antal).replace('.', ','), d.enhet,
  ]));
  downloadCsv(rows, `inventering_${String(currentSnapshot.skapad_at).slice(0, 10)}.csv`);
  showToast('CSV-fil nedladdad');
});

// ---------------------------------------------------------------------------
// Realtid: uppdatera cachen och vyn när någon annan ändrar data.
// ---------------------------------------------------------------------------
let realtimeTimer = null;
function onRemoteChange() {
  // Liten fördröjning ifall flera ändringar kommer tätt.
  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(async () => {
    await Store.load();
    // Rita om aktuell vy. Logg-vyn lämnas ifred så pågående inmatning inte
    // skrivs över; övriga vyer är säkra att rita om.
    const active = document.querySelector('.nav-btn.active');
    const view = active ? active.dataset.view : 'units';
    if (view === 'units') renderUnits();
    else if (view === 'history') renderHistoryList();
    else if (view === 'lager') renderInventory();
  }, 150);
}

function onSnapshotsChange() {
  const modal = $('#snapshots-modal');
  if (!modal.classList.contains('hidden') && !$('#snapshots-list').classList.contains('hidden')) {
    Store.getSnapshots().then(renderSnapshotList);
  }
}

function subscribeRealtime() {
  window.sb.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, onRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'readings' }, onRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, onRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'subcategories' }, onRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_snapshots' }, onSnapshotsChange)
    .subscribe();
}

// ---------------------------------------------------------------------------
// Start: körs av auth.js när inloggning OCH åtkomst är bekräftad.
// ---------------------------------------------------------------------------
let appStarted = false;
window.onAppReady = async function () {
  if (appStarted) return;
  appStarted = true;
  await Store.load();
  showView('units');
  subscribeRealtime();
};
