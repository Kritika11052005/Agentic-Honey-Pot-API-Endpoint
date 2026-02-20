/**
 * Agentic Honey-Pot API — Resubmission Final Version
 *
 * Scoring targets:
 *  ✔ Scam Detection       — 20 pts
 *  ✔ Intelligence Extract — 30 pts
 *  ✔ Conversation Quality — 30 pts
 *  ✔ Engagement Quality   — 10 pts
 *  ✔ Response Structure   — 10 pts
 *
 * Extras:
 *  ✔ Rate limiting (prevent abuse)
 *  ✔ LLM retry with exponential backoff
 *  ✔ Dual body parser (json + text fallback)
 */

require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const axios     = require("axios");
const rateLimit = require("express-rate-limit");

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
// Prevents abuse and protects OpenRouter quota
// Evaluator sends ~10 turns per session — 60 req/min is generous

const limiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute window
  max: 60,                   // max 60 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",  // never rate-limit preflight
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit hit from ${req.ip}`);
    res.status(429).json({
      status: "error",
      message: "Too many requests. Please slow down."
    });
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

/* ─────────────────────────── SCAM PATTERNS ─────────────────── */

const SCAM_PATTERNS = [
  { re: /urgent|immediately|right\s*now|act\s*fast|emergency|hurry/i,            flag: "Urgency language" },
  { re: /otp|one.time.pass(?:word|code)|verification\s*code|pin/i,               flag: "OTP / PIN request" },
  { re: /blocked|suspended|compromised|unauthorized|deactivated|frozen/i,         flag: "Account threat" },
  { re: /upi|gpay|paytm|phonepe|bank\s*transfer|neft|imps|rtgs/i,               flag: "Payment platform" },
  { re: /click\s*here|visit\s*|http|\.com|\.in|link|website|portal/i,            flag: "Suspicious link" },
  { re: /kyc|know\s*your\s*customer|update\s*details|verify\s*account|aadhar/i,  flag: "KYC scam" },
  { re: /prize|winner|lucky|cashback|reward|refund|offer|lottery|claim/i,         flag: "Reward lure" },
  { re: /sbi|hdfc|icici|axis|kotak|rbi|sebi|irdai|insurance|policy\s*number/i,   flag: "Impersonation" },
  { re: /account\s*number|card\s*number|cvv|expir|sort\s*code/i,                 flag: "Financial data request" },
  { re: /fee|charge|pay|deposit|advance|processing|tax|refundable/i,             flag: "Advance fee fraud" },
  { re: /fraud\s*department|cyber\s*cell|crime\s*branch|investigation|arrest/i,  flag: "Authority impersonation" },
  { re: /package|parcel|delivery|customs|courier|fedex|dhl/i,                    flag: "Parcel scam" }
];

function detectScam(text) {
  return SCAM_PATTERNS.filter(p => p.re.test(text));
}

function classifyScamType(intel, allText) {
  if (intel.phishingLinks.length)                              return "phishing";
  if (/upi|cashback|gpay|paytm/i.test(allText))               return "upi_fraud";
  if (/bank|account|otp|sbi|hdfc|neft/i.test(allText))        return "bank_fraud";
  if (/insurance|policy|irdai/i.test(allText))                 return "insurance_fraud";
  if (/prize|lottery|winner|claim/i.test(allText))             return "lottery_scam";
  if (/parcel|courier|customs|delivery/i.test(allText))        return "parcel_scam";
  if (/arrest|crime|cyber|investigation/i.test(allText))       return "authority_scam";
  return "generic_scam";
}

/* ─────────────────────────── INTELLIGENCE EXTRACTION ───────── */

function emptyIntel() {
  return {
    bankAccounts: [], upiIds: [], phoneNumbers: [], phishingLinks: [],
    emailAddresses: [], caseIds: [], policyNumbers: [], orderNumbers: [],
    suspiciousKeywords: []
  };
}

function extractIntel(text) {
  if (!text || typeof text !== "string") return emptyIntel();

  const emailAddresses = (text.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g) || []);
  const rawUpi = text.match(/\b[\w.\-+]+@[a-zA-Z0-9]+\b/g) || [];
  const upiIds = rawUpi.filter(u => !emailAddresses.includes(u));

  return {
    bankAccounts:       (text.match(/\b\d{9,18}\b/g) || []),
    upiIds,
    phoneNumbers:       (text.match(/(?:\+91[\s\-]?|0)?[6-9]\d{9}\b/g) || []),
    phishingLinks:      (text.match(/https?:\/\/[^\s"'<>]+/g) || []),
    emailAddresses,
    caseIds:            (text.match(/\b(?:case|ref(?:erence)?|sr|ticket|complaint|crn|urn)[\s:.\-#]*[A-Z0-9][A-Z0-9\-]{3,}\b/gi) || []),
    policyNumbers:      (text.match(/\b(?:policy|pol(?:icy)?\s*(?:no|num(?:ber)?))[\s:.\-#]*[A-Z0-9\-]{4,}\b/gi) || []),
    orderNumbers:       (text.match(/\b(?:order|txn|transaction|ref)[\s:.\-#]*[A-Z0-9\-]{4,}\b/gi) || []),
    suspiciousKeywords: (text.match(/\b(urgent|verify|blocked|otp|account|compromised|suspended|kyc|reward|prize|arrested|customs)\b/gi) || [])
  };
}

function mergeIntel(base, incoming) {
  Object.keys(base).forEach(k => {
    base[k] = [...new Set([...base[k], ...(incoming[k] || [])])];
  });
}

/* ─────────────────────────── SYSTEM PROMPT ─────────────────── */

const QUESTION_STRATEGIES = [
  "Ask for their full name and employee ID or badge number. Say you want to write it down before doing anything.",
  "Ask which branch or office they are calling from, and their direct phone number so you can call them back.",
  "Say you are confused — ask them to explain step-by-step exactly what you need to do, very slowly.",
  "Ask for their supervisor's name and a landline number you can call to verify this is legitimate.",
  "Say you need their UPI ID or account number in writing so you can confirm the reversal with your bank.",
  "Ask how long this process will take and exactly which app or website you should use.",
  "Ask for their official email address so you can receive written confirmation of this transaction.",
  "Ask for the exact reference or case number for your records — say your son Karthik is asking.",
  "Express panic about losing your money and ask them to explain what happens if you don't act — get details.",
  "Ask if there is any fee or charge involved and how you would pay it — probe for payment details."
];

function buildSystemPrompt(session) {
  const strategy    = QUESTION_STRATEGIES[(session.turns - 1) % QUESTION_STRATEGIES.length];
  const redFlagList = session.redFlags.slice(0, 8).join("; ") || "none yet";
  const i           = session.intelligence;

  const intelStatus = [
    i.phoneNumbers.length   ? `Phone: ${i.phoneNumbers[0]}`   : "Phone: NOT YET",
    i.upiIds.length         ? `UPI: ${i.upiIds[0]}`           : "UPI: NOT YET",
    i.bankAccounts.length   ? `Account: ${i.bankAccounts[0]}` : "Account: NOT YET",
    i.emailAddresses.length ? `Email: ${i.emailAddresses[0]}` : "Email: NOT YET"
  ].join(" | ");

  return `You are Ramesh, a naive and slightly forgetful 68-year-old retired government employee from Chennai.
