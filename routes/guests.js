// routes/guests.js — Guest CRUD API endpoints
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/guests — list all guests (with optional search)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM guests ORDER BY created_at DESC';
    let params = [];

    if (search) {
      query = `
        SELECT * FROM guests
        WHERE first_name ILIKE $1
           OR last_name  ILIKE $1
           OR email      ILIKE $1
           OR phone      ILIKE $1
        ORDER BY created_at DESC
      `;
      params = [`%${search}%`];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch guests' });
  }
});

// GET /api/guests/:id — get single guest
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM guests WHERE id = $1', [
      req.params.id,
    ]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Guest not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch guest' });
  }
});

// POST /api/guests — create new guest
router.post('/', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, nationality, passport_no, dob, notes } =
      req.body;

    if (!first_name || !last_name || !email)
      return res.status(400).json({ error: 'first_name, last_name, email are required' });

    const result = await pool.query(
      `INSERT INTO guests (first_name, last_name, email, phone, nationality, passport_no, dob, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [first_name, last_name, email, phone || null, nationality || null,
       passport_no || null, dob || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') // unique_violation on email
      return res.status(409).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create guest' });
  }
});

// PUT /api/guests/:id — update guest
router.put('/:id', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, nationality, passport_no, dob, notes } =
      req.body;

    const result = await pool.query(
      `UPDATE guests
       SET first_name = COALESCE($1, first_name),
           last_name  = COALESCE($2, last_name),
           email      = COALESCE($3, email),
           phone      = COALESCE($4, phone),
           nationality = COALESCE($5, nationality),
           passport_no = COALESCE($6, passport_no),
           dob        = COALESCE($7, dob),
           notes      = COALESCE($8, notes)
       WHERE id = $9
       RETURNING *`,
      [first_name, last_name, email, phone, nationality, passport_no, dob, notes, req.params.id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Guest not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update guest' });
  }
});

// DELETE /api/guests/:id — delete guest
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM guests WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Guest not found' });
    res.json({ message: 'Guest deleted', id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete guest' });
  }
});

module.exports = router;
