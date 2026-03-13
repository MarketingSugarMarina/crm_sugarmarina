// db.js — PostgreSQL connection pool + schema init + seed data
// Uses DATABASE_URL from environment (Railway-compatible)
require('dotenv').config();
const { Pool } = require('pg');

// ── Connection Pool ───────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Railway / hosted Postgres
});

// ── Create Tables ─────────────────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- ----------------------------------------------------------------
      -- 1. guests
      -- ----------------------------------------------------------------
      CREATE TABLE IF NOT EXISTS guests (
        id             SERIAL PRIMARY KEY,
        first_name     VARCHAR(100) NOT NULL,
        last_name      VARCHAR(100) NOT NULL,
        email          VARCHAR(150) UNIQUE NOT NULL,
        phone          VARCHAR(20),
        birthday       DATE,
        nationality    VARCHAR(80),
        notes          TEXT,
        email_verified BOOLEAN   DEFAULT FALSE,
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      );

      -- Auto-update updated_at on every UPDATE
      CREATE OR REPLACE FUNCTION fn_set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_guests_updated_at ON guests;
      CREATE TRIGGER trg_guests_updated_at
        BEFORE UPDATE ON guests
        FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

      -- ----------------------------------------------------------------
      -- 2. hotel_branches
      -- ----------------------------------------------------------------
      CREATE TABLE IF NOT EXISTS hotel_branches (
        id     SERIAL PRIMARY KEY,
        name   VARCHAR(150) NOT NULL,          -- full display name
        slug   VARCHAR(80),                    -- short key for filtering
        active BOOLEAN DEFAULT TRUE
      );

      -- ----------------------------------------------------------------
      -- 3. stays
      -- ----------------------------------------------------------------
      CREATE TABLE IF NOT EXISTS stays (
        id             SERIAL PRIMARY KEY,
        guest_id       INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
        branch_id      INTEGER REFERENCES hotel_branches(id),
        check_in_date  DATE    NOT NULL,
        nights         INTEGER NOT NULL DEFAULT 1,
        check_out_date DATE GENERATED ALWAYS AS (check_in_date + nights) STORED,
        preferences    TEXT,   -- guest preferences: e.g. "sea view", "no seafood"
        notes          TEXT,   -- staff internal notes
        created_at     TIMESTAMP DEFAULT NOW()
      );

      -- ----------------------------------------------------------------
      -- 4. otp_tokens
      -- ----------------------------------------------------------------
      CREATE TABLE IF NOT EXISTS otp_tokens (
        id         SERIAL PRIMARY KEY,
        guest_id   INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
        token      VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used       BOOLEAN   DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ Tables created (IF NOT EXISTS)');

    // Seed branches and sample data
    await seedBranches(client);
    await seedData(client);

    console.log('✅ Database initialized');
  } finally {
    client.release();
  }
}

// ── Seed Hotel Branches (11 properties) ──────────────────────────────────────
async function seedBranches(client) {
  // Skip if branches already exist
  const { rows } = await client.query('SELECT COUNT(*) FROM hotel_branches');
  if (parseInt(rows[0].count) > 0) return;

  const branches = [
    { name: 'Sugar Marina Hotel - FASHION',     slug: 'fashion'     },
    { name: 'Sugar Marina Hotel - POP',         slug: 'pop'         },
    { name: 'Sugar Marina Hotel - NAUTICAL',    slug: 'nautical'    },
    { name: 'Sugar Marina Hotel - SURF',        slug: 'surf'        },
    { name: 'Sugar Marina Hotel - ART',         slug: 'art'         },
    { name: 'Sugar Marina Resort - LAGOON',     slug: 'lagoon'      },
    { name: 'Sugar Marina Hotel - AVIATOR',     slug: 'aviator'     },
    { name: 'Sugar Marina Hotel - CLIFFHANGER', slug: 'cliffhanger' },
    { name: 'Marina Gallery Resort',            slug: 'gallery'     },
    { name: 'Marina House',                     slug: 'house'       },
    { name: 'Marina Express',                   slug: 'express'     },
  ];

  for (const b of branches) {
    await client.query(
      `INSERT INTO hotel_branches (name, slug) VALUES ($1, $2)`,
      [b.name, b.slug]
    );
  }
  console.log(`✅ Seeded ${branches.length} hotel branches`);
}

// ── Seed Sample Guests & Stays ────────────────────────────────────────────────
async function seedData(client) {
  // Skip if guests already exist
  const { rows } = await client.query('SELECT COUNT(*) FROM guests');
  if (parseInt(rows[0].count) > 0) return;

  // 5 sample guests
  const guests = [
    {
      first_name: 'Somchai',   last_name: 'Jaidee',
      email: 'somchai.j@example.com',  phone: '+66812345678',
      birthday: '1985-04-12', nationality: 'Thai',
    },
    {
      first_name: 'Emily',     last_name: 'Chen',
      email: 'emily.chen@example.com', phone: '+85291234567',
      birthday: '1992-08-25', nationality: 'Hong Kong',
    },
    {
      first_name: 'James',     last_name: 'Wilson',
      email: 'james.w@example.com',    phone: '+447911123456',
      birthday: '1979-01-30', nationality: 'British',
    },
    {
      first_name: 'Nattaya',   last_name: 'Sriwong',
      email: 'nattaya.s@example.com',  phone: '+66898765432',
      birthday: '1995-11-05', nationality: 'Thai',
    },
    {
      first_name: 'Lucas',     last_name: 'Dubois',
      email: 'lucas.dubois@example.com', phone: '+33612345678',
      birthday: '1988-06-17', nationality: 'French',
    },
  ];

  const guestIds = [];
  for (const g of guests) {
    const res = await client.query(
      `INSERT INTO guests (first_name, last_name, email, phone, birthday, nationality)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [g.first_name, g.last_name, g.email, g.phone, g.birthday, g.nationality]
    );
    guestIds.push(res.rows[0].id);
  }
  console.log(`✅ Seeded ${guests.length} sample guests`);

  // 8 sample stays spread across multiple branches
  // branch_id 1=fashion, 2=pop, 3=nautical, 4=surf, 5=art, 6=lagoon
  const stays = [
    // Somchai — 2 stays
    {
      guest_id: guestIds[0], branch_id: 1,
      check_in_date: '2025-12-20', nights: 3,
      preferences: 'ห้องชั้นสูง วิวทะเล',
      notes: 'VIP repeat guest',
    },
    {
      guest_id: guestIds[0], branch_id: 4,
      check_in_date: '2026-02-14', nights: 2,
      preferences: 'ใกล้ชายหาด',
      notes: 'วันวาเลนไทน์ ขอดอกไม้ในห้อง',
    },
    // Emily — 2 stays
    {
      guest_id: guestIds[1], branch_id: 3,
      check_in_date: '2026-01-05', nights: 5,
      preferences: 'Sea view, quiet room',
      notes: 'Requested early check-in 10:00',
    },
    {
      guest_id: guestIds[1], branch_id: 6,
      check_in_date: '2026-03-01', nights: 4,
      preferences: 'Pool villa preferred',
      notes: '',
    },
    // James — 1 stay
    {
      guest_id: guestIds[2], branch_id: 2,
      check_in_date: '2026-01-18', nights: 7,
      preferences: 'Allergic to shellfish',
      notes: 'Business trip — needs desk & fast WiFi',
    },
    // Nattaya — 2 stays
    {
      guest_id: guestIds[3], branch_id: 5,
      check_in_date: '2025-11-10', nights: 2,
      preferences: 'ชอบงานศิลปะ สนใจ art workshop',
      notes: '',
    },
    {
      guest_id: guestIds[3], branch_id: 1,
      check_in_date: '2026-04-01', nights: 3,
      preferences: 'Connecting rooms (มากับครอบครัว)',
      notes: 'ลูก 2 คน อายุ 5 และ 8 ปี',
    },
    // Lucas — 1 stay
    {
      guest_id: guestIds[4], branch_id: 7,
      check_in_date: '2026-02-28', nights: 6,
      preferences: 'Aviation enthusiast, wants aviator-themed room',
      notes: 'Honeymoon package requested',
    },
  ];

  for (const s of stays) {
    await client.query(
      `INSERT INTO stays (guest_id, branch_id, check_in_date, nights, preferences, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [s.guest_id, s.branch_id, s.check_in_date, s.nights, s.preferences, s.notes]
    );
  }
  console.log(`✅ Seeded ${stays.length} sample stays`);
}

module.exports = { pool, initDB };
