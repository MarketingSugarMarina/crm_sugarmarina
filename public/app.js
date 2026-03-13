// app.js — Sugar Marina Guest CRM  (v3)
'use strict';

const API       = '/api';
const PAGE_SIZE = 20;

// ── State ─────────────────────────────────────────────────────────────────────
let allGuests   = [];
let branches    = [];
let currentPage = 1;
let _searchTimer;

// OTP state
let _otpGuestId   = null;
let _otpEmail     = null;
let _otpCountdown = null;

// ══════════════════════════════════════════════════════════ TOAST ══════════════
const TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️' };

function toast(msg, type = 'info', duration = 3500) {
  const el   = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const txt  = document.getElementById('toastMsg');
  icon.textContent = TOAST_ICONS[type] || 'ℹ️';
  txt.textContent  = msg;
  el.className = `show ${type}`;
  el.style.cssText = 'opacity:1;transform:translateY(0)';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.cssText = 'opacity:0;transform:translateY(8px)'; }, duration);
}

// ══════════════════════════════════════════════════════════ NAVIGATION ═════════
const PAGES = ['dashboard', 'guests', 'stays', 'branches'];
const PAGE_META = {
  dashboard: ['Dashboard',           'ภาพรวมระบบ CRM'],
  guests:    ['แขก (Guests)',        'รายการแขกทั้งหมด'],
  stays:     ['ประวัติการพัก',       'Stays ทั้งหมด'],
  branches:  ['สาขา',               'Sugar Marina Hotel Collection'],
};

