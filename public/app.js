// app.js — Sugar Marina Guest CRM Frontend Logic
'use strict';

const API = '/api';
const PAGE_SIZE = 20;

// ── State ─────────────────────────────────────────────────────────────────────
let allGuests   = [];
let currentPage = 1;
let branches    = [];
let _searchTimer;

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3200) {
  const el  = document.getElementById('toast');
  const txt = document.getElementById('toastMsg');
  txt.textContent = msg;
  el.className = `show ${type}`;
  setTimeout(() => el.className = '', duration);
}

// ── Page Navigation ───────────────────────────────────────────────────────────
const pages = ['dashboard', 'guests', 'stays', 'branches'];

function showPage(name) {
  pages.forEach(p => {
    document.getElementById(`page-${p}`).classList.toggle('hidden', p !== name);
    const nav = document.getElementById(`nav-${p}`);
    if (nav) nav.classList.toggle('active', p === name);
  });
  const titles = {
    dashboard: ['Dashboard', 'ภาพรวมระบบ CRM'],
    guests:    ['แขก (Guests)', 'รายการแขกทั้งหมด'],
    stays:     ['ประวัติการพัก', 'Stays ทั้งหมด'],
    branches:  ['สาขา', 'Sugar Marina Hotel Collection'],
  };
  const [title, sub] = titles[name] || ['—', ''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = sub;

  if (name === 'dashboard') loadDashboard();
  if (name === 'guests')    loadGuests();
  if (name === 'stays')     loadStays();
  if (name === 'branches')  loadBranchesPage();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function esc(str) {
  return String(str ?? '').replace(/'/g, "\\'");
}

// ════════════════════════════════════════════════════════ DASHBOARD ═══════════

async function loadDashboard() {
  await Promise.all([loadStats(), loadBranchStats(), loadRecentGuests()]);
}

async function loadStats() {
  try {
    const r    = await fetch(`${API}/guests/stats`);
    const data = await r.json();
    document.getElementById('d-total').textContent      = data.total_guests;
    document.getElementById('d-verified').textContent   = data.verified;
    document.getElementById('d-unverified').textContent = data.unverified;
    document.getElementById('d-stays').textContent      = data.total_stays;
    const badge = document.getElementById('d-unverified-badge');
    badge.classList.toggle('hidden', parseInt(data.unverified) === 0);
  } catch { toast('โหลด stats ไม่สำเร็จ', 'error'); }
}

async function loadBranchStats() {
  try {
    const r    = await fetch(`${API}/branches/stats`);
    const data = await r.json();
    const max  = Math.max(...data.map(b => parseInt(b.stay_count)), 1);
    const top5 = data.slice(0, 5);

    document.getElementById('branchStats').innerHTML = top5.map(b => {
      const pct = Math.round((parseInt(b.stay_count) / max) * 100);
      const shortName = b.name.replace('Sugar Marina Hotel -', '').replace('Sugar Marina Resort -', '').replace('Sugar Marina', '').trim();
      return `
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium text-slate-700">${shortName}</span>
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
    const r      = await fetch(`${API}/guests`);
    const guests = await r.json();
    const recent = guests.slice(0, 5);

    document.getElementById('recentGuests').innerHTML = recent.length ? recent.map(g => `
      <tr>
        <td>
          <div class="font-semibold text-slate-700">${g.first_name} ${g.last_name}</div>
          <div class="text-xs text-slate-400">${g.email}</div>
        </td>
        <td class="text-slate-500">${g.nationality || '—'}</td>
        <td>
          ${g.email_verified
            ? '<span class="badge-verified">✅ ยืนยันแล้ว</span>'
            : '<span class="badge-unverified">⏳ รอยืนยัน</span>'}
        </td>
        <td class="text-slate-400 text-xs">${fmtDate(g.created_at)}</td>
      </tr>`) .join('')
    : '<tr><td colspan="4" class="text-center py-8 text-slate-400">ยังไม่มีแขก</td></tr>';
  } catch { toast('โหลด recent guests ไม่สำเร็จ', 'error'); }
}

// ════════════════════════════════════════════════════════ GUESTS ══════════════

async function loadGuests() {
  const search   = document.getElementById('filterSearch')?.value.trim() || '';
  const verified = document.getElementById('filterVerified')?.value || '';
  const branchId = document.getElementById('filterBranch')?.value || '';

  const params = new URLSearchParams();
  if (search)   params.set('search',    search);
  if (verified) params.set('verified',  verified);
  if (branchId) params.set('branch_id', branchId);

  document.getElementById('guestBody').innerHTML =
    `<tr><td colspan="9" class="text-center py-12 text-slate-400">
      <div class="flex justify-center mb-2"><div class="spinner"></div></div>
      กำลังโหลด…
    </td></tr>`;

  try {
    const r = await fetch(`${API}/guests?${params}`);
    allGuests   = await r.json();
    currentPage = 1;
    renderGuestsTable();
  } catch { toast('โหลดรายการแขกไม่สำเร็จ', 'error'); }
}

function renderGuestsTable() {
  const total      = allGuests.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start      = (currentPage - 1) * PAGE_SIZE;
  const slice      = allGuests.slice(start, start + PAGE_SIZE);

  document.getElementById('guestCountLabel').textContent =
    `แสดง ${slice.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, total)} จาก ${total} รายการ`;
  document.getElementById('pageInfo').textContent = `หน้า ${currentPage} / ${totalPages}`;
  document.getElementById('prevPage').disabled    = currentPage <= 1;
  document.getElementById('nextPage').disabled    = currentPage >= totalPages;

  if (slice.length === 0) {
    document.getElementById('guestBody').innerHTML =
      `<tr><td colspan="9" class="text-center py-16 text-slate-400">
        <div class="text-4xl mb-3">🔍</div>
        <div class="font-medium">ไม่พบรายการแขก</div>
        <div class="text-xs mt-1">ลองเปลี่ยนเงื่อนไขการค้นหา</div>
      </td></tr>`;
    return;
  }

  document.getElementById('guestBody').innerHTML = slice.map((g, i) => `
    <tr>
      <td class="text-slate-400 text-xs">${start + i + 1}</td>
      <td>
        <div class="font-semibold text-slate-800">${g.first_name} ${g.last_name}</div>
      </td>
      <td class="text-slate-500 text-xs">${g.email}</td>
      <td class="text-slate-500">${g.phone || '—'}</td>
      <td class="text-slate-500">${g.nationality || '—'}</td>
      <td class="text-slate-400 text-xs">${fmtDate(g.birthday)}</td>
      <td>
        ${g.email_verified
          ? '<span class="badge-verified">✅ ยืนยันแล้ว</span>'
          : `<div class="flex items-center gap-1.5">
               <span class="badge-unverified">⏳ รอยืนยัน</span>
               <button class="btn-icon bg-amber-50 hover:bg-amber-100 text-amber-700 text-[11px]"
                       onclick="quickSendOTP(${g.id},'${esc(g.email)}')">ส่ง OTP</button>
             </div>`}
      </td>
      <td>
        <span class="inline-flex items-center justify-center w-6 h-6 bg-ocean-50 text-ocean-600 rounded-full text-xs font-bold">
          ${g.stay_count ?? '—'}
        </span>
      </td>
      <td>
        <div class="flex items-center gap-1">
          <button class="btn-icon bg-slate-50 hover:bg-slate-100 text-slate-600"
                  onclick="openEditModal(${g.id})" title="แก้ไข">✏️</button>
          <button class="btn-icon bg-ocean-50 hover:bg-ocean-100 text-ocean-600"
                  onclick="openGuestStays(${g.id}, '${esc(g.first_name)} ${esc(g.last_name)}')" title="ดู Stay">🏨</button>
          <button class="btn-danger"
                  onclick="deleteGuest(${g.id},'${esc(g.first_name)} ${esc(g.last_name)}')" title="ลบ">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

function changePage(dir) {
  const total = Math.ceil(allGuests.length / PAGE_SIZE);
  currentPage = Math.max(1, Math.min(total, currentPage + dir));
  renderGuestsTable();
  document.getElementById('page-guests').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function debounceGuestSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(loadGuests, 350);
}

// Populate branch dropdown in filter bar
async function populateBranchFilter() {
  if (branches.length === 0) {
    const r  = await fetch(`${API}/branches`);
    branches = await r.json();
  }
  const sel = document.getElementById('filterBranch');
  if (sel.options.length <= 1) {
    branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value       = b.id;
      opt.textContent = b.name.replace('Sugar Marina Hotel - ', '').replace('Sugar Marina Resort - ', '').replace('Sugar Marina ', '');
      sel.appendChild(opt);
    });
  }
}

// ════════════════════════════════════════════════════════ STAYS ═══════════════

async function loadStays() {
  try {
    const r   = await fetch(`${API}/guests`);
    const all = await r.json();
    // Load all guests with their stays
    const staysArr = [];
    for (const g of all) {
      const gr = await fetch(`${API}/guests/${g.id}`);
      const gd = await gr.json();
      (gd.stays || []).forEach(s => staysArr.push({ ...s, guest: g }));
    }
    renderStaysTable(staysArr);
  } catch { toast('โหลด stays ไม่สำเร็จ', 'error'); }
}

function renderStaysTable(stays) {
  document.getElementById('staysBody').innerHTML = stays.length
    ? stays.map((s, i) => `
      <tr>
        <td class="text-slate-400 text-xs">${i + 1}</td>
        <td>
          <div class="font-semibold text-slate-700">${s.guest.first_name} ${s.guest.last_name}</div>
          <div class="text-xs text-slate-400">${s.guest.email}</div>
        </td>
        <td class="text-slate-600 text-xs">${s.branch_name}</td>
        <td class="text-slate-500 text-xs">${fmtDate(s.check_in_date)}</td>
        <td class="text-slate-500 text-xs">${fmtDate(s.check_out_date)}</td>
        <td><span class="px-2 py-0.5 bg-ocean-50 text-ocean-700 rounded-full text-xs font-semibold">${s.nights} คืน</span></td>
        <td class="text-slate-400 text-xs max-w-48 truncate">${s.preferences || '—'}</td>
        <td>
          <div class="flex gap-1">
            <button class="btn-icon bg-slate-50 hover:bg-slate-100 text-slate-600"
                    onclick="openEditStay(${s.id})">✏️</button>
            <button class="btn-danger" onclick="deleteStay(${s.id})">🗑️</button>
          </div>
        </td>
      </tr>`)
    .join('')
    : '<tr><td colspan="8" class="text-center py-16 text-slate-400">ยังไม่มีประวัติการเข้าพัก</td></tr>';
}

// ════════════════════════════════════════════════════════ BRANCHES PAGE ═══════

async function loadBranchesPage() {
  try {
    const r    = await fetch(`${API}/branches/stats`);
    const data = await r.json();
    const max  = Math.max(...data.map(b => parseInt(b.stay_count)), 1);
    document.getElementById('branchesBody').innerHTML = data.map((b, i) => {
      const pct = Math.round((parseInt(b.stay_count) / max) * 100);
      return `
        <tr>
          <td class="text-slate-400 text-xs">${i + 1}</td>
          <td class="font-semibold text-slate-700">${b.name}</td>
          <td><span class="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-mono">${b.slug}</span></td>
          <td><span class="font-semibold text-ocean-600">${b.stay_count}</span></td>
          <td><span class="font-semibold text-slate-600">${b.guest_count}</span></td>
          <td class="min-w-32">
            <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div class="progress-bar" style="width:${pct}%"></div>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch { toast('โหลด branches ไม่สำเร็จ', 'error'); }
}

// ════════════════════════════════════════════════════════ GUEST MODAL ═════════

function openAddModal() {
  document.getElementById('modalTitle').textContent = 'เพิ่มแขกใหม่';
  document.getElementById('guestForm').reset();
  document.getElementById('guestId').value = '';
  document.getElementById('otpSection').classList.add('hidden');
  openModal('guestModal');
}

async function openEditModal(id) {
  try {
    const r = await fetch(`${API}/guests/${id}`);
    const g = await r.json();
    document.getElementById('modalTitle').textContent   = 'แก้ไขข้อมูลแขก';
    document.getElementById('guestId').value            = g.id;
    document.getElementById('firstName').value          = g.first_name;
    document.getElementById('lastName').value           = g.last_name;
    document.getElementById('guestEmail').value         = g.email;
    document.getElementById('phone').value              = g.phone || '';
    document.getElementById('nationality').value        = g.nationality || '';
    document.getElementById('birthday').value           = g.birthday ? g.birthday.substring(0, 10) : '';
    document.getElementById('passportNo').value         = g.passport_no || '';
    document.getElementById('notes').value              = g.notes || '';
    document.getElementById('otpCode').value            = '';
    document.getElementById('otpSection').classList.remove('hidden');
    openModal('guestModal');
  } catch { toast('โหลดข้อมูลแขกไม่สำเร็จ', 'error'); }
}

async function saveGuest(e) {
  e.preventDefault();
  const id   = document.getElementById('guestId').value;
  const body = {
    first_name:  document.getElementById('firstName').value.trim(),
    last_name:   document.getElementById('lastName').value.trim(),
    email:       document.getElementById('guestEmail').value.trim(),
    phone:       document.getElementById('phone').value.trim()       || null,
    nationality: document.getElementById('nationality').value.trim() || null,
    birthday:    document.getElementById('birthday').value           || null,
    passport_no: document.getElementById('passportNo').value.trim()  || null,
    notes:       document.getElementById('notes').value.trim()       || null,
  };

  try {
    const res  = await fetch(id ? `${API}/guests/${id}` : `${API}/guests`, {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'บันทึกไม่สำเร็จ', 'error');

    toast(id ? '✓ อัปเดตข้อมูลแขกแล้ว' : '✓ เพิ่มแขกใหม่แล้ว — ส่ง OTP แล้ว', 'success');
    closeModal('guestModal');
    loadGuests();
    loadStats();
  } catch { toast('Network error', 'error'); }
}

async function deleteGuest(id, name) {
  if (!confirm(`ลบแขก "${name}"?\nประวัติการพักและ OTP จะถูกลบด้วย`)) return;
  try {
    const res = await fetch(`${API}/guests/${id}`, { method: 'DELETE' });
    if (!res.ok) return toast('ลบไม่สำเร็จ', 'error');
    toast('ลบข้อมูลแขกแล้ว', 'info');
    loadGuests();
    loadStats();
  } catch { toast('Network error', 'error'); }
}

// ════════════════════════════════════════════════════════ OTP ═════════════════

async function sendOTP() {
  const guest_id = document.getElementById('guestId').value;
  const email    = document.getElementById('guestEmail').value.trim();
  if (!email) return toast('กรุณาระบุอีเมล', 'error');
  try {
    const res  = await fetch(`${API}/otp/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id, email }),
    });
    const data = await res.json();
    toast(data.message, res.ok ? 'success' : 'error');
  } catch { toast('ส่ง OTP ไม่สำเร็จ', 'error'); }
}

async function quickSendOTP(guest_id, email) {
  try {
    const res  = await fetch(`${API}/otp/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id, email }),
    });
    const data = await res.json();
    toast(data.message, res.ok ? 'success' : 'error');
  } catch { toast('ส่ง OTP ไม่สำเร็จ', 'error'); }
}

async function verifyOTP() {
  const guest_id = document.getElementById('guestId').value;
  const token    = document.getElementById('otpCode').value.trim();
  if (!token) return toast('กรุณากรอกรหัส OTP', 'error');
  try {
    const res  = await fetch(`${API}/otp/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id, token }),
    });
    const data = await res.json();
    if (res.ok) { toast('✓ ยืนยันอีเมลสำเร็จ', 'success'); closeModal('guestModal'); loadGuests(); }
    else toast(data.message || 'OTP ไม่ถูกต้อง', 'error');
  } catch { toast('ยืนยัน OTP ไม่สำเร็จ', 'error'); }
}

