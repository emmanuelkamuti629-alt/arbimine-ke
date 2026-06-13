const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =======================
// STATIC FRONTEND
// =======================
app.use(express.static(path.join(__dirname, "public")));

// =======================
// ROOT ROUTE (FIX FOR 404)
// =======================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =======================
// HEALTH CHECK
// =======================
app.get("/api/status", (req, res) => {
  res.json({
    status: "ArbiMine running",
    time: new Date().toISOString()
  });
});

// =======================
// SIMPLE AUTH MOCK (FAST LOGIN FIX)
// =======================
let users = [];

app.post("/api/register", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const exists = users.find(u => u.email === email);
  if (exists) {
    return res.status(400).json({ error: "User already exists" });
  }

  const user = { email, password };
  users.push(user);

  return res.json({ success: true, user });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(
    u => u.email === email && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid login" });
  }

  res.json({ success: true, user });
});

// =======================
// SAFE MONGODB CONNECT
// =======================
const MONGO_URI = process.env.MONGO_URI;

if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ MongoDB Error:", err.message));
} else {
  console.log("⚠️ MongoDB not configured (running without DB)");
}

// =======================
// EXCHANGE MOCK (NO CRASHES)
// =======================
app.get("/api/opportunities", (req, res) => {
  res.json([
    {
      pair: "BTC/USDT",
      profit: "1.2%",
      exchange: "binance → kucoin"
    },
    {
      pair: "ETH/USDT",
      profit: "0.8%",
      exchange: "okx → gateio"
    }
  ]);
});

// =======================
// START SERVER (RENDER SAFE)
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ArbiMine running on ${PORT}`);
});
