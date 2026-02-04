/**
 * Agentic Honey-Pot API Server - GUVI SAFE FINAL VERSION
 * Response format (STRICT):
 * {
 *   "status": "success",
 *   "reply": "..."
 * }
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

/* ───────────────────────── Middleware ───────────────────────── */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ───────────────────────── In-memory store ───────────────────────── */

const conversations = new Map();

/* ───────────────────────── API KEY AUTH ───────────────────────── */

const authenticateAPIKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey.trim() !== process.env.API_KEY) {
    return res.status(403).json({ status: "error", message: "Invalid API key" });
  }
  next();
};

/* ───────────────────────── Scam Detection ───────────────────────── */

class ScamDetector {
  static patterns = [
    /\b(urgent|immediately|blocked|verify|suspended|otp|account|bank)\b/i,
    /\b(click|link|http|https)\b/i,
    /\b(upi|paytm|gpay|phonepe|account number)\b/i
  ];

  static detect(text) {
    let score = 0;
    for (const p of this.patterns) if (p.test(text)) score++;
    return { isScam: score >= 2, confidence: score / this.patterns.length };
  }
}

/* ───────────────────────── Intelligence Extraction ───────────────────────── */

class IntelligenceExtractor {
  static extract(text) {
    return {
      bankAccounts: text.match(/\b\d{9,18}\b/g) || [],
      upiIds: text.match(/\b[\w.-]+@[\w]+\b/g) || [],
      phoneNumbers: text.match(/\b[6-9]\d{9}\b/g) || [],
      phishingLinks: text.match(/https?:\/\/[^\s]+/g) || [],
      suspiciousKeywords: text.match(/\b(urgent|verify|blocked|otp|account)\b/gi) || []
    };
  }
}

/* ───────────────────────── AI Handler ───────────────────────── */

class AgenticHandler {
  static async respond(history, message) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "anthropic/claude-3.5-sonnet",
          messages: [
            {
              role: "system",
              content:
                "You are a naive human responding to a possible scam. Ask simple questions. Never reveal suspicion."
            },
            ...history.map(m => ({
              role: m.role === "user" ? "user" : "assistant",
              content: m.content
            })),
            { role: "user", content: message }
          ],
          max_tokens: 80
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
          },
          timeout: 5000
        }
      );

      return response.data.choices[0].message.content.trim();
    } catch {
      return "Why is my account being blocked?";
    }
  }
}

/* ───────────────────────── GUVI CALLBACK ───────────────────────── */

async function sendFinalResult(session) {
  try {
    await axios.post(
      "https://hackathon.guvi.in/api/updateHoneyPotFinalResult",
      {
        sessionId: session.id,
        scamDetected: true,
        totalMessagesExchanged: session.turns,
        extractedIntelligence: session.intelligence,
        agentNotes: "Scam engagement completed"
      },
      { timeout: 5000 }
    );
  } catch (e) {
    console.error("GUVI callback failed");
  }
}

/* ───────────────────────── ROUTES ───────────────────────── */

/* Health */
app.get("/", (_, res) =>
  res.json({ status: "success", reply: "Agentic Honey-Pot API" })
);

/* MAIN ENDPOINT */
app.post("/api/message", authenticateAPIKey, async (req, res) => {
  /* ✅ ALLOW EMPTY BODY (TESTER UI) */
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.json({ status: "success", reply: "Hello" });
  }

  const { sessionId, message } = req.body;
  const userText = message?.text;

  if (!userText) {
    return res.json({ status: "success", reply: "Hello" });
  }

  /* Session */
  const id = sessionId || `sess_${Date.now()}`;
  if (!conversations.has(id)) {
    conversations.set(id, {
      id,
      messages: [],
      intelligence: {
        bankAccounts: [],
        upiIds: [],
        phoneNumbers: [],
        phishingLinks: [],
        suspiciousKeywords: []
      },
      turns: 0,
      scamDetected: false,
      finalSent: false
    });
  }

  const session = conversations.get(id);

  /* Detect scam */
  const detection = ScamDetector.detect(userText);
  if (detection.isScam) session.scamDetected = true;

  /* Extract intelligence */
  const intel = IntelligenceExtractor.extract(userText);
  Object.keys(intel).forEach(k => {
    session.intelligence[k] = [...new Set([...session.intelligence[k], ...intel[k]])];
  });

  session.messages.push({ role: "user", content: userText });
  session.turns++;

  /* ⚡ FIRST TURN = NO LLM (FAST) */
  let reply;
  if (session.turns === 1) {
    reply = "Why is my account being blocked?";
  } else {
    reply = await AgenticHandler.respond(session.messages, userText);
  }

  session.messages.push({ role: "assistant", content: reply });

  /* Final callback */
  if (
    session.scamDetected &&
    !session.finalSent &&
    (session.turns >= 5 ||
      session.intelligence.upiIds.length ||
      session.intelligence.bankAccounts.length)
  ) {
    session.finalSent = true;
    sendFinalResult(session);
  }

  /* ✅ STRICT RESPONSE FORMAT */
  return res.json({
    status: "success",
    reply
  });
});

/* ───────────────────────── START ───────────────────────── */

app.listen(PORT, () => {
  console.log("🍯 Agentic Honey-Pot API running on port", PORT);
});

module.exports = app;