// ════════════════════════════════════════════════════════ STAY MODAL ══════════

async function openAddStayModal(preGuestId = null) {
  document.getElementById('stayModalTitle').textContent = 'เพิ่มประวัติการเข้าพัก';
  document.getElementById('stayForm').reset();
  document.getElementById('stayId').value = '';
  await populateStayDropdowns();
  if (preGuestId) document.getElementById('stayGuestId').value = preGuestId;
  openModal('stayModal');
}

async function openEditStay(id) {
  await populateStayDropdowns();
  // Find stay in staysBody — re-fetch from guest
  document.getElementById('stayModalTitle').textContent = 'แก้ไขประวัติการเข้าพัก';
  document.getElementById('stayId').value = id;
  openModal('stayModal');
}

async function populateStayDropdowns() {
  // Guests
  if (document.getElementById('stayGuestId').options.length <= 1) {
    if (allGuests.length === 0) {
      const r  = await fetch(`${API}/guests`);
      allGuests = await r.json();
    }
    allGuests.forEach(g => {
      const opt = document.createElement('option');
      opt.value       = g.id;
      opt.textContent = `${g.first_name} ${g.last_name} (${g.email})`;
      document.getElementById('stayGuestId').appendChild(opt);
    });
  }
  // Branches
  if (branches.length === 0) {
    const r  = await fetch(`${API}/branches`);
    branches = await r.json();
  }
  if (document.getElementById('stayBranchId').options.length <= 1) {
    branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value       = b.id;
      opt.textContent = b.name;
      document.getElementById('stayBranchId').appendChild(opt);
    });
  }
}

async function saveStay(e) {
  e.preventDefault();
  const id   = document.getElementById('stayId').value;
  const body = {
    guest_id:      parseInt(document.getElementById('stayGuestId').value),
    branch_id:     parseInt(document.getElementById('stayBranchId').value),
    check_in_date: document.getElementById('stayCheckIn').value,
    nights:        parseInt(document.getElementById('stayNights').value),
    preferences:   document.getElementById('stayPreferences').value.trim() || null,
    notes:         document.getElementById('stayNotes').value.trim()        || null,
  };

  const url    = id ? `${API}/branches/stays/${id}` : `${API}/branches/stays`;
  const method = id ? 'PUT' : 'POST';

  try {
    const res  = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'บันทึกไม่สำเร็จ', 'error');
    toast('✓ บันทึกประวัติการเข้าพักแล้ว', 'success');
    closeModal('stayModal');
    loadStays();
  } catch { toast('Network error', 'error'); }
}

async function deleteStay(id) {
  if (!confirm('ลบประวัติการเข้าพักนี้?')) return;
  try {
    const res = await fetch(`${API}/branches/stays/${id}`, { method: 'DELETE' });
    if (!res.ok) return toast('ลบไม่สำเร็จ', 'error');
    toast('ลบประวัติการเข้าพักแล้ว', 'info');
    loadStays();
  } catch { toast('Network error', 'error'); }
}