function showPage(name) {
  PAGES.forEach(p => {
    document.getElementById(`page-${p}`).classList.toggle('hidden', p !== name);
    document.getElementById(`nav-${p}`)?.classList.toggle('active', p === name);
  });
  const [title, sub] = PAGE_META[name] || ['—', ''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = sub;
  if (name === 'dashboard') loadDashboard();
  if (name === 'guests')    loadGuests();
  if (name === 'stays')     loadAllStays();
  if (name === 'branches')  loadBranchesPage();
}

// ══════════════════════════════════════════════════════════ HELPERS ═══════════
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' });
}
function esc(v)   { return String(v ?? '').replace(/['"<>&]/g, c => ({'\'':'&#39;','"':'&quot;','<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }
function maskEmail(email) {
  const [user, domain] = email.split('@');
  const masked = user[0] + '***' + (user.length > 4 ? user.slice(-1) : '');
  return `${masked}@${domain}`;
}
function calcCheckout(checkin, nights) {
  if (!checkin || !nights) return null;
  const d = new Date(checkin);
  d.setDate(d.getDate() + parseInt(nights));
  return d.toISOString().substring(0, 10);
}

// ══════════════════════════════════════════════════════════ VALIDATION ═════════
function setFieldError(fieldId, errId, msg) {
  const f = document.getElementById(fieldId);
  const e = document.getElementById(errId);
  if (!f || !e) return;
  f.classList.add('error');
  e.textContent = msg;
  e.classList.add('show');
}
function clearFieldError(fieldId, errId) {
  document.getElementById(fieldId)?.classList.remove('error');
  document.getElementById(errId)?.classList.remove('show');
}
function clearAllErrors(ids) {
  ids.forEach(([f, e]) => clearFieldError(f, e));
}

// ══════════════════════════════════════════════════════════ DASHBOARD ══════════
async function loadDashboard() {
  await Promise.all([loadStats(), loadBranchStats(), loadRecentGuests()]);
}

async function loadStats() {
  try {
    const data = await fetch(`${API}/guests/stats`).then(r => r.json());
    document.getElementById('d-total').textContent      = data.total_guests;
    document.getElementById('d-verified').textContent   = data.verified;
    document.getElementById('d-unverified').textContent = data.unverified;
    document.getElementById('d-stays').textContent      = data.total_stays;
    document.getElementById('d-unverified-badge').classList.toggle('hidden', +data.unverified === 0);
  } catch { toast('โหลด stats ไม่สำเร็จ', 'error'); }
}

async function loadBranchStats() {
  try {
    const data = await fetch(`${API}/branches/stats`).then(r => r.json());
    const max  = Math.max(...data.map(b => +b.stay_count), 1);
    document.getElementById('branchStats').innerHTML = data.slice(0, 5).map(b => {
      const pct   = Math.round((+b.stay_count / max) * 100);
      const short = b.name.replace(/Sugar Marina (Hotel|Resort) - /,'').replace('Sugar Marina ','').trim();
      return `<div>
        <div class="flex justify-between mb-1">
          <span class="text-sm font-medium text-slate-700">${esc(short)}</span>
          <span class="text-xs font-bold text-slate-500">${b.stay_count} stay</span>
        </div>
        <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
      </div>`;
    }).join('') || '<p class="text-slate-400 text-sm text-center py-4">ยังไม่มีข้อมูล</p>';
  } catch { toast('โหลด branch stats ไม่สำเร็จ', 'error'); }
}

async function loadRecentGuests() {
  try {
    const guests = await fetch(`${API}/guests`).then(r => r.json());
    document.getElementById('recentGuests').innerHTML = guests.slice(0, 5).map(g => `
      <tr>
        <td>
          <div class="font-semibold text-slate-700">${esc(g.first_name)} ${esc(g.last_name)}</div>
          <div class="text-xs text-slate-400">${esc(g.email)}</div>
        </td>
        <td class="text-slate-500">${esc(g.nationality) || '—'}</td>
        <td>${g.email_verified
          ? '<span class="badge-verified">✅ ยืนยันแล้ว</span>'
          : '<span class="badge-unverified">⏳ รอยืนยัน</span>'}</td>
        <td class="text-slate-400 text-xs">${fmtDate(g.created_at)}</td>
      </tr>`).join('') || '<tr><td colspan="4" class="text-center py-8 text-slate-400">ยังไม่มีแขก</td></tr>';
  } catch { toast('โหลด recent guests ไม่สำเร็จ', 'error'); }
}

// ══════════════════════════════════════════════════════════ GUESTS LIST ════════

// Full guest list from last API fetch (unfiltered)
let _rawGuests = [];

// Highlight matching text with <mark> tags (safe — no HTML in guest fields)
function highlight(text, query) {
  if (!query || !text) return esc(text);
  const safe  = esc(text);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safe.replace(regex, '<mark>$1</mark>');
}

// Read current filter values from DOM
function getFilters() {
  return {
    search:   (document.getElementById('filterSearch')?.value  || '').trim(),
    verified: document.getElementById('filterVerified')?.value || '',
    branchId: document.getElementById('filterBranch')?.value   || '',
  };
}

// Apply all filters client-side on _rawGuests → write to allGuests → re-render
function applyFilters() {
  const { search, verified, branchId } = getFilters();
  const q = search.toLowerCase();

  allGuests = _rawGuests.filter(g => {
    // keyword match across 5 fields
    if (q) {
      const haystack = [g.first_name, g.last_name, g.email, g.phone, g.nationality]
        .map(v => (v || '').toLowerCase()).join(' ');
      if (!haystack.includes(q)) return false;
    }
    // verified status
    if (verified === 'true'  && !g.email_verified) return false;
    if (verified === 'false' &&  g.email_verified) return false;
    // branch (stay_branch_ids populated by API via branch_id filter — handled server-side on initial load)
    return true;
  });

  currentPage = 1;
  updateActiveFiltersUI(search, verified, branchId);
  renderGuestsTable(search);
}

// Update the active-filters pill row
function updateActiveFiltersUI(search, verified, branchId) {
  const row  = document.getElementById('activeFiltersRow');
  const tags = document.getElementById('filterTags');
  const pills = [];

  if (search)   pills.push(`<span class="filter-tag">🔍 "${esc(search)}"</span>`);
  if (verified === 'true')  pills.push('<span class="filter-tag">✅ ยืนยันแล้ว</span>');
  if (verified === 'false') pills.push('<span class="filter-tag">⏳ รอยืนยัน</span>');
  if (branchId) {
    const b = branches.find(x => String(x.id) === String(branchId));
    if (b) pills.push(`<span class="filter-tag">🏢 ${esc(b.name.replace(/Sugar Marina (Hotel|Resort) - /,'').replace('Sugar Marina ',''))}</span>`);
  }

  tags.innerHTML = pills.join('');
  row.classList.toggle('hidden', pills.length === 0);

  // Show/hide clear-X button on search input
  document.getElementById('clearSearchBtn')?.classList.toggle('hidden', !search);
}

// Load all guests from server (re-fetches when branch filter changes since that's server-side)
async function loadGuests() {
  const { branchId } = getFilters();
  const params = new URLSearchParams();
  if (branchId) params.set('branch_id', branchId);

  document.getElementById('guestBody').innerHTML =
    '<tr><td colspan="9" class="text-center py-12 text-slate-400">' +
    '<div class="flex justify-center mb-2"><div class="spinner"></div></div>กำลังโหลด…</td></tr>';

  try {
    _rawGuests = await fetch(`${API}/guests?${params}`).then(r => r.json());
    applyFilters();  // apply keyword + verified on top
  } catch { toast('โหลดรายการแขกไม่สำเร็จ', 'error'); }
}

// Refresh without resetting filters or scroll — used after CRUD operations
async function refreshGuests() {
  const { branchId } = getFilters();
  const params = new URLSearchParams();
  if (branchId) params.set('branch_id', branchId);
  try {
    _rawGuests = await fetch(`${API}/guests?${params}`).then(r => r.json());
    applyFilters();
  } catch { /* silent */ }
}

function renderGuestsTable(searchQuery = '') {
  const q      = searchQuery.toLowerCase();
  const total  = allGuests.length;
  const rawTotal = _rawGuests.length;
  const pages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start  = (currentPage - 1) * PAGE_SIZE;
  const slice  = allGuests.slice(start, start + PAGE_SIZE);

  // Count label: "แสดง X–Y จาก Z รายการ (กรองจาก N)"
  let countText = `แสดง ${slice.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, total)} จาก ${total} รายการ`;
  if (total !== rawTotal) countText += ` <span class="text-slate-400">(กรองจาก ${rawTotal})</span>`;
  document.getElementById('guestCountLabel').innerHTML = countText;
  document.getElementById('pageInfo').textContent    = `หน้า ${currentPage} / ${pages}`;
  document.getElementById('prevPage').disabled       = currentPage <= 1;
  document.getElementById('nextPage').disabled       = currentPage >= pages;

  if (!slice.length) {
    document.getElementById('guestBody').innerHTML =
      `<tr><td colspan="9" class="text-center py-16 text-slate-400">
        <div class="text-4xl mb-3">🔍</div>
        <div class="font-medium">ไม่พบแขกที่ค้นหา</div>
        <div class="text-xs mt-1 mb-4">ลองเปลี่ยนเงื่อนไขการค้นหา</div>
        <button onclick="clearAllFilters()" class="text-xs text-ocean-600 font-semibold hover:underline">
          ล้างตัวกรองทั้งหมด
        </button>
      </td></tr>`;
    return;
  }

  document.getElementById('guestBody').innerHTML = slice.map((g, i) => {
    const hl = (val) => highlight(val, q);
    return `
    <tr>
      <td class="text-slate-400 text-xs">${start + i + 1}</td>
      <td>
        <div class="font-semibold text-slate-800">${hl(g.first_name)} ${hl(g.last_name)}</div>
      </td>
      <td class="text-slate-500 text-xs">${hl(g.email)}</td>
      <td class="text-slate-500">${hl(g.phone) || '—'}</td>
      <td class="text-slate-500">${hl(g.nationality) || '—'}</td>
      <td class="text-slate-400 text-xs">${fmtDate(g.birthday)}</td>
      <td>${g.email_verified
        ? '<span class="badge-verified">✅ ยืนยันแล้ว</span>'
        : `<div class="flex items-center gap-1.5">
             <span class="badge-unverified">⏳ รอยืนยัน</span>
             <button class="btn-icon bg-amber-50 hover:bg-amber-100 text-amber-700 text-[11px]"
                     onclick="openOTPModal(${g.id},'${esc(g.email)}',true)">ส่ง OTP</button>
           </div>`}</td>
      <td><span class="inline-flex items-center justify-center w-6 h-6 bg-ocean-50 text-ocean-600 rounded-full text-xs font-bold">${g.stay_count ?? '—'}</span></td>
      <td>
        <div class="flex items-center gap-1">
          <button class="btn-icon bg-slate-50 hover:bg-slate-100 text-slate-600" onclick="openEditGuestModal(${g.id})" title="แก้ไข">✏️</button>
          <button class="btn-icon bg-ocean-50 hover:bg-ocean-100 text-ocean-600"  onclick="openStayModal(${g.id})"  title="ประวัติการพัก">🏨</button>
          <button class="btn-danger" onclick="deleteGuest(${g.id},'${esc(g.first_name)} ${esc(g.last_name)}')" title="ลบ">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function changePage(dir) {
  const pages = Math.ceil(allGuests.length / PAGE_SIZE);
  currentPage = Math.max(1, Math.min(pages, currentPage + dir));
  renderGuestsTable(getFilters().search);
  document.getElementById('page-guests').scrollIntoView({ behavior:'smooth', block:'start' });
}

// Debounce: re-applies filters without hitting server (branch filter does hit server)
let _sTimer;
function debounceGuestSearch() {
  const input = document.getElementById('filterSearch');
  document.getElementById('clearSearchBtn')?.classList.toggle('hidden', !input.value);
  clearTimeout(_sTimer);
  _sTimer = setTimeout(applyFilters, 300);
}

function clearSearchInput() {
  document.getElementById('filterSearch').value = '';
  document.getElementById('clearSearchBtn')?.classList.add('hidden');
  applyFilters();
}

function clearAllFilters() {
  document.getElementById('filterSearch').value   = '';
  document.getElementById('filterVerified').value = '';
  document.getElementById('filterBranch').value   = '';
  document.getElementById('clearSearchBtn')?.classList.add('hidden');
  loadGuests(); // re-fetch from server (clears branch filter too)
}

async function populateBranchFilter() {
  await ensureBranches();
  const sel = document.getElementById('filterBranch');
  if (sel.options.length > 1) return;
  branches.forEach(b => {
    const label = b.name
      .replace(/Sugar Marina (Hotel|Resort) - /, '')
      .replace('Sugar Marina ', '');
    sel.add(new Option(label, b.id));
  });
}

// ══════════════════════════════════════════════════════ GUEST MODAL ════════════

function openAddGuestModal() {
  document.getElementById('guestModalTitle').textContent = 'เพิ่มแขกใหม่';
  document.getElementById('guestModalSub').textContent   = 'กรอกข้อมูลแขกและบันทึก';
  document.getElementById('guestForm').reset();
  document.getElementById('guestId').value = '';
  document.getElementById('emailVerifiedBadge').classList.add('hidden');
  clearAllErrors([['firstName','err-firstName'],['lastName','err-lastName'],['guestEmail','err-email']]);
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
    document.getElementById('phone').value         = g.phone      || '';
    document.getElementById('birthday').value      = g.birthday   ? g.birthday.substring(0,10) : '';
    document.getElementById('nationality').value   = g.nationality || '';
    document.getElementById('notes').value         = g.notes      || '';
    // Email verified badge
    const badge = document.getElementById('emailVerifiedBadge');
    badge.className = g.email_verified
      ? 'badge-verified absolute right-2 top-1/2 -translate-y-1/2'
      : 'badge-unverified absolute right-2 top-1/2 -translate-y-1/2';
    badge.textContent = g.email_verified ? '✅ ยืนยันแล้ว' : '⏳ รอยืนยัน';
    clearAllErrors([['firstName','err-firstName'],['lastName','err-lastName'],['guestEmail','err-email']]);
    openModal('guestModal');
  } catch { toast('โหลดข้อมูลแขกไม่สำเร็จ', 'error'); }
}

async function saveGuest(e) {
  e.preventDefault();
  // Validate
  let valid = true;
  clearAllErrors([['firstName','err-firstName'],['lastName','err-lastName'],['guestEmail','err-email']]);

  const fn    = document.getElementById('firstName').value.trim();
  const ln    = document.getElementById('lastName').value.trim();
  const email = document.getElementById('guestEmail').value.trim();

  if (!fn)   { setFieldError('firstName','err-firstName','กรุณากรอกชื่อ');           valid = false; }
  if (!ln)   { setFieldError('lastName','err-lastName','กรุณากรอกนามสกุล');          valid = false; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    { setFieldError('guestEmail','err-email','กรุณากรอกอีเมลที่ถูกต้อง');            valid = false; }
  if (!valid) return;

  const id  = document.getElementById('guestId').value;
  const btn = document.getElementById('guestSubmitBtn');
  const txt = document.getElementById('guestSubmitText');
  btn.disabled  = true;
  txt.innerHTML = '<span class="spinner-sm"></span> กำลังบันทึก…';

  const body = {
    first_name:  fn, last_name: ln, email,
    phone:       document.getElementById('phone').value.trim()       || null,
    birthday:    document.getElementById('birthday').value           || null,
    nationality: document.getElementById('nationality').value        || null,
    notes:       document.getElementById('notes').value.trim()       || null,
  };

  try {
    const res  = await fetch(id ? `${API}/guests/${id}` : `${API}/guests`, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error?.includes('อีเมล')) setFieldError('guestEmail','err-email', data.error);
      else toast(data.error || 'บันทึกไม่สำเร็จ', 'error');
      return;
    }
    closeModal('guestModal');
    refreshGuests(); loadStats();
    // After add: open OTP modal; after edit: show toast
    if (!id) {
      toast('✓ เพิ่มแขกใหม่แล้ว — กรุณายืนยันอีเมล', 'success');
      openOTPModal(data.id, data.email, false);
    } else {
      toast(data.otp_sent ? '✓ อัปเดตแล้ว — ส่ง OTP ใหม่ไปยังอีเมลใหม่แล้ว' : '✓ อัปเดตข้อมูลแขกแล้ว', 'success');
    }
  } catch { toast('Network error', 'error'); }
  finally {
    btn.disabled   = false;
    txt.innerHTML  = '💾 บันทึก';
  }
}

async function deleteGuest(id, name) {
  if (!confirm(`ลบแขก "${name}"?\nประวัติการพักและ OTP จะถูกลบด้วย`)) return;
  try {
    const res = await fetch(`${API}/guests/${id}`, { method:'DELETE' });
    if (!res.ok) return toast('ลบไม่สำเร็จ', 'error');
    toast('ลบข้อมูลแขกแล้ว', 'info');
    refreshGuests(); loadStats();
  } catch { toast('Network error', 'error'); }
}

// ══════════════════════════════════════════════════════ OTP MODAL ══════════════

function openOTPModal(guestId, email, sendImmediately = false) {
  _otpGuestId = guestId;
  _otpEmail   = email;
  document.getElementById('otpEmailDisplay').textContent = maskEmail(email);
  document.getElementById('otpError').classList.remove('show');
  document.getElementById('otpSuccess').classList.add('hidden');
  document.getElementById('otpActions').classList.remove('hidden');
  // Clear OTP boxes
  document.querySelectorAll('.otp-input').forEach(inp => {
    inp.value = '';
    inp.classList.remove('filled','error');
  });
  openModal('otpModal');
  if (sendImmediately) sendOTPRequest();
  else startOTPCountdown(0); // already sent (just created), allow resend after 60s
}

async function sendOTPRequest() {
  try {
    const res  = await fetch(`${API}/otp/send`, {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ guest_id: _otpGuestId, email: _otpEmail }),
    });
    const data = await res.json();
    if (res.ok) { toast(data.message, 'success'); startOTPCountdown(60); }
    else toast(data.message || 'ส่ง OTP ไม่สำเร็จ', 'error');
  } catch { toast('ส่ง OTP ไม่สำเร็จ', 'error'); }
}

function resendOTP() { sendOTPRequest(); }

function startOTPCountdown(seconds) {
  clearInterval(_otpCountdown);
  const btn      = document.getElementById('otpResendBtn');
  const cdEl     = document.getElementById('otpCountdown');
  let remaining  = seconds;

  const tick = () => {
    if (remaining <= 0) {
      btn.disabled     = false;
      cdEl.textContent = '';
      clearInterval(_otpCountdown);
    } else {
      btn.disabled     = true;
      cdEl.textContent = `(${remaining}s)`;
      remaining--;
    }
  };
  tick();
  _otpCountdown = setInterval(tick, 1000);
}

async function verifyOTPModal() {
  const token = Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
  if (token.length < 6) {
    document.querySelectorAll('.otp-input').forEach(i => i.classList.add('error'));
    return;
  }
  document.getElementById('otpVerifyBtn').disabled  = true;
  document.getElementById('otpVerifyText').innerHTML = '<span class="spinner-sm"></span> กำลังตรวจสอบ…';

  try {
    const res  = await fetch(`${API}/otp/verify`, {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ guest_id: _otpGuestId, token }),
    });
    const data = await res.json();
    if (res.ok) {
      // Show success state
      document.getElementById('otpError').classList.remove('show');
      document.getElementById('otpSuccess').classList.remove('hidden');
      document.getElementById('otpActions').classList.add('hidden');
      clearInterval(_otpCountdown);
      toast('✅ ยืนยันอีเมลสำเร็จ!', 'success');
      // Update table badge immediately without resetting filters
      refreshGuests(); loadStats();
      setTimeout(() => closeModal('otpModal'), 2000);
    } else {
      document.getElementById('otpError').classList.add('show');
      document.querySelectorAll('.otp-input').forEach(i => { i.value=''; i.classList.add('error'); });
      document.querySelector('.otp-input').focus();
    }
  } catch { toast('ยืนยัน OTP ไม่สำเร็จ', 'error'); }
  finally {
    document.getElementById('otpVerifyBtn').disabled  = false;
    document.getElementById('otpVerifyText').textContent = '✅ ยืนยัน OTP';
  }
}

// OTP boxes: auto-advance, backspace, paste
document.getElementById('otpBoxes').addEventListener('input', function (e) {
  const inp  = e.target;
  const idx  = +inp.dataset.idx;
  const val  = inp.value.replace(/\D/g,'').slice(-1);
  inp.value  = val;
  inp.classList.toggle('filled', !!val);
  inp.classList.remove('error');
  document.getElementById('otpError').classList.remove('show');
  if (val && idx < 5) {
    document.querySelector(`.otp-input[data-idx="${idx+1}"]`).focus();
  }
});
document.getElementById('otpBoxes').addEventListener('keydown', function (e) {
  if (e.key === 'Backspace') {
    const idx = +e.target.dataset.idx;
    if (!e.target.value && idx > 0) {
      const prev = document.querySelector(`.otp-input[data-idx="${idx-1}"]`);
      prev.value = ''; prev.classList.remove('filled'); prev.focus();
    }
  }
  if (e.key === 'Enter') verifyOTPModal();
});
document.getElementById('otpBoxes').addEventListener('paste', function (e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'').substring(0,6);
  document.querySelectorAll('.otp-input').forEach((inp, i) => {
    inp.value = text[i] || '';
    inp.classList.toggle('filled', !!inp.value);
  });
  document.querySelector(`.otp-input[data-idx="${Math.min(text.length,5)}"]`).focus();
});

// ══════════════════════════════════════════════════════ STAY MODAL ═════════════

async function openStayModal(guestId) {
  await ensureBranches();
  // Populate branch dropdown in stayModal
  const sel = document.getElementById('stayBranchId');
  if (sel.options.length <= 1) {
    branches.forEach(b => sel.add(new Option(b.name, b.id)));
  }
  document.getElementById('stayGuestId').value = guestId;
  document.getElementById('stayForm').reset();
  document.getElementById('stayGuestId').value = guestId;
  document.getElementById('checkoutPreview').classList.add('hidden');
  clearAllErrors([['stayBranchId','err-stayBranch'],['stayCheckIn','err-stayCheckin'],['stayNights','err-stayNights']]);

  // Load guest profile
  const g = await fetch(`${API}/guests/${guestId}`).then(r => r.json());
  const initials = (g.first_name[0] + g.last_name[0]).toUpperCase();
  document.getElementById('stayModalTitle').textContent  = `ประวัติการเข้าพัก`;
  document.getElementById('stayGuestAvatar').textContent = initials;
  document.getElementById('stayGuestName').textContent   = `${g.first_name} ${g.last_name}`;
  document.getElementById('stayGuestEmail').textContent  = g.email;
  document.getElementById('stayGuestNat').innerHTML      = g.nationality
    ? `<span class="px-2 py-0.5 bg-white rounded-full text-xs font-semibold text-slate-600 border border-slate-200">${esc(g.nationality)}</span>`
    : '';

  openModal('stayModal');
  renderStayHistory(g.stays || []);
}

function renderStayHistory(stays) {
  const wrap = document.getElementById('stayHistoryContent');
  if (!stays.length) {
    wrap.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm">
      <div class="text-3xl mb-2">🏝️</div>ยังไม่มีประวัติการเข้าพัก</div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="w-full text-sm">
      <thead><tr>
        <th class="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-2.5 bg-slate-50 border-b">สาขา</th>
        <th class="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-2.5 bg-slate-50 border-b">Check-in</th>
        <th class="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-2.5 bg-slate-50 border-b">Check-out</th>
        <th class="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-2.5 bg-slate-50 border-b">คืน</th>
        <th class="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-2.5 bg-slate-50 border-b">Preferences</th>
        <th class="px-4 py-2.5 bg-slate-50 border-b"></th>
      </tr></thead>
      <tbody>
        ${stays.map(s => `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 border-b border-slate-50">
              <div class="font-medium text-slate-700 text-xs">${esc(s.branch_name)}</div>
              <div class="text-[10px] text-slate-400 font-mono">${esc(s.branch_slug)}</div>
            </td>
            <td class="px-4 py-3 border-b border-slate-50 text-slate-500 text-xs">${fmtDate(s.check_in_date)}</td>
            <td class="px-4 py-3 border-b border-slate-50 text-slate-500 text-xs">${fmtDate(s.check_out_date)}</td>
            <td class="px-4 py-3 border-b border-slate-50">
              <span class="px-2 py-0.5 bg-ocean-50 text-ocean-600 rounded-full text-xs font-bold">${s.nights}คืน</span>
            </td>
            <td class="px-4 py-3 border-b border-slate-50 text-slate-400 text-xs max-w-32 truncate">${esc(s.preferences) || '—'}</td>
            <td class="px-4 py-3 border-b border-slate-50">
              <button class="btn-danger py-1" onclick="deleteStayInModal(${s.id}, ${s.guest_id})">🗑️</button>
            </td>
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
    el.classList.remove('hidden');
    el.classList.add('flex');
  } else {
    el.classList.add('hidden');
  }
}

async function saveStay(e) {
  e.preventDefault();
  let valid = true;
  clearAllErrors([['stayBranchId','err-stayBranch'],['stayCheckIn','err-stayCheckin'],['stayNights','err-stayNights']]);

  const branch  = document.getElementById('stayBranchId').value;
  const checkin = document.getElementById('stayCheckIn').value;
  const nights  = document.getElementById('stayNights').value;

  if (!branch)  { setFieldError('stayBranchId','err-stayBranch','กรุณาเลือกสาขา');      valid = false; }
  if (!checkin) { setFieldError('stayCheckIn', 'err-stayCheckin','กรุณาเลือกวันที่');   valid = false; }
  if (!nights || +nights < 1) { setFieldError('stayNights','err-stayNights','กรุณาระบุจำนวนคืน'); valid = false; }
  if (!valid) return;

  const guestId = document.getElementById('stayGuestId').value;
  const btn     = document.getElementById('staySubmitBtn');
  const txt     = document.getElementById('staySubmitText');
  btn.disabled  = true;
  txt.innerHTML = '<span class="spinner-sm"></span> กำลังบันทึก…';

  try {
    const res = await fetch(`${API}/branches/stays`, {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        guest_id:      +guestId, branch_id: +branch,
        check_in_date: checkin,  nights:    +nights,
        preferences:   document.getElementById('stayPreferences').value.trim() || null,
        notes:         document.getElementById('stayNotes').value.trim()        || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'บันทึกไม่สำเร็จ', 'error');

    toast('✓ บันทึกการเข้าพักแล้ว', 'success');
    document.getElementById('stayForm').reset();
    document.getElementById('checkoutPreview').classList.add('hidden');

    // Refresh stay history inside modal
    const g = await fetch(`${API}/guests/${guestId}`).then(r => r.json());
    renderStayHistory(g.stays || []);
    refreshGuests(); loadStats();
  } catch { toast('Network error', 'error'); }
  finally {
    btn.disabled  = false;
    txt.textContent = '🏨 บันทึกการเข้าพัก';
  }
}

async function deleteStayInModal(stayId, guestId) {
  if (!confirm('ลบประวัติการเข้าพักนี้?')) return;
  try {
    const res = await fetch(`${API}/branches/stays/${stayId}`, { method:'DELETE' });
    if (!res.ok) return toast('ลบไม่สำเร็จ', 'error');
    toast('ลบประวัติการเข้าพักแล้ว', 'info');
    const g = await fetch(`${API}/guests/${guestId}`).then(r => r.json());
    renderStayHistory(g.stays || []);
    refreshGuests(); loadStats();
  } catch { toast('Network error', 'error'); }
}

// ══════════════════════════════════════════════════ STANDALONE ADD STAY ════════
async function openAddStayModal() {
  await ensureBranches();
  await ensureGuestList();
  const gSel = document.getElementById('addStayGuestId');
  const bSel = document.getElementById('addStayBranchId');
  if (gSel.options.length <= 1) allGuests.forEach(g => gSel.add(new Option(`${g.first_name} ${g.last_name} (${g.email})`, g.id)));
  if (bSel.options.length <= 1) branches.forEach(b => bSel.add(new Option(b.name, b.id)));
  document.getElementById('addStayForm').reset();
  document.getElementById('addCheckoutPreview').classList.add('hidden');
  openModal('addStayModal');
}
function updateAddCheckout() {
  const d  = document.getElementById('addStayCheckIn').value;
  const n  = document.getElementById('addStayNights').value;
  const co = calcCheckout(d, n);
  const el = document.getElementById('addCheckoutPreview');
  if (co) { document.getElementById('addCheckoutDate').textContent = fmtDate(co+'T00:00:00'); el.classList.remove('hidden'); el.classList.add('flex'); }
  else el.classList.add('hidden');
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
  try {
    const res = await fetch(`${API}/branches/stays`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'บันทึกไม่สำเร็จ', 'error');
    toast('✓ บันทึกการเข้าพักแล้ว', 'success');
    closeModal('addStayModal');
    loadAllStays(); loadStats();
  } catch { toast('Network error', 'error'); }
}

// ══════════════════════════════════════════════════════ STAYS PAGE ═════════════
async function loadAllStays() {
  try {
    const guests = await fetch(`${API}/guests`).then(r => r.json());
    const staysArr = [];
    for (const g of guests) {
      const gd = await fetch(`${API}/guests/${g.id}`).then(r => r.json());
      (gd.stays || []).forEach(s => staysArr.push({ ...s, guest: g }));
    }
    document.getElementById('staysBody').innerHTML = staysArr.length
      ? staysArr.map((s, i) => `
          <tr>
            <td class="text-slate-400 text-xs">${i+1}</td>
            <td><div class="font-semibold text-slate-700">${esc(s.guest.first_name)} ${esc(s.guest.last_name)}</div>
                <div class="text-xs text-slate-400">${esc(s.guest.email)}</div></td>
            <td class="text-slate-600 text-xs">${esc(s.branch_name)}</td>
            <td class="text-xs text-slate-500">${fmtDate(s.check_in_date)}</td>
            <td class="text-xs text-slate-500">${fmtDate(s.check_out_date)}</td>
            <td><span class="px-2 py-0.5 bg-ocean-50 text-ocean-700 rounded-full text-xs font-semibold">${s.nights} คืน</span></td>
            <td class="text-slate-400 text-xs max-w-40 truncate">${esc(s.preferences) || '—'}</td>
            <td><button class="btn-danger" onclick="deleteStayInModal(${s.id},${s.guest.id})">🗑️</button></td>
          </tr>`)
        .join('')
      : '<tr><td colspan="8" class="text-center py-16 text-slate-400">ยังไม่มีประวัติการเข้าพัก</td></tr>';
  } catch { toast('โหลด stays ไม่สำเร็จ', 'error'); }
}

// ══════════════════════════════════════════════════════ BRANCHES PAGE ══════════
async function loadBranchesPage() {
  try {
    const data = await fetch(`${API}/branches/stats`).then(r => r.json());
    const max  = Math.max(...data.map(b => +b.stay_count), 1);
    document.getElementById('branchesBody').innerHTML = data.map((b, i) => {
      const pct = Math.round((+b.stay_count / max) * 100);
      return `<tr>
        <td class="text-slate-400 text-xs">${i+1}</td>
        <td class="font-semibold text-slate-700">${esc(b.name)}</td>
        <td><span class="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-mono">${esc(b.slug)}</span></td>
        <td><span class="font-semibold text-ocean-600">${b.stay_count}</span></td>
        <td><span class="font-semibold text-slate-600">${b.guest_count}</span></td>
        <td class="min-w-32"><div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="progress-bar" style="width:${pct}%"></div></div></td>
      </tr>`;
    }).join('');
  } catch { toast('โหลด branches ไม่สำเร็จ', 'error'); }
}

// ══════════════════════════════════════════════════════ MODAL HELPERS ══════════
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', function(e) { if (e.target === this) closeModal(this.id); });
});

// ══════════════════════════════════════════════════════ DATA HELPERS ═══════════
async function ensureBranches() {
  if (branches.length) return;
  branches = await fetch(`${API}/branches`).then(r => r.json());
}
async function ensureGuestList() {
  if (allGuests.length) return;
  allGuests = await fetch(`${API}/guests`).then(r => r.json());
}

// ══════════════════════════════════════════════════════ INIT ══════════════════
(async function init() {
  await ensureBranches();
  await populateBranchFilter();
  loadDashboard();
})();