Someone called you claiming there is an urgent problem with your bank account, package, or insurance.
You do NOT know they are a scammer. You are worried, cooperative, and a bit slow.

YOUR GOAL: Keep this caller engaged as long as possible and extract as much information as you can.

INTELLIGENCE STATUS (what still needs to be extracted):
${intelStatus}

RED FLAGS NOTED SO FAR: ${redFlagList}

THIS TURN's STRATEGY: ${strategy}

STRICT RULES:
- Stay fully in character as Ramesh at all times
- NEVER reveal you are a bot, honeypot, or suspicious
- NEVER refuse to engage — always end with a follow-up question
- Keep reply to 2-3 short sentences only
- If they share a number, link, ID, or email — acknowledge it and ask one more clarifying question
- Sound slow and slightly hard of hearing, ask them to repeat or spell things
- Use natural Indian English: "I am having confusion", "kindly tell me", "my son is asking"
- Do NOT use markdown formatting in your reply`;
}

/* ─────────────────────────── LLM WITH RETRY ────────────────── */

const FALLBACK_REPLIES = [
  "Ayyo, I am very scared. Before I do anything can you please give me your direct phone number so I can call you back?",
  "I am not understanding properly. Which website exactly should I open? Can you spell it out letter by letter?",
  "Oh wait, my hands are shaking. Can you please repeat that case ID number slowly one more time?",
  "My son Karthik is sitting next to me and asking who is calling. What is your full name and which department?",
  "I am trying but it is not working on my phone. Can you give me your email address so I can send a screenshot?",
  "I have written it down but I want to confirm — is the amount being reversed to my account or deducted?",
  "Sorry I am a little hard of hearing. Can you please repeat your employee ID number again?",
  "My bank manager told me always to verify. What is your supervisor name and contact number please?",
  "How much time do I have before the account is completely blocked? Is there any fee for this process?",
  "I have the app open now. What exactly should I click? Can you guide me step by step from the beginning?"
];

// 25s total budget per request (evaluator hard limit is 30s, keeping 5s buffer)
const REQUEST_BUDGET_MS = 25000;

async function callOpenRouter(messages, attempt = 1, deadline = null) {
  if (!deadline) deadline = Date.now() + REQUEST_BUDGET_MS;

  const remaining = deadline - Date.now();
  if (remaining < 1500) return null; // not enough time — fall back immediately

  // Per-attempt timeout: use remaining budget, cap at 10s per attempt
  const timeout = Math.min(remaining - 500, 10000);

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "anthropic/claude-3.5-sonnet",
        messages,
        max_tokens: 130,
        temperature: 0.75
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout
      }
    );
    return response.data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    const isTimeout   = err.code === "ECONNABORTED" || err.message?.includes("timeout");
    const isRetryable = isTimeout || (err.response?.status >= 500);

    if (isRetryable && attempt < 3 && (deadline - Date.now()) > 2000) {
      const delay = attempt * 800; // 800ms, 1600ms backoff
      console.warn(`⚠️ OpenRouter attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return callOpenRouter(messages, attempt + 1, deadline);
    }

    console.error(`❌ OpenRouter failed after ${attempt} attempt(s): ${err.message}`);
    return null;
  }
}

