// app.js — Sugar Marina Guest CRM (v4)
'use strict';

const API       = '/api';
const PAGE_SIZE = 20;

// ── State ────────────────────────────────────────────────────────────────────
let allGuests   = [];   // filtered + paginated source
let _rawGuests  = [];   // full API response (pre client-side filter)
let branches    = [];   // cached branch list
let currentPage = 1;

// OTP state
let _otpGuestId   = null;
let _otpEmail     = null;
let _otpCountdown = null;

// ══════════════════════════════════════════════════ UTILITIES ════════════════

// ── Toast / showToast ────────────────────────────────────────────────────────
const _TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️' };

function showToast(msg, type = 'info', duration = 3500) {
  const el   = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const txt  = document.getElementById('toastMsg');
  icon.textContent = _TOAST_ICONS[type] || 'ℹ️';
  txt.textContent  = msg;
  el.className     = `show ${type}`;
  el.style.cssText = 'opacity:1;transform:translateY(0)';
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.cssText = 'opacity:0;transform:translateY(8px)';
  }, duration);
}
// Alias
const toast = showToast;

// ── Loading overlay ──────────────────────────────────────────────────────────
let _loadingDepth = 0;
function showLoading() {
  _loadingDepth++;
  let el = document.getElementById('_globalSpinner');
  if (!el) {
    el = document.createElement('div');
    el.id = '_globalSpinner';
    el.style.cssText = [
      'position:fixed;inset:0;z-index:9999;background:rgba(10,22,40,.35)',
      'backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center',
    ].join(';');
    el.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px 32px;display:flex;align-items:center;gap:14px;box-shadow:0 16px 48px rgba(10,22,40,.22);">'
      + '<div class="spin"></div>'
      + '<span style="font-weight:600;color:#0f172a;font-size:.9rem;">กำลังโหลด…</span>'
      + '</div>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}
function hideLoading() {
  _loadingDepth = Math.max(0, _loadingDepth - 1);
  if (_loadingDepth === 0) {
    const el = document.getElementById('_globalSpinner');
    if (el) el.style.display = 'none';
  }
}

// ── Date helpers ─────────────────────────────────────────────────────────────
/** Format ISO date → DD/MM/YYYY */
function formatDate(iso) {
  if (!iso) return '—';
  const d  = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
/** Format ISO date → Thai short locale (for display) */
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}
function calcCheckout(checkin, nights) {
  if (!checkin || !nights) return null;
  const d = new Date(checkin);
  d.setDate(d.getDate() + parseInt(nights));
  return d.toISOString().substring(0, 10);
}

// ── String / HTML helpers ────────────────────────────────────────────────────
function esc(v) {
  return String(v ?? '').replace(/['"<>&]/g, c =>
    ({ '\'': '&#39;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}
/** j***@gmail.com */
function maskEmail(email) {
  const [user, domain] = (email || '').split('@');
  if (!domain) return email;
  const masked = user[0] + '***' + (user.length > 4 ? user.slice(-1) : '');
  return `${masked}@${domain}`;
}

// ══════════════════════════════════════════════════ NAVIGATION ═══════════════

const PAGES     = ['dashboard', 'guests', 'stays', 'branches'];
const PAGE_META = {
  dashboard: ['Dashboard',        'ภาพรวมระบบ CRM'],
  guests:    ['แขก (Guests)',     'รายการแขกทั้งหมด'],
  stays:     ['ประวัติการพัก',    'Stays ทั้งหมด'],
  branches:  ['สาขา',            'Sugar Marina Hotel Collection'],
};

function showPage(name) {
  PAGES.forEach(p => {
    document.getElementById(`page-${p}`).style.display = (p === name) ? 'block' : 'none';
    document.getElementById(`nav-${p}`)?.classList.toggle('active', p === name);
    document.getElementById(`mnav-${p}`)?.classList.toggle('active', p === name);
  });
  const [title, sub] = PAGE_META[name] || ['—', ''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = sub;
  // Scroll to top on page change (mobile)
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'dashboard') loadDashboard();
  if (name === 'guests')    loadGuests();
  if (name === 'stays')     loadAllStays();
  if (name === 'branches')  loadBranchesPage();
}

// ══════════════════════════════════════════════════ VALIDATION ════════════════

function setFieldError(fieldId, errId, msg) {
  document.getElementById(fieldId)?.classList.add('error');
  const e = document.getElementById(errId);
  if (e) { e.textContent = msg; e.classList.add('show'); }
}
function clearFieldError(fieldId, errId) {
  document.getElementById(fieldId)?.classList.remove('error');
  document.getElementById(errId)?.classList.remove('show');
}
function clearAllErrors(pairs) {
  pairs.forEach(([f, e]) => clearFieldError(f, e));
}

// ══════════════════════════════════════════════════ DATA LOADING ══════════════

// ── loadDashboardStats — GET /api/guests/stats → update stat cards ────────────
async function loadDashboardStats() {
  try {
    const data = await fetch(`${API}/guests/stats`).then(r => r.json());
    document.getElementById('d-total').textContent      = data.total_guests;
    document.getElementById('d-verified').textContent   = data.verified;
    document.getElementById('d-unverified').textContent = data.unverified;
    document.getElementById('d-stays').textContent      = data.total_stays;
    const badge = document.getElementById('d-unverified-badge');
    if (badge) badge.style.display = +data.unverified > 0 ? 'inline-flex' : 'none';
  } catch {
    showToast('โหลด stats ไม่สำเร็จ', 'error');
  }
}

async function _loadBranchStatsWidget() {
  try {
    const data = await fetch(`${API}/branches/stats`).then(r => r.json());
    const max  = Math.max(...data.map(b => +b.stay_count), 1);
    document.getElementById('branchStats').innerHTML = data.slice(0, 5).map(b => {
      const pct   = Math.round((+b.stay_count / max) * 100);
      const short = b.name
        .replace(/Sugar Marina (Hotel|Resort) - /, '')
        .replace('Sugar Marina ', '').trim();
      return `<div>
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
          <span style="font-size:.84rem;font-weight:600;color:#374151;">${esc(short)}</span>
          <span style="font-size:.75rem;font-weight:700;color:#6b7280;">${b.stay_count} stay</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
    }).join('') || '<p style="color:#9ca3af;font-size:.875rem;text-align:center;padding:16px 0;">ยังไม่มีข้อมูล</p>';
  } catch {
    showToast('โหลด branch stats ไม่สำเร็จ', 'error');
  }
}

async function _loadRecentGuestsWidget() {
  try {
    const guests = await fetch(`${API}/guests`).then(r => r.json());
    document.getElementById('recentGuests').innerHTML = guests.slice(0, 5).map(g => `
      <tr>
        <td>
          <div style="font-weight:600;color:#374151;">${esc(g.first_name)} ${esc(g.last_name)}</div>
          <div style="font-size:.72rem;color:#9ca3af;">${esc(g.email)}</div>
        </td>
        <td style="color:#6b7280;font-size:.875rem;">${esc(g.nationality) || '—'}</td>
        <td>${g.email_verified
          ? '<span class="badge badge-verified">ยืนยันแล้ว</span>'
          : '<span class="badge badge-unverified">รอยืนยัน</span>'}</td>
        <td style="color:#9ca3af;font-size:.75rem;">${fmtDate(g.created_at)}</td>
      </tr>`).join('')
      || '<tr><td colspan="4" style="text-align:center;padding:32px;color:#9ca3af;">ยังไม่มีแขก</td></tr>';
  } catch {
    showToast('โหลด recent guests ไม่สำเร็จ', 'error');
  }
}

async function loadDashboard() {
  await Promise.all([loadDashboardStats(), _loadBranchStatsWidget(), _loadRecentGuestsWidget()]);
}

// ── loadBranches — GET /api/branches → populate ALL dropdowns ─────────────────
async function loadBranches(force = false) {
  if (branches.length && !force) return;
  try {
    branches = await fetch(`${API}/branches`).then(r => r.json());
  } catch {
    showToast('โหลด branches ไม่สำเร็จ', 'error');
    return;
  }
  // Filter bar dropdown
  _populateSelect('filterBranch', branches, b => {
    const label = b.name.replace(/Sugar Marina (Hotel|Resort) - /, '').replace('Sugar Marina ', '');
    return { value: b.id, label };
  }, true);
  // Stay modal dropdown
  _populateSelect('stayBranchId', branches, b => ({ value: b.id, label: b.name }), true);
  // Add-stay modal dropdown
  _populateSelect('addStayBranchId', branches, b => ({ value: b.id, label: b.name }), true);
}

/** Populate a <select> preserving the first placeholder option */
function _populateSelect(selId, items, mapper, keepFirst = false) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const first = keepFirst ? sel.options[0] : null;
  sel.innerHTML = '';
  if (first) sel.add(first);
  items.forEach(item => {
    const { value, label } = mapper(item);
    sel.add(new Option(label, value));
  });
}

// ── loadGuests — GET /api/guests → render table ───────────────────────────────
async function loadGuests() {
  const { branchId } = _getFilters();
  const params = new URLSearchParams();
  if (branchId) params.set('branch_id', branchId);

  document.getElementById('guestBody').innerHTML =
    `<tr><td colspan="9" style="text-align:center;padding:48px;color:#9ca3af;">
      <div style="display:flex;justify-content:center;margin-bottom:10px;"><div class="spin"></div></div>
      กำลังโหลด…
    </td></tr>`;

  try {
    _rawGuests = await fetch(`${API}/guests?${params}`).then(r => r.json());
    filterGuests();
  } catch {
    showToast('โหลดรายการแขกไม่สำเร็จ', 'error');
  }
}

/** Re-fetch preserving filter state — used after all CRUD operations */
async function refreshGuests() {
  const { branchId } = _getFilters();
  const params = new URLSearchParams();
  if (branchId) params.set('branch_id', branchId);
  try {
    _rawGuests = await fetch(`${API}/guests?${params}`).then(r => r.json());
    filterGuests();
  } catch { /* silent */ }
}

// ══════════════════════════════════════════════════ FILTER & SEARCH ═══════════

function _getFilters() {
  return {
    search:   (document.getElementById('filterSearch')?.value  || '').trim(),
    verified: document.getElementById('filterVerified')?.value || '',
    branchId: document.getElementById('filterBranch')?.value   || '',
  };
}

/** Highlight keyword matches with <mark> */
function _highlight(text, query) {
  if (!query || !text) return esc(text);
  const safe  = esc(text);
  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safe.replace(regex, '<mark>$1</mark>');
}

/** filterGuests — apply keyword + verified filter on _rawGuests, then re-render */
function filterGuests() {
  const { search, verified, branchId } = _getFilters();
  const q = search.toLowerCase();

  allGuests = _rawGuests.filter(g => {
    if (q) {
      const hay = [g.first_name, g.last_name, g.email, g.phone, g.nationality]
        .map(v => (v || '').toLowerCase()).join(' ');
      if (!hay.includes(q)) return false;
    }
    if (verified === 'true'  && !g.email_verified) return false;
    if (verified === 'false' &&  g.email_verified) return false;
    return true;
  });

  currentPage = 1;
  _updateActiveFiltersUI(search, verified, branchId);
  _renderGuestsTable(search);
}
// Alias
const applyFilters = filterGuests;

function _updateActiveFiltersUI(search, verified, branchId) {
  const row  = document.getElementById('activeFiltersRow');
  const tags = document.getElementById('filterTags');
  const pills = [];

  if (search)   pills.push(`<span class="filter-tag">🔍 "${esc(search)}"</span>`);
  if (verified === 'true')  pills.push('<span class="filter-tag">✅ ยืนยันแล้ว</span>');
  if (verified === 'false') pills.push('<span class="filter-tag">⏳ รอยืนยัน</span>');
  if (branchId) {
    const b = branches.find(x => String(x.id) === String(branchId));
    if (b) pills.push(`<span class="filter-tag">🏢 ${esc(b.name.replace(/Sugar Marina (Hotel|Resort) - /, '').replace('Sugar Marina ', ''))}</span>`);
  }

  tags.innerHTML    = pills.join('');
  row.style.display = pills.length ? 'flex' : 'none';

  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.display = search ? 'block' : 'none';
}

function _renderGuestsTable(searchQuery = '') {
  const q      = searchQuery.toLowerCase();
  const total  = allGuests.length;
  const rawN   = _rawGuests.length;
  const pages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start  = (currentPage - 1) * PAGE_SIZE;
  const slice  = allGuests.slice(start, start + PAGE_SIZE);

  let countText = `แสดง ${slice.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, total)} จาก ${total} รายการ`;
  if (total !== rawN) countText += ` <span style="color:#9ca3af;">(กรองจาก ${rawN})</span>`;
  document.getElementById('guestCountLabel').innerHTML = countText;
  document.getElementById('pageInfo').textContent      = `หน้า ${currentPage} / ${pages}`;
  document.getElementById('prevPage').disabled         = currentPage <= 1;
  document.getElementById('nextPage').disabled         = currentPage >= pages;

  if (!slice.length) {
    document.getElementById('guestBody').innerHTML =
      `<tr><td colspan="9" style="text-align:center;padding:64px;color:#9ca3af;">
        <div style="font-size:2.5rem;margin-bottom:12px;">🔍</div>
        <div style="font-weight:600;margin-bottom:4px;">ไม่พบแขกที่ค้นหา</div>
        <div style="font-size:.8rem;margin-bottom:14px;">ลองเปลี่ยนเงื่อนไขการค้นหา</div>
        <button onclick="clearFilters()"
          style="font-size:.8rem;color:#2d56a0;font-weight:700;background:none;border:none;cursor:pointer;text-decoration:underline;">
          ล้างตัวกรองทั้งหมด
        </button>
      </td></tr>`;
    return;
  }

  document.getElementById('guestBody').innerHTML = slice.map((g, i) => {
    const hl = v => _highlight(v, q);
    return `
    <tr>
      <td style="color:#9ca3af;font-size:.75rem;">${start + i + 1}</td>
      <td><div style="font-weight:600;color:#0f172a;">${hl(g.first_name)} ${hl(g.last_name)}</div></td>
      <td style="font-size:.8rem;color:#6b7280;">${hl(g.email)}</td>
      <td style="font-size:.875rem;color:#6b7280;">${hl(g.phone) || '—'}</td>
      <td style="font-size:.875rem;color:#6b7280;">${hl(g.nationality) || '—'}</td>
      <td style="font-size:.8rem;color:#9ca3af;">${fmtDate(g.birthday)}</td>
      <td>${g.email_verified
        ? '<span class="badge badge-verified">✅ ยืนยันแล้ว</span>'
        : `<div style="display:flex;align-items:center;gap:6px;">
             <span class="badge badge-unverified">⏳ รอยืนยัน</span>
             <button class="btn btn-amber" style="padding:4px 10px;font-size:.72rem;"
                     onclick="openOTPModal(${g.id},'${esc(g.email)}',true)">ส่ง OTP</button>
           </div>`}</td>
      <td><span style="background:#eef2f9;color:#1e3f84;border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:700;">${g.stay_count ?? '—'}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:4px;">
          <button class="btn btn-icon" onclick="openEditGuestModal(${g.id})" title="แก้ไข">✏️</button>
          <button class="btn btn-icon" onclick="openStayModal(${g.id})"      title="ประวัติพัก">🏨</button>
          <button class="btn btn-danger" onclick="deleteGuest(${g.id},'${esc(g.first_name)} ${esc(g.last_name)}')" title="ลบ">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function changePage(dir) {
  const pages = Math.ceil(allGuests.length / PAGE_SIZE);
  currentPage = Math.max(1, Math.min(pages, currentPage + dir));
  _renderGuestsTable(_getFilters().search);
  document.getElementById('page-guests').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let _sTimer;
function debounceGuestSearch() {
  const input = document.getElementById('filterSearch');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.display = input.value ? 'block' : 'none';
  clearTimeout(_sTimer);
  _sTimer = setTimeout(filterGuests, 300);
}

function clearSearchInput() {
  document.getElementById('filterSearch').value = '';
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  filterGuests();
}

/** clearFilters — reset all filters and re-fetch from server */
function clearFilters() {
  document.getElementById('filterSearch').value   = '';
  document.getElementById('filterVerified').value = '';
  document.getElementById('filterBranch').value   = '';
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  loadGuests();
}
// Alias for HTML onchange handlers
const clearAllFilters = clearFilters;

// ── exportCSV — GET /api/guests/export → auto download ───────────────────────
async function exportCSV() {
  const btn  = document.getElementById('exportCsvBtn');
  const orig = btn?.innerHTML;
  if (btn) { btn.innerHTML = '⏳ กำลัง Export…'; btn.disabled = true; }
  try {
    const res = await fetch(`${API}/guests/export`);
    if (!res.ok) throw new Error('Export failed');
    const blob  = await res.blob();
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href      = url;
    const cd    = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="([^"]+)"/);
    a.download  = match ? match[1] : 'sugar-marina-guests.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export สำเร็จ', 'success');
  } catch {
    showToast('Export ไม่สำเร็จ กรุณาลองใหม่', 'error');
  } finally {
    if (btn) { btn.innerHTML = orig; btn.disabled = false; }
  }
}
// Alias used in HTML onclick
const exportGuestsCSV = exportCSV;

// ══════════════════════════════════════════════════ GUEST CRUD ════════════════

// ── Stay fields inside Guest Modal ───────────────────────────────────────────
function toggleStayFields() {
  const enabled = document.getElementById('enableStayFields').checked;
  document.getElementById('stayFieldsWrap').style.display = enabled ? 'block' : 'none';
  if (!enabled) {
    clearAllErrors([
      ['guestStayBranch','err-guestStayBranch'],
      ['guestStayCheckIn','err-guestStayCheckIn'],
      ['guestStayNights','err-guestStayNights'],
    ]);
    document.getElementById('guestStayCheckoutPreview').style.display = 'none';
  }
}

function updateGuestStayCheckout() {
  const d  = document.getElementById('guestStayCheckIn').value;
  const n  = document.getElementById('guestStayNights').value;
  const co = calcCheckout(d, n);
  const el = document.getElementById('guestStayCheckoutPreview');
  if (co) {
    document.getElementById('guestStayCheckoutDate').textContent = fmtDate(co + 'T00:00:00');
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

function _resetGuestStayFields() {
  document.getElementById('enableStayFields').checked           = false;
  document.getElementById('stayFieldsWrap').style.display       = 'none';
  document.getElementById('guestStayCheckoutPreview').style.display = 'none';
  document.getElementById('guestStayBranch').value  = '';
  document.getElementById('guestStayCheckIn').value = '';
  document.getElementById('guestStayNights').value  = '';
  document.getElementById('guestStayPrefs').value   = '';
  clearAllErrors([
    ['guestStayBranch','err-guestStayBranch'],
    ['guestStayCheckIn','err-guestStayCheckIn'],
    ['guestStayNights','err-guestStayNights'],
  ]);
}

function openAddGuestModal() {
  document.getElementById('guestModalTitle').textContent = 'เพิ่มแขกใหม่';
  document.getElementById('guestModalSub').textContent   = 'กรอกข้อมูลแขกและบันทึก';
  document.getElementById('guestForm').reset();
  document.getElementById('guestId').value = '';
  const badge = document.getElementById('emailVerifiedBadge');
  if (badge) badge.style.display = 'none';
  // Show stay section for new guest; hide for edit
  document.getElementById('guestStaySection').style.display = 'block';
  _resetGuestStayFields();
  // Populate branch dropdown
  _populateSelect('guestStayBranch', branches, b => ({ value: b.id, label: b.name }), true);
  clearAllErrors([
    ['firstName','err-firstName'],
    ['lastName','err-lastName'],
    ['guestEmail','err-email'],
  ]);
  openModal('guestModal');
}

async function openEditGuestModal(id) {
  try {
    const g = await fetch(`${API}/guests/${id}`).then(r => r.json());
    document.getElementById('guestModalTitle').textContent = 'แก้ไขข้อมูลแขก';
    document.getElementById('guestModalSub').textContent   = `ID: ${g.id}`;
    document.getElementById('guestId').value       = g.id;
    document.getElementById('firstName').value     = g.first_name;
    document.getElementById('lastName').value      = g.last_name;
    document.getElementById('guestEmail').value    = g.email;
    document.getElementById('phone').value         = g.phone       || '';
    document.getElementById('birthday').value      = g.birthday    ? g.birthday.substring(0, 10) : '';
    document.getElementById('nationality').value   = g.nationality || '';
    document.getElementById('notes').value         = g.notes       || '';
    const badge = document.getElementById('emailVerifiedBadge');
    if (badge) {
      badge.style.display = 'inline-flex';
      badge.className     = g.email_verified ? 'badge badge-verified' : 'badge badge-unverified';
      badge.textContent   = g.email_verified ? '✅ ยืนยันแล้ว' : '⏳ รอยืนยัน';
      badge.style.cssText += ';position:absolute;right:10px;top:50%;transform:translateY(-50%);';
    }
    // Hide stay section on edit (use Stay modal instead)
    document.getElementById('guestStaySection').style.display = 'none';
    clearAllErrors([
      ['firstName','err-firstName'],
      ['lastName','err-lastName'],
      ['guestEmail','err-email'],
    ]);
    openModal('guestModal');
  } catch {
    showToast('โหลดข้อมูลแขกไม่สำเร็จ', 'error');
  }
}

async function saveGuest(e) {
  e.preventDefault();
  clearAllErrors([
    ['firstName','err-firstName'],
    ['lastName','err-lastName'],
    ['guestEmail','err-email'],
  ]);

  const fn    = document.getElementById('firstName').value.trim();
  const ln    = document.getElementById('lastName').value.trim();
  const email = document.getElementById('guestEmail').value.trim();
  let valid   = true;

  if (!fn)    { setFieldError('firstName',  'err-firstName', 'กรุณากรอกชื่อ');             valid = false; }
  if (!ln)    { setFieldError('lastName',   'err-lastName',  'กรุณากรอกนามสกุล');          valid = false; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
              { setFieldError('guestEmail', 'err-email',     'กรุณากรอกอีเมลที่ถูกต้อง'); valid = false; }

  // Validate stay fields if checkbox is checked
  const stayEnabled = document.getElementById('enableStayFields')?.checked;
  const stayBranch  = document.getElementById('guestStayBranch')?.value;
  const stayCheckIn = document.getElementById('guestStayCheckIn')?.value;
  const stayNights  = document.getElementById('guestStayNights')?.value;
  if (stayEnabled) {
    clearAllErrors([
      ['guestStayBranch','err-guestStayBranch'],
      ['guestStayCheckIn','err-guestStayCheckIn'],
      ['guestStayNights','err-guestStayNights'],
    ]);
    if (!stayBranch)                { setFieldError('guestStayBranch',  'err-guestStayBranch',  'กรุณาเลือกสาขา');      valid = false; }
    if (!stayCheckIn)               { setFieldError('guestStayCheckIn', 'err-guestStayCheckIn', 'กรุณาเลือกวันที่');    valid = false; }
    if (!stayNights || +stayNights < 1) { setFieldError('guestStayNights', 'err-guestStayNights', 'กรุณาระบุจำนวนคืน'); valid = false; }
  }
  if (!valid) return;

  const id  = document.getElementById('guestId').value;
  const btn = document.getElementById('guestSubmitBtn');
  const txt = document.getElementById('guestSubmitText');
  btn.disabled  = true;
  txt.innerHTML = '<span class="spin-sm"></span> กำลังบันทึก…';

  const body = {
    first_name:  fn,
    last_name:   ln,
    email,
    phone:       document.getElementById('phone').value.trim() || null,
    birthday:    document.getElementById('birthday').value     || null,
    nationality: document.getElementById('nationality').value  || null,
    notes:       document.getElementById('notes').value.trim() || null,
  };

  try {
    const res  = await fetch(id ? `${API}/guests/${id}` : `${API}/guests`, {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error?.includes('อีเมล'))
        setFieldError('guestEmail', 'err-email', data.error);
      else
        showToast(data.error || 'บันทึกไม่สำเร็จ', 'error');
      return;
    }

    // If stay fields were filled, create stay immediately
    if (stayEnabled && stayBranch && stayCheckIn && stayNights) {
      await fetch(`${API}/branches/stays`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_id:      data.id,
          branch_id:     +stayBranch,
          check_in_date: stayCheckIn,
          nights:        +stayNights,
          preferences:   document.getElementById('guestStayPrefs')?.value.trim() || null,
        }),
      });
    }

    closeModal('guestModal');
    refreshGuests();
    loadDashboardStats();
    if (!id) {
      const stayMsg = stayEnabled ? ' + บันทึกการเข้าพักแล้ว' : ' — กรุณายืนยันอีเมล';
      showToast(`✓ เพิ่มแขกใหม่แล้ว${stayMsg}`, 'success');
      openOTPModal(data.id, data.email, false);
    } else {
      showToast(
        data.otp_sent
          ? '✓ อัปเดตแล้ว — ส่ง OTP ใหม่ไปยังอีเมลใหม่แล้ว'
          : '✓ อัปเดตข้อมูลแขกแล้ว',
        'success'
      );
    }
  } catch {
    showToast('Network error', 'error');
  } finally {
    btn.disabled  = false;
    txt.innerHTML = '💾 บันทึก';
  }
}

async function deleteGuest(id, name) {
  if (!confirm(`ลบแขก "${name}"?\nประวัติการพักและ OTP จะถูกลบด้วย`)) return;
  try {
    const res = await fetch(`${API}/guests/${id}`, { method: 'DELETE' });
    if (!res.ok) return showToast('ลบไม่สำเร็จ', 'error');
    showToast('ลบข้อมูลแขกแล้ว', 'info');
    refreshGuests();
    loadDashboardStats();
  } catch {
    showToast('Network error', 'error');
  }
}

// ══════════════════════════════════════════════════ OTP ═══════════════════════

function openOTPModal(guestId, email, sendImmediately = false) {
  _otpGuestId = guestId;
  _otpEmail   = email;
  document.getElementById('otpEmailDisplay').textContent = maskEmail(email);
  document.getElementById('otpError').classList.remove('show');
  document.getElementById('otpSuccess').style.display = 'none';
  document.getElementById('otpActions').style.display = 'block';
  document.querySelectorAll('.otp-input').forEach(inp => {
    inp.value = '';
    inp.classList.remove('filled', 'error');
  });
  openModal('otpModal');
  if (sendImmediately) sendOTP(guestId);
  else startOTPCooldown(0);
}

/** sendOTP — POST /api/otp/send */
async function sendOTP(guestId) {
  try {
    const res  = await fetch(`${API}/otp/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ guest_id: guestId, email: _otpEmail }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'ส่ง OTP แล้ว', 'success');
      startOTPCooldown(60);
    } else {
      showToast(data.message || 'ส่ง OTP ไม่สำเร็จ', 'error');
    }
  } catch {
    showToast('ส่ง OTP ไม่สำเร็จ', 'error');
  }
}
// Alias used internally
function resendOTP() { sendOTP(_otpGuestId); }

/** startOTPCooldown — countdown N seconds, disable resend button */
function startOTPCooldown(seconds) {
  clearInterval(_otpCountdown);
  const btn  = document.getElementById('otpResendBtn');
  const cdEl = document.getElementById('otpCountdown');
  let rem    = seconds;

  const tick = () => {
    if (rem <= 0) {
      btn.disabled     = false;
      cdEl.textContent = '';
      clearInterval(_otpCountdown);
    } else {
      btn.disabled     = true;
      cdEl.textContent = `(${rem}s)`;
      rem--;
    }
  };
  tick();
  _otpCountdown = setInterval(tick, 1000);
}
// Alias
const startOTPCountdown = startOTPCooldown;

/** verifyOTP — POST /api/otp/verify */
async function verifyOTP(guestId, token) {
  const res  = await fetch(`${API}/otp/verify`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ guest_id: guestId, token }),
  });
  return res;
}

/** verifyOTPModal — reads 6-box input, calls verifyOTP, updates UI */
async function verifyOTPModal() {
  const token = Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
  if (token.length < 6) {
    document.querySelectorAll('.otp-input').forEach(i => i.classList.add('error'));
    return;
  }
  const btn = document.getElementById('otpVerifyBtn');
  const txt = document.getElementById('otpVerifyText');
  btn.disabled  = true;
  txt.innerHTML = '<span class="spin-sm"></span> กำลังตรวจสอบ…';

  try {
    const res = await verifyOTP(_otpGuestId, token);
    if (res.ok) {
      document.getElementById('otpError').classList.remove('show');
      document.getElementById('otpSuccess').style.display = 'block';
      document.getElementById('otpActions').style.display = 'none';
      clearInterval(_otpCountdown);
      showToast('✅ ยืนยันอีเมลสำเร็จ!', 'success');
      refreshGuests();
      loadDashboardStats();
      setTimeout(() => closeModal('otpModal'), 2000);
    } else {
      document.getElementById('otpError').classList.add('show');
      document.querySelectorAll('.otp-input').forEach(i => {
        i.value = ''; i.classList.add('error');
      });
      document.querySelector('.otp-input')?.focus();
    }
  } catch {
    showToast('ยืนยัน OTP ไม่สำเร็จ', 'error');
  } finally {
    btn.disabled  = false;
    txt.textContent = '✅ ยืนยัน OTP';
  }
}

// OTP 6-box: auto-advance, backspace, paste
document.getElementById('otpBoxes').addEventListener('input', e => {
  const inp = e.target;
  const idx = +inp.dataset.idx;
  const val = inp.value.replace(/\D/g, '').slice(-1);
  inp.value = val;
  inp.classList.toggle('filled', !!val);
  inp.classList.remove('error');
  document.getElementById('otpError').classList.remove('show');
  if (val && idx < 5)
    document.querySelector(`.otp-input[data-idx="${idx + 1}"]`).focus();
});
document.getElementById('otpBoxes').addEventListener('keydown', e => {
  if (e.key === 'Backspace') {
    const idx = +e.target.dataset.idx;
    if (!e.target.value && idx > 0) {
      const prev = document.querySelector(`.otp-input[data-idx="${idx - 1}"]`);
      prev.value = ''; prev.classList.remove('filled'); prev.focus();
    }
  }
  if (e.key === 'Enter') verifyOTPModal();
});
document.getElementById('otpBoxes').addEventListener('paste', e => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData)
    .getData('text').replace(/\D/g, '').substring(0, 6);
  document.querySelectorAll('.otp-input').forEach((inp, i) => {
    inp.value = text[i] || '';
    inp.classList.toggle('filled', !!inp.value);
  });
  document.querySelector(`.otp-input[data-idx="${Math.min(text.length, 5)}"]`)?.focus();
});

// ══════════════════════════════════════════════════ STAY HISTORY ══════════════

async function openStayModal(guestId) {
  await loadBranches();
  document.getElementById('stayGuestId').value    = guestId;
  document.getElementById('stayForm').reset();
  document.getElementById('stayGuestId').value    = guestId;
  document.getElementById('checkoutPreview').style.display = 'none';
  clearAllErrors([
    ['stayBranchId','err-stayBranch'],
    ['stayCheckIn','err-stayCheckin'],
    ['stayNights','err-stayNights'],
  ]);

  try {
    const g         = await fetch(`${API}/guests/${guestId}`).then(r => r.json());
    const initials  = ((g.first_name?.[0] || '') + (g.last_name?.[0] || '')).toUpperCase();
    document.getElementById('stayModalTitle').textContent  = 'ประวัติการเข้าพัก';
    document.getElementById('stayGuestAvatar').textContent = initials || '?';
    document.getElementById('stayGuestName').textContent   = `${g.first_name} ${g.last_name}`;
    document.getElementById('stayGuestEmail').textContent  = g.email;
    document.getElementById('stayGuestNat').innerHTML      = g.nationality
      ? `<span style="background:#fff;border:1px solid #e5e9f0;border-radius:20px;padding:3px 10px;font-size:.75rem;font-weight:600;color:#374151;">${esc(g.nationality)}</span>`
      : '';
    openModal('stayModal');
    renderStayHistory(g.stays || []);
  } catch {
    showToast('โหลดข้อมูลแขกไม่สำเร็จ', 'error');
  }
}

function renderStayHistory(stays) {
  const wrap = document.getElementById('stayHistoryContent');
  if (!stays.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:32px;color:#9ca3af;font-size:.875rem;">
      <div style="font-size:2.5rem;margin-bottom:8px;">🏝️</div>ยังไม่มีประวัติการเข้าพัก</div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="tbl">
      <thead><tr>
        <th>สาขา</th><th>Check-in</th><th>Check-out</th><th>คืน</th><th>Preferences</th><th></th>
      </tr></thead>
      <tbody>
        ${stays.map(s => `
          <tr>
            <td>
              <div style="font-weight:600;color:#0f172a;font-size:.825rem;">${esc(s.branch_name)}</div>
              <div style="font-size:.7rem;color:#9ca3af;font-family:monospace;">${esc(s.branch_slug)}</div>
            </td>
            <td style="color:#6b7280;font-size:.8rem;">${fmtDate(s.check_in_date)}</td>
            <td style="color:#6b7280;font-size:.8rem;">${fmtDate(s.check_out_date)}</td>
            <td><span style="background:#eef2f9;color:#1e3f84;border-radius:20px;padding:2px 9px;font-size:.75rem;font-weight:700;">${s.nights} คืน</span></td>
            <td style="color:#9ca3af;font-size:.775rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;">${esc(s.preferences) || '—'}</td>
            <td><button class="btn btn-danger" onclick="deleteStay(${s.id},${s.guest_id})">🗑️</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function updateCheckoutPreview() {
  const d  = document.getElementById('stayCheckIn').value;
  const n  = document.getElementById('stayNights').value;
  const co = calcCheckout(d, n);
  const el = document.getElementById('checkoutPreview');
  if (co) {
    document.getElementById('checkoutDate').textContent = fmtDate(co + 'T00:00:00');
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

/** addStay — submit the stay form inside stayModal (bound to form onsubmit) */
async function addStay(e) {
  if (e) e.preventDefault();
  clearAllErrors([
    ['stayBranchId','err-stayBranch'],
    ['stayCheckIn','err-stayCheckin'],
    ['stayNights','err-stayNights'],
  ]);
  const branch  = document.getElementById('stayBranchId').value;
  const checkin = document.getElementById('stayCheckIn').value;
  const nights  = document.getElementById('stayNights').value;
  let valid     = true;
  if (!branch)              { setFieldError('stayBranchId', 'err-stayBranch',   'กรุณาเลือกสาขา');      valid = false; }
  if (!checkin)             { setFieldError('stayCheckIn',  'err-stayCheckin',  'กรุณาเลือกวันที่');    valid = false; }
  if (!nights || +nights < 1) { setFieldError('stayNights', 'err-stayNights', 'กรุณาระบุจำนวนคืน'); valid = false; }
  if (!valid) return;

  const guestId = document.getElementById('stayGuestId').value;
  const btn     = document.getElementById('staySubmitBtn');
  const txt     = document.getElementById('staySubmitText');
  btn.disabled  = true;
  txt.innerHTML = '<span class="spin-sm"></span> กำลังบันทึก…';

  try {
    const res = await fetch(`${API}/branches/stays`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guest_id:      +guestId,
        branch_id:     +branch,
        check_in_date: checkin,
        nights:        +nights,
        preferences:   document.getElementById('stayPreferences').value.trim() || null,
        notes:         document.getElementById('stayNotes').value.trim()        || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'บันทึกไม่สำเร็จ', 'error');
    showToast('✓ บันทึกการเข้าพักแล้ว', 'success');
    document.getElementById('stayForm').reset();
    document.getElementById('checkoutPreview').style.display = 'none';
    const g = await fetch(`${API}/guests/${guestId}`).then(r => r.json());
    renderStayHistory(g.stays || []);
    refreshGuests();
    loadDashboardStats();
  } catch {
    showToast('Network error', 'error');
  } finally {
    btn.disabled    = false;
    txt.textContent = '🏨 บันทึกการเข้าพัก';
  }
}
// Alias used by HTML onsubmit
const saveStay = addStay;

/** deleteStay — DELETE /api/branches/stays/:id, then refresh history inside modal */
async function deleteStay(stayId, guestId) {
  if (!confirm('ลบประวัติการเข้าพักนี้?')) return;
  try {
    const res = await fetch(`${API}/branches/stays/${stayId}`, { method: 'DELETE' });
    if (!res.ok) return showToast('ลบไม่สำเร็จ', 'error');
    showToast('ลบประวัติการเข้าพักแล้ว', 'info');
    const g = await fetch(`${API}/guests/${guestId}`).then(r => r.json());
    renderStayHistory(g.stays || []);
    refreshGuests();
    loadDashboardStats();
  } catch {
    showToast('Network error', 'error');
  }
}
// Alias
const deleteStayInModal = deleteStay;

// ══════════════════════════════════════════════ STANDALONE ADD STAY ════════════

async function openAddStayModal() {
  await loadBranches();
  // Populate guest dropdown fresh each time
  const gSel = document.getElementById('addStayGuestId');
  gSel.innerHTML = '<option value="">— เลือกแขก —</option>';
  try {
    const guests = await fetch(`${API}/guests`).then(r => r.json());
    guests.forEach(g => gSel.add(new Option(`${g.first_name} ${g.last_name} (${g.email})`, g.id)));
  } catch { /* ignore */ }
  document.getElementById('addStayForm').reset();
  document.getElementById('addCheckoutPreview').style.display = 'none';
  openModal('addStayModal');
}

function updateAddCheckout() {
  const d  = document.getElementById('addStayCheckIn').value;
  const n  = document.getElementById('addStayNights').value;
  const co = calcCheckout(d, n);
  const el = document.getElementById('addCheckoutPreview');
  if (co) {
    document.getElementById('addCheckoutDate').textContent = fmtDate(co + 'T00:00:00');
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

async function saveStandaloneStay(e) {
  e.preventDefault();
  const body = {
    guest_id:      +document.getElementById('addStayGuestId').value,
    branch_id:     +document.getElementById('addStayBranchId').value,
    check_in_date:  document.getElementById('addStayCheckIn').value,
    nights:        +document.getElementById('addStayNights').value,
    preferences:    document.getElementById('addStayPrefs').value.trim()  || null,
    notes:          document.getElementById('addStayNotes').value.trim()   || null,
  };
  if (!body.guest_id || !body.branch_id || !body.check_in_date || !body.nights)
    return showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
  try {
    const res  = await fetch(`${API}/branches/stays`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'บันทึกไม่สำเร็จ', 'error');
    showToast('✓ บันทึกการเข้าพักแล้ว', 'success');
    closeModal('addStayModal');
    loadAllStays();
    loadDashboardStats();
  } catch {
    showToast('Network error', 'error');
  }
}

// ══════════════════════════════════════════════════ STAYS PAGE ════════════════

async function loadAllStays() {
  document.getElementById('staysBody').innerHTML =
    `<tr><td colspan="8" style="text-align:center;padding:48px;color:#9ca3af;">
      <div style="display:flex;justify-content:center;"><div class="spin"></div></div>
    </td></tr>`;
  try {
    const guests   = await fetch(`${API}/guests`).then(r => r.json());
    const staysArr = [];
    for (const g of guests) {
      const gd = await fetch(`${API}/guests/${g.id}`).then(r => r.json());
      (gd.stays || []).forEach(s => staysArr.push({ ...s, guest: g }));
    }
    document.getElementById('staysBody').innerHTML = staysArr.length
      ? staysArr.map((s, i) => `
          <tr>
            <td style="color:#9ca3af;font-size:.75rem;">${i + 1}</td>
            <td>
              <div style="font-weight:600;color:#374151;">${esc(s.guest.first_name)} ${esc(s.guest.last_name)}</div>
              <div style="font-size:.72rem;color:#9ca3af;">${esc(s.guest.email)}</div>
            </td>
            <td style="font-size:.875rem;color:#6b7280;">${esc(s.branch_name)}</td>
            <td style="font-size:.8rem;color:#6b7280;">${fmtDate(s.check_in_date)}</td>
            <td style="font-size:.8rem;color:#6b7280;">${fmtDate(s.check_out_date)}</td>
            <td><span style="background:#eef2f9;color:#1e3f84;border-radius:20px;padding:2px 9px;font-size:.75rem;font-weight:700;">${s.nights} คืน</span></td>
            <td style="color:#9ca3af;font-size:.775rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;">${esc(s.preferences) || '—'}</td>
            <td><button class="btn btn-danger" onclick="deleteStay(${s.id},${s.guest.id})">🗑️</button></td>
          </tr>`)
        .join('')
      : '<tr><td colspan="8" style="text-align:center;padding:64px;color:#9ca3af;">ยังไม่มีประวัติการเข้าพัก</td></tr>';
  } catch {
    showToast('โหลด stays ไม่สำเร็จ', 'error');
  }
}

// ══════════════════════════════════════════════════ BRANCHES PAGE ══════════════

async function loadBranchesPage() {
  try {
    const data = await fetch(`${API}/branches/stats`).then(r => r.json());
    const max  = Math.max(...data.map(b => +b.stay_count), 1);
    document.getElementById('branchesBody').innerHTML = data.map((b, i) => {
      const pct = Math.round((+b.stay_count / max) * 100);
      return `<tr>
        <td style="color:#9ca3af;font-size:.75rem;">${i + 1}</td>
        <td style="font-weight:600;color:#374151;">${esc(b.name)}</td>
        <td><span style="background:#f1f4f9;color:#6b7280;border-radius:6px;padding:2px 8px;font-size:.72rem;font-family:monospace;">${esc(b.slug)}</span></td>
        <td><span style="font-weight:700;color:#2d56a0;">${b.stay_count}</span></td>
        <td><span style="font-weight:600;color:#374151;">${b.guest_count}</span></td>
        <td style="min-width:140px;">
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch {
    showToast('โหลด branches ไม่สำเร็จ', 'error');
  }
}

// ══════════════════════════════════════════════════ MODAL HELPERS ══════════════

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal when clicking backdrop
document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', function (e) {
    if (e.target === this) closeModal(this.id);
  });
});

// ══════════════════════════════════════════════════ INIT ══════════════════════

(async function init() {
  await loadBranches();
  showPage('dashboard');
})();
