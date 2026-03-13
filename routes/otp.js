// routes/otp.js — OTP send / verify / status API
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { generateOTP, sendOTPEmail } = require('../mailer');

// ── POST /api/otp/send ────────────────────────────────────────────────────────
// Body: { guest_id, email }
// Validates guest, rate-limits to 1 send/minute, generates & stores OTP, sends email
router.post('/send', async (req, res) => {
  const { guest_id, email } = req.body;

  if (!guest_id || !email)
    return res.status(400).json({ success: false, message: 'กรุณาระบุ guest_id และ email' });

  try {
    // 1. Verify guest exists and email matches
    const guestResult = await pool.query(
      'SELECT id, first_name, email FROM guests WHERE id = $1',
      [guest_id]
    );

    if (guestResult.rows.length === 0)
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลแขก' });

    const guest = guestResult.rows[0];

    if (guest.email.toLowerCase() !== email.toLowerCase())
      return res.status(400).json({ success: false, message: 'อีเมลไม่ตรงกับข้อมูลในระบบ' });

    // 2. Rate limit — block if an OTP was sent less than 1 minute ago
    const rateCheck = await pool.query(
      `SELECT created_at FROM otp_tokens
       WHERE guest_id = $1
         AND created_at > NOW() - INTERVAL '1 minute'
       ORDER BY created_at DESC
       LIMIT 1`,
      [guest_id]
    );

    if (rateCheck.rows.length > 0) {
      const sentAt = new Date(rateCheck.rows[0].created_at);
      const secondsLeft = 60 - Math.floor((Date.now() - sentAt.getTime()) / 1000);
      return res.status(429).json({
        success: false,
        message: `กรุณารอ ${secondsLeft} วินาที ก่อนขอ OTP ใหม่`,
      });
    }

    // 3. Generate OTP and store in otp_tokens (expires in 10 minutes)
    const token = generateOTP();
    await pool.query(
      `INSERT INTO otp_tokens (guest_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [guest_id, token]
    );

    // 4. Send email
    const result = await sendOTPEmail(guest.email, guest.first_name, token);
    if (!result.success)
      return res.status(500).json({ success: false, message: 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่' });

    res.json({ success: true, message: `ส่ง OTP ไปยัง ${guest.email} แล้ว` });
  } catch (err) {
    console.error('POST /api/otp/send:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// ── POST /api/otp/verify ──────────────────────────────────────────────────────
// Body: { guest_id, token }
// Validates OTP, marks it used, sets guests.email_verified = true
router.post('/verify', async (req, res) => {
  const { guest_id, token } = req.body;

  if (!guest_id || !token)
    return res.status(400).json({ success: false, message: 'กรุณาระบุ guest_id และ token' });

  try {
    // Find a valid, unused, non-expired token for this guest
    const otpResult = await pool.query(
      `SELECT id FROM otp_tokens
       WHERE guest_id  = $1
         AND token     = $2
         AND used      = FALSE
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [guest_id, token]
    );

    if (otpResult.rows.length === 0)
      return res.status(400).json({
        success: false,
        message: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว',
      });

    const otpId = otpResult.rows[0].id;

    // Mark OTP as used + verify guest email in a single transaction
    await pool.query('BEGIN');
    await pool.query('UPDATE otp_tokens SET used = TRUE  WHERE id = $1',        [otpId]);
    await pool.query('UPDATE guests      SET email_verified = TRUE WHERE id = $1', [guest_id]);
    await pool.query('COMMIT');

    res.json({ success: true, message: 'ยืนยันอีเมลสำเร็จ ✓' });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('POST /api/otp/verify:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// ── GET /api/otp/status/:guest_id ────────────────────────────────────────────
// Returns current email verification status for a guest
router.get('/status/:guest_id', async (req, res) => {
  const { guest_id } = req.params;

  try {
    const result = await pool.query(
      'SELECT email_verified FROM guests WHERE id = $1',
      [guest_id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลแขก' });

    res.json({ success: true, email_verified: result.rows[0].email_verified });
  } catch (err) {
    console.error('GET /api/otp/status:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

module.exports = router;
