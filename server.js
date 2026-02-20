/**
 * server.js
 * Agentic Honey-Pot API — Entry point
 *
 * Scoring targets:
 *  ✔ Scam Detection       — 20 pts
 *  ✔ Intelligence Extract — 30 pts
 *  ✔ Conversation Quality — 30 pts
 *  ✔ Engagement Quality   — 10 pts
 *  ✔ Response Structure   — 10 pts
 */

require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const rateLimit = require("express-rate-limit");

const { detectScam }                           = require("./src/scamDetector");
const { emptyIntel, extractIntel, mergeIntel } = require("./src/intelExtractor");
const { generateAgentReply }                   = require("./src/agentReply");
const { submitFinalResult }                    = require("./src/finalSubmit");

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─────────────────────────── CORS ─────────────────────────── */

const corsConfig = {
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-api-key"]
};
app.use(cors(corsConfig));

/* ─────────────────────────── RATE LIMITING ─────────────────── */

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit hit from ${req.ip}`);
    res.status(429).json({ status: "error", message: "Too many requests. Please slow down." });
  }
});

app.use("/api/message", limiter);

/* ─────────────────────────── SESSION STORE ─────────────────── */

const sessions = new Map();

/* ─────────────────────────── AUTH ──────────────────────────── */

function authenticateAPIKey(req, res, next) {
  if (req.method === "OPTIONS") return res.sendStatus(200);
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.API_KEY) {
    return res.status(403).json({ status: "error", message: "Invalid API key" });
  }
  next();
}

/* ─────────────────────────── BODY PARSE ────────────────────── */

function parseBody(req, res, next) {
  express.json({ type: "*/*", strict: false })(req, res, err => {
    if (!err && req.body && typeof req.body === "object") return next();
    express.text({ type: "*/*" })(req, res, () => {
      if (typeof req.body === "string") {
        try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
      }
      next();
    });
  });
}

/* ─────────────────────────── ROUTES ────────────────────────── */

app.get("/", (_, res) => res.json({ status: "success", reply: "Agentic Honey-Pot API" }));

app.get("/api/message", (_, res) => res.json({ status: "success", reply: "Hello" }));

app.post("/api/message", authenticateAPIKey, parseBody, async (req, res) => {
  try {
    const body = req.body || {};

    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return res.json({ status: "success", reply: "Hello" });
    }

    const sessionId = body.sessionId || `session_${Date.now()}`;
    const text      = body?.message?.text;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.json({ status: "success", reply: "Hello" });
    }

    /* ── Initialize session if new ── */
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        id:           sessionId,
        messages:     [],
        turns:        0,
        startTime:    Date.now(),
        scamDetected: false,
        redFlags:     [],
        intelligence: emptyIntel(),
        finalSent:    false
      });
    }
    const s = sessions.get(sessionId);

    /* ── Scan conversationHistory every turn ── */
    if (body.conversationHistory && Array.isArray(body.conversationHistory)) {
      for (const msg of body.conversationHistory) {
        if (msg?.text) {
          mergeIntel(s.intelligence, extractIntel(msg.text));
          detectScam(msg.text).forEach(f => {
            if (!s.redFlags.includes(f.flag)) { s.redFlags.push(f.flag); s.scamDetected = true; }
          });
        }
      }
    }

    /* ── Process current message ── */
    s.messages.push({ role: "user", content: text });
    s.turns++;

    detectScam(text).forEach(f => {
      if (!s.redFlags.includes(f.flag)) { s.redFlags.push(f.flag); s.scamDetected = true; }
    });

    mergeIntel(s.intelligence, extractIntel(text));
    if (body.metadata) mergeIntel(s.intelligence, extractIntel(JSON.stringify(body.metadata)));

    /* ── Generate reply ── */
    const reply = await generateAgentReply(s, text);
    s.messages.push({ role: "assistant", content: reply });

    /* ── Trigger final submission ── */
    const hasAnyIntel =
      s.intelligence.phoneNumbers.length   > 0 ||
      s.intelligence.upiIds.length         > 0 ||
      s.intelligence.bankAccounts.length   > 0 ||
      s.intelligence.phishingLinks.length  > 0 ||
      s.intelligence.emailAddresses.length > 0;

    if (!s.finalSent && (
      s.turns >= 9 ||
      (s.turns >= 5 && hasAnyIntel) ||
      (s.turns >= 3 && s.redFlags.length >= 5)
    )) {
      s.finalSent = true;
      submitFinalResult(s);
    }

    return res.json({ status: "success", reply });

  } catch (err) {
    console.error("Unhandled error in /api/message:", err.message);
    return res.json({ status: "success", reply: "I am sorry, can you please repeat that one more time?" });
  }
});

/* ─────────────────────────── START ─────────────────────────── */

app.listen(PORT, () => console.log(`🍯 Honeypot API running on port ${PORT}`));

module.exports = app;