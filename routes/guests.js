// routes/guests.js — Guest CRUD + Stats API
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { generateOTP, sendOTPEmail } = require('../mailer');

// ── Helper: save OTP token and send email ─────────────────────────────────────
async function issueOTP(client, guest) {
  const token = generateOTP();
  await client.query(
    `INSERT INTO otp_tokens (guest_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
    [guest.id, token]
  );
  const result = await sendOTPEmail(guest.email, guest.first_name, token);
  return result.success;
}

// ── GET /api/guests/stats ─────────────────────────────────────────────────────
// Must be declared BEFORE /:id to avoid route conflict
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                        AS total_guests,
        COUNT(*) FILTER (WHERE email_verified = TRUE)  AS verified,
        COUNT(*) FILTER (WHERE email_verified = FALSE) AS unverified,
        COUNT(DISTINCT nationality)
          FILTER (WHERE nationality IS NOT NULL)        AS nationalities
      FROM guests
    `);

    const stays = await pool.query(`
      SELECT
        COUNT(*)                                                           AS total_stays,
        COUNT(*) FILTER (
          WHERE DATE_TRUNC('month', check_in_date) = DATE_TRUNC('month', NOW())
        )                                                                  AS stays_this_month,
        COUNT(DISTINCT guest_id) FILTER (
          WHERE DATE_TRUNC('month', check_in_date) = DATE_TRUNC('month', NOW())
        )                                                                  AS guests_this_month
      FROM stays
    `);

    res.json({ ...rows[0], ...stays.rows[0] });
  } catch (err) {
    console.error('GET /api/guests/stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── GET /api/guests ───────────────────────────────────────────────────────────
// Query params: ?search=  ?verified=true/false  ?branch_id=
router.get('/', async (req, res) => {
  try {
    const { search, verified, branch_id } = req.query;
    const conditions = [];
    const params     = [];

    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      conditions.push(`(
        g.first_name ILIKE $${p} OR g.last_name  ILIKE $${p} OR
        g.email      ILIKE $${p} OR g.phone      ILIKE $${p} OR
        g.nationality ILIKE $${p}
      )`);
    }

    if (verified !== undefined) {
      params.push(verified === 'true');
      conditions.push(`g.email_verified = $${params.length}`);
    }

    // filter by branch: only guests who have stayed at that branch
    let joinClause = '';
    if (branch_id) {
      params.push(parseInt(branch_id));
      joinClause = `JOIN stays st ON st.guest_id = g.id AND st.branch_id = $${params.length}`;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT DISTINCT g.*
      FROM guests g
      ${joinClause}
      ${where}
      ORDER BY g.created_at DESC
    `;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/guests:', err);
    res.status(500).json({ error: 'Failed to fetch guests' });
  }
});

// ── GET /api/guests/:id ───────────────────────────────────────────────────────
// Returns guest profile + full stay history with branch names
router.get('/:id', async (req, res) => {
  try {
    const guestResult = await pool.query(
      'SELECT * FROM guests WHERE id = $1',
      [req.params.id]
    );
    if (guestResult.rows.length === 0)
      return res.status(404).json({ error: 'Guest not found' });

    const staysResult = await pool.query(
      `SELECT s.*, b.name AS branch_name, b.slug AS branch_slug
       FROM stays s
       JOIN hotel_branches b ON b.id = s.branch_id
       WHERE s.guest_id = $1
       ORDER BY s.check_in_date DESC`,
      [req.params.id]
    );

    res.json({ ...guestResult.rows[0], stays: staysResult.rows });
  } catch (err) {
    console.error('GET /api/guests/:id:', err);
    res.status(500).json({ error: 'Failed to fetch guest' });
  }
});

// ── POST /api/guests ──────────────────────────────────────────────────────────
// Creates guest and immediately sends OTP
router.post('/', async (req, res) => {
  const { first_name, last_name, email, phone, birthday, nationality, notes } = req.body;

  if (!first_name?.trim() || !last_name?.trim() || !email?.trim())
    return res.status(400).json({ error: 'first_name, last_name และ email จำเป็นต้องมี' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO guests (first_name, last_name, email, phone, birthday, nationality, notes, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
       RETURNING *`,
      [first_name.trim(), last_name.trim(), email.trim().toLowerCase(),
       phone || null, birthday || null, nationality || null, notes || null]
    );

    const guest = rows[0];

    // Send OTP immediately after creation
    const otpSent = await issueOTP(client, guest);

    await client.query('COMMIT');
    res.status(201).json({ ...guest, otp_sent: otpSent });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505')
      return res.status(409).json({ error: 'อีเมลนี้ถูกลงทะเบียนแล้ว' });
    console.error('POST /api/guests:', err);
    res.status(500).json({ error: 'Failed to create guest' });
  } finally {
    client.release();
  }
});

// ── PUT /api/guests/:id ───────────────────────────────────────────────────────
// If email changes: reset email_verified and send new OTP
router.put('/:id', async (req, res) => {
  const { first_name, last_name, email, phone, birthday, nationality, notes } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch current guest to detect email change
    const current = await client.query(
      'SELECT * FROM guests WHERE id = $1',
      [req.params.id]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Guest not found' });
    }

    const prev        = current.rows[0];
    const emailChanged = email && email.trim().toLowerCase() !== prev.email;
    const newVerified  = emailChanged ? false : prev.email_verified;

    const { rows } = await client.query(
      `UPDATE guests SET
         first_name     = COALESCE($1, first_name),
         last_name      = COALESCE($2, last_name),
         email          = COALESCE($3, email),
         phone          = COALESCE($4, phone),
         birthday       = COALESCE($5, birthday),
         nationality    = COALESCE($6, nationality),
         notes          = COALESCE($7, notes),
         email_verified = $8
       WHERE id = $9
       RETURNING *`,
      [
        first_name?.trim() || null,
        last_name?.trim()  || null,
        email?.trim().toLowerCase() || null,
        phone       ?? null,
        birthday    ?? null,
        nationality ?? null,
        notes       ?? null,
        newVerified,
        req.params.id,
      ]
    );

    const updated  = rows[0];
    let   otp_sent = false;

    // Re-send OTP if email was changed
    if (emailChanged) {
      otp_sent = await issueOTP(client, updated);
    }

    await client.query('COMMIT');
    res.json({ ...updated, otp_sent });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /api/guests/:id:', err);
    res.status(500).json({ error: 'Failed to update guest' });
  } finally {
    client.release();
  }
});

// ── DELETE /api/guests/:id ────────────────────────────────────────────────────
// Cascade deletes stays and otp_tokens automatically (DB constraint)
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM guests WHERE id = $1 RETURNING id, first_name, last_name',
      [req.params.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: 'Guest not found' });

    res.json({ message: 'ลบข้อมูลแขกแล้ว', deleted: rows[0] });
  } catch (err) {
    console.error('DELETE /api/guests/:id:', err);
    res.status(500).json({ error: 'Failed to delete guest' });
  }
});

module.exports = router;
