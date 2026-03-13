// server.js — Express server: static files + API routes
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from /public (index.html, app.js, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/guests', require('./routes/guests'));
app.use('/api/otp', require('./routes/otp'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Sugar Marina CRM' });
});

// Catch-all: serve index.html for any non-API route (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize DB then start server
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🏨 Sugar Marina CRM running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to initialize database:', err.message);
    process.exit(1);
  });