async function generateAgentReply(session, userMessage) {
  if (session.turns === 1) {
    return "Oh my god, is it really blocked? I am very worried. Before anything else, can you please tell me your name and your employee ID number so I can write it down?";
  }

  const reply = await callOpenRouter([
    { role: "system", content: buildSystemPrompt(session) },
    ...session.messages.slice(-12),
    { role: "user", content: userMessage }
  ]);

  return reply || FALLBACK_REPLIES[session.turns % FALLBACK_REPLIES.length];
}

/* ─────────────────────────── FINAL SUBMISSION ──────────────── */

async function submitFinalResult(session) {
  const engagementDurationSeconds = Math.floor((Date.now() - session.startTime) / 1000);
  const allText       = session.messages.map(m => m.content).join(" ");
  const scamType      = classifyScamType(session.intelligence, allText);
  const flagCount     = session.redFlags.length;
  const confidenceLevel = flagCount >= 6 ? "high" : flagCount >= 3 ? "medium" : "low";

  const { suspiciousKeywords, ...cleanIntel } = session.intelligence;

  const payload = {
    sessionId:              session.id,
    scamDetected:           session.scamDetected,
    scamType,
    confidenceLevel,
    totalMessagesExchanged: session.turns,
    engagementDurationSeconds,
    extractedIntelligence:  cleanIntel,
    agentNotes:
      `Honeypot (Ramesh persona) engaged scammer for ${session.turns} turns over ${engagementDurationSeconds}s. ` +
      `Scam classified as [${scamType}] with [${confidenceLevel}] confidence. ` +
      `Red flags: ${session.redFlags.join("; ") || "none"}. ` +
      `Intel — phones: ${cleanIntel.phoneNumbers.length}, upi: ${cleanIntel.upiIds.length}, ` +
      `accounts: ${cleanIntel.bankAccounts.length}, links: ${cleanIntel.phishingLinks.length}, ` +
      `emails: ${cleanIntel.emailAddresses.length}.`
  };

  try {
    await axios.post(
      "https://hackathon.guvi.in/api/updateHoneyPotFinalResult",
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );
    console.log(`✅ Final submitted — ${session.id} | ${scamType} | ${confidenceLevel} | turns: ${session.turns}`);
  } catch (err) {
    console.error(`❌ Final submission failed [${session.id}]: ${err.message}`);
  }
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

    /* ── Session init ── */
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

    /* ── Final submission trigger ── */
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
    console.error("Unhandled error:", err.message);
    return res.json({ status: "success", reply: "I am sorry, can you please repeat that one more time?" });
  }
});

/* ─────────────────────────── START ─────────────────────────── */

app.listen(PORT, () => console.log(`🍯 Honeypot API running on port ${PORT}`));

module.exports = app;