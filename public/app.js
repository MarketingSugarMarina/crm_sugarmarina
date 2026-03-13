// app.js — Frontend logic for Sugar Marina Guest CRM

const API = '/api';

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, duration = 3200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ── Stats Cards ───────────────────────────────────────────────────────────────
function updateStats(guests) {
  const total      = guests.length;
  const verified   = guests.filter(g => g.email_verified).length;
  const unverified = total - verified;
  const nats       = new Set(guests.map(g => g.nationality).filter(Boolean)).size;

  document.getElementById('statTotal').textContent      = total;
  document.getElementById('statVerified').textContent   = verified;
  document.getElementById('statUnverified').textContent = unverified;
  document.getElementById('statNat').textContent        = nats;
  document.getElementById('guestCount').textContent     = `${total} guest${total !== 1 ? 's' : ''}`;
}

// ── Load & display guests ─────────────────────────────────────────────────────
async function loadGuests() {
  const search = document.getElementById('searchInput').value.trim();
  const url = search
    ? `${API}/guests?search=${encodeURIComponent(search)}`
    : `${API}/guests`;

  try {
    const res    = await fetch(url);
    const guests = await res.json();
    renderGuests(guests);
    updateStats(guests);
  } catch {
    toast('ไม่สามารถโหลดข้อมูลได้');
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderGuests(guests) {
  const tbody = document.getElementById('guestBody');

  if (guests.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>ไม่พบข้อมูลแขก</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = guests.map((g, i) => {
    const verified = g.email_verified;
    const safeName = (g.first_name + ' ' + g.last_name).replace(/'/g, "\\'");
    return `
      <tr>
        <td style="color:var(--muted);font-size:0.8rem;">${i + 1}</td>
        <td>
          <div class="guest-name">
            <strong>${g.first_name} ${g.last_name}</strong>
            <small>${g.email}</small>
          </div>
        </td>
        <td>${g.phone || '—'}</td>
        <td>${g.nationality || '—'}</td>
        <td>${formatDate(g.birthday)}</td>
        <td>
          <span class="badge ${verified ? 'badge-verified' : 'badge-unverified'}">
            ${verified ? 'Verified' : 'Pending'}
          </span>
        </td>
        <td>
          <div class="action-group">
            <button class="btn btn-amber btn-sm" onclick="openEditModal(${g.id})">Edit</button>
            <button class="btn btn-red    btn-sm" onclick="deleteGuest(${g.id}, '${safeName}')">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ── Debounce search (fires 350ms after user stops typing) ──────────────────────
let _searchTimer;
function debounceSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(loadGuests, 350);
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Add New Guest';
  document.getElementById('guestForm').reset();
  document.getElementById('guestId').value = '';
  document.getElementById('otpSection').style.display = 'none';
  document.getElementById('guestModal').classList.add('active');
}

async function openEditModal(id) {
  try {
    const res = await fetch(`${API}/guests/${id}`);
    const g   = await res.json();

    document.getElementById('modalTitle').textContent    = 'Edit Guest';
    document.getElementById('guestId').value             = g.id;
    document.getElementById('firstName').value           = g.first_name;
    document.getElementById('lastName').value            = g.last_name;
    document.getElementById('email').value               = g.email;
    document.getElementById('phone').value               = g.phone || '';
    document.getElementById('nationality').value         = g.nationality || '';
    document.getElementById('passportNo').value          = g.passport_no || '';
    document.getElementById('dob').value                 = g.birthday ? g.birthday.substring(0, 10) : '';
    document.getElementById('notes').value               = g.notes || '';
    document.getElementById('otpSection').style.display  = 'block';
    document.getElementById('otpCode').value             = '';

    document.getElementById('guestModal').classList.add('active');
  } catch {
    toast('โหลดข้อมูลแขกไม่สำเร็จ');
  }
}

function closeModal() {
  document.getElementById('guestModal').classList.remove('active');
}

// Click backdrop to close
document.getElementById('guestModal').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

// ── Save guest (create or update) ─────────────────────────────────────────────
async function saveGuest(e) {
  e.preventDefault();
  const id   = document.getElementById('guestId').value;
  const body = {
    first_name:  document.getElementById('firstName').value.trim(),
    last_name:   document.getElementById('lastName').value.trim(),
    email:       document.getElementById('email').value.trim(),
    phone:       document.getElementById('phone').value.trim()       || null,
    nationality: document.getElementById('nationality').value.trim() || null,
    passport_no: document.getElementById('passportNo').value.trim()  || null,
    birthday:    document.getElementById('dob').value                || null,
    notes:       document.getElementById('notes').value.trim()       || null,
  };

  const method = id ? 'PUT' : 'POST';
  const url    = id ? `${API}/guests/${id}` : `${API}/guests`;

  try {
    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'บันทึกไม่สำเร็จ');

    toast(id ? '✓ อัปเดตข้อมูลแขกแล้ว' : '✓ เพิ่มแขกใหม่แล้ว');
    closeModal();
    loadGuests();
  } catch {
    toast('Network error');
  }
}

// ── Delete guest ──────────────────────────────────────────────────────────────
async function deleteGuest(id, name) {
  if (!confirm(`ลบแขก "${name}"?\nการกระทำนี้ไม่สามารถเลิกทำได้`)) return;
  try {
    const res  = await fetch(`${API}/guests/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'ลบไม่สำเร็จ');
    toast('ลบข้อมูลแขกแล้ว');
    loadGuests();
  } catch {
    toast('Network error');
  }
}

// ── OTP: send ─────────────────────────────────────────────────────────────────
async function sendOTP() {
  const guest_id = document.getElementById('guestId').value;
  const email    = document.getElementById('email').value.trim();
  if (!email) return toast('กรุณาระบุอีเมล');
  try {
    const res  = await fetch(`${API}/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id, email }),
    });
    const data = await res.json();
    toast(data.message || (res.ok ? 'ส่ง OTP แล้ว' : 'ส่ง OTP ไม่สำเร็จ'));
  } catch {
    toast('ส่ง OTP ไม่สำเร็จ');
  }
}

// ── OTP: verify ───────────────────────────────────────────────────────────────
async function verifyOTP() {
  const guest_id = document.getElementById('guestId').value;
  const token    = document.getElementById('otpCode').value.trim();
  if (!token) return toast('กรุณากรอกรหัส OTP');
  try {
    const res  = await fetch(`${API}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id, token }),
    });
    const data = await res.json();
    if (res.ok) { toast('✓ ยืนยันอีเมลสำเร็จ'); closeModal(); loadGuests(); }
    else toast(data.message || 'รหัส OTP ไม่ถูกต้อง');
  } catch {
    toast('ยืนยัน OTP ไม่สำเร็จ');
  }
}

// ── Enter to search ───────────────────────────────────────────────────────────
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadGuests();
});

// ── Initial load ──────────────────────────────────────────────────────────────
loadGuests();