// ════════════════════════════════════════════════════════ GUEST STAYS MODAL ═══

async function openGuestStays(id, name) {
  document.getElementById('guestStaysTitle').textContent = `🏨 ${name} — ประวัติการพัก`;
  document.getElementById('guestStaysContent').innerHTML =
    '<div class="flex justify-center py-8"><div class="spinner"></div></div>';
  openModal('guestStaysModal');

  try {
    const r    = await fetch(`${API}/guests/${id}`);
    const data = await r.json();
    const stays = data.stays || [];

    document.getElementById('guestStaysContent').innerHTML = stays.length
      ? `<div class="space-y-3">
          ${stays.map(s => `
            <div class="border border-slate-100 rounded-xl p-4">
              <div class="flex items-start justify-between">
                <div>
                  <div class="font-semibold text-slate-700">${s.branch_name}</div>
                  <div class="text-xs text-slate-400 mt-0.5 font-mono">${s.branch_slug}</div>
                </div>
                <span class="px-2.5 py-1 bg-ocean-50 text-ocean-600 rounded-lg text-xs font-bold">${s.nights} คืน</span>
              </div>
              <div class="flex gap-4 mt-3 text-sm text-slate-500">
                <span>📅 Check-in: <strong>${fmtDate(s.check_in_date)}</strong></span>
                <span>📅 Check-out: <strong>${fmtDate(s.check_out_date)}</strong></span>
              </div>
              ${s.preferences ? `<div class="mt-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-2">💬 ${s.preferences}</div>` : ''}
            </div>`).join('')}
        </div>
        <button class="mt-4 btn-primary w-full justify-center"
                onclick="closeModal('guestStaysModal'); openAddStayModal(${id})">
          ＋ เพิ่มการเข้าพักใหม่
        </button>`
      : `<div class="text-center py-10 text-slate-400">
           <div class="text-4xl mb-3">🏨</div>
           <div class="font-medium">ยังไม่มีประวัติการเข้าพัก</div>
           <button class="mt-4 btn-primary" onclick="closeModal('guestStaysModal'); openAddStayModal(${id})">
             ＋ เพิ่ม Stay แรก
           </button>
         </div>`;
  } catch { toast('โหลดประวัติไม่สำเร็จ', 'error'); }
}

// ════════════════════════════════════════════════════════ MODAL HELPERS ════════

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}
// Click backdrop to close
document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', function (e) {
    if (e.target === this) closeModal(this.id);
  });
});

// ════════════════════════════════════════════════════════ INIT ════════════════

(async function init() {
  await populateBranchFilter();
  loadDashboard();
})();
