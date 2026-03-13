// routes/branches.js — Hotel Branches + Stays API
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// ── GET /api/branches/stats ───────────────────────────────────────────────────
// Must be before /:id
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        b.id          AS branch_id,
        b.name,
        b.slug,
        COUNT(s.id)            AS stay_count,
        COUNT(DISTINCT s.guest_id) AS guest_count
      FROM hotel_branches b
      LEFT JOIN stays s ON s.branch_id = b.id
      WHERE b.active = TRUE
      GROUP BY b.id, b.name, b.slug
      ORDER BY stay_count DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/branches/stats:', err);
    res.status(500).json({ error: 'Failed to fetch branch stats' });
  }
});

// ── GET /api/branches ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM hotel_branches WHERE active = TRUE ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/branches:', err);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// ── POST /api/stays ───────────────────────────────────────────────────────────
router.post('/stays', async (req, res) => {
  const { guest_id, branch_id, check_in_date, nights, preferences, notes } = req.body;

  if (!guest_id || !branch_id || !check_in_date || !nights)
    return res.status(400).json({
      error: 'guest_id, branch_id, check_in_date และ nights จำเป็นต้องมี'
    });

  try {
    const { rows } = await pool.query(
      `INSERT INTO stays (guest_id, branch_id, check_in_date, nights, preferences, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [guest_id, branch_id, check_in_date, nights, preferences || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/stays:', err);
    res.status(500).json({ error: 'Failed to create stay' });
  }
});

// ── PUT /api/stays/:id ────────────────────────────────────────────────────────
router.put('/stays/:id', async (req, res) => {
  const { branch_id, check_in_date, nights, preferences, notes } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE stays SET
         branch_id     = COALESCE($1, branch_id),
         check_in_date = COALESCE($2, check_in_date),
         nights        = COALESCE($3, nights),
         preferences   = COALESCE($4, preferences),
         notes         = COALESCE($5, notes)
       WHERE id = $6
       RETURNING *`,
      [branch_id ?? null, check_in_date ?? null, nights ?? null,
       preferences ?? null, notes ?? null, req.params.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: 'Stay not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/stays/:id:', err);
    res.status(500).json({ error: 'Failed to update stay' });
  }
});

// ── DELETE /api/stays/:id ─────────────────────────────────────────────────────
router.delete('/stays/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM stays WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: 'Stay not found' });
    res.json({ message: 'ลบประวัติการเข้าพักแล้ว', id: rows[0].id });
  } catch (err) {
    console.error('DELETE /api/stays/:id:', err);
    res.status(500).json({ error: 'Failed to delete stay' });
  }
});

module.exports = router;
