# 🍯 Agentic Honey-Pot API

![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?style=for-the-badge&logo=express&logoColor=white)
![Gemini](https://img.shields.io/badge/Google_Gemini-2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)

AI-powered honeypot system for detecting and engaging with scammers using advanced pattern recognition and an autonomous AI agent persona.

---

## 🎯 Project Overview

**Agentic Honey-Pot API** is an intelligent scam detection and engagement system built for the **HCL GUVI India Impact AI Buildathon**. It autonomously detects scam attempts, engages with scammers using a convincing AI-powered victim persona ("Sarthak"), and extracts critical intelligence for law enforcement.

### Key Features

- 🔍 **Real-time Scam Detection** — 12-pattern regex engine with scam type classification
- 🤖 **Agentic AI Engagement** — Powered by Google Gemini 2.5 Flash with rotating interrogation strategies
- 📊 **Intelligence Extraction** — Captures UPI IDs, phone numbers, bank accounts, phishing URLs, emails, case IDs, policy numbers, and order numbers
- 💬 **Multi-turn Conversation** — Session-based tracking with full conversation history
- 🔐 **Secure API** — API key authentication via `x-api-key` header
- ⚡ **Deadline-Aware** — 25s request budget with retry logic and fallback replies to stay within the 30s evaluator limit

---

## 🚀 Tech Stack

- **Runtime**: Node.js 18.x
- **Framework**: Express.js 4.x
- **AI Provider**: Google Gemini 2.5 Flash (`gemini-2.5-flash`)
- **Authentication**: API Key-based (`x-api-key` header)
- **Deployment**: Render.com

---

## 🏗️ Project Structure

```
honeypot-api/
├── server.js               # Entry point — Express app, routing, session management
├── src/
│   ├── agentReply.js       # Gemini LLM integration, Sarthak persona, fallback replies
│   ├── scamDetector.js     # 12-pattern scam detection + scam type classifier
│   ├── intelExtractor.js   # Regex-based intelligence extraction & merging
│   └── finalSubmit.js      # Posts final result to GUVI evaluation endpoint
├── .env                    # Environment variables (never commit)
├── .env.example            # Template for required environment variables
├── package.json
└── README.md
```

---

## 📡 API Endpoints

### Root
```http
GET /
```
Returns a basic status response. No authentication required.

**Response:**
```json
{
  "status": "success",
  "reply": "Agentic Honey-Pot API"
}
```

### Message Processing
```http
POST /api/message
```

**Headers:**
```
Content-Type: application/json
x-api-key: YOUR_API_KEY
```

**Request Body:**
```json
{
  "sessionId": "uuid-v4-string",
  "message": {
    "sender": "scammer",
    "text": "URGENT: Your SBI account has been compromised. Share your OTP immediately.",
    "timestamp": "2025-02-11T10:30:00Z"
  },
  "conversationHistory": [
    {
      "sender": "scammer",
      "text": "Previous scammer message...",
      "timestamp": "1707645000000"
    },
    {
      "sender": "user",
      "text": "Previous honeypot response...",
      "timestamp": "1707645005000"
    }
  ],
  "metadata": {
    "channel": "SMS",
    "language": "English",
    "locale": "IN"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "reply": "Oh my god, is it really blocked? I am very worried. Before anything else, can you please tell me your name and your employee ID number so I can write it down?"
}
```

---

## 🧠 How It Works

### 1. Scam Detection Engine (`scamDetector.js`)

Detects scams using 12 regex patterns covering:

| Pattern | Flag |
|---|---|
| urgent / act fast / emergency | Urgency language |
| OTP / PIN / verification code | OTP/PIN request |
| blocked / suspended / compromised | Account threat |
| UPI / GPay / Paytm / NEFT | Payment platform |
| click here / http / links | Suspicious link |
| KYC / Aadhar / update details | KYC scam |
| prize / cashback / lottery | Reward lure |
| SBI / HDFC / RBI / IRDAI | Impersonation |
| account number / CVV / card | Financial data request |
| fee / advance / processing | Advance fee fraud |
| fraud department / cyber cell | Authority impersonation |
| package / courier / customs | Parcel scam |

Every incoming message and conversation history entry is scanned. Red flags are deduplicated and accumulated across the session.

### 2. Intelligence Extraction (`intelExtractor.js`)

Extracts the following from every message:

| Field | Extraction Method |
|---|---|
| `phoneNumbers` | `+91` or 10-digit Indian mobile regex |
| `upiIds` | `handle@provider` (no TLD, excludes emails) |
| `bankAccounts` | 9–18 digit numbers |
| `phishingLinks` | `http(s)://` URLs |
| `emailAddresses` | Standard email regex (with TLD) |
| `caseIds` | Prefixes: case, ref, SR, ticket, CRN, URN |
| `policyNumbers` | Prefixes: policy, pol no |
| `orderNumbers` | Prefixes: order, txn, transaction, ref |

All fields are merged and deduplicated across turns using `mergeIntel()`. Metadata from each request is also scanned.

### 3. Agentic AI Engagement (`agentReply.js`)

The agent plays **Sarthak** — a naive, 68-year-old retired government employee from Chennai who doesn't know he's being scammed.

**Turn 1** always uses a fixed opener to save response time and ensure quality engagement.

From Turn 2 onward, a Gemini 2.5 Flash prompt is built with:
- Current intelligence status (what's been extracted vs. still missing)
- Accumulated red flags
- A **rotating interrogation strategy** (10 strategies cycling per turn) to extract more data
- Last 10–12 messages as conversation history

If Gemini fails or times out (up to 3 retries with exponential backoff within a 25s deadline), one of 10 **fallback replies** is returned — all designed to keep the scammer talking.

**Sample interrogation strategies:**
- Ask for full name and employee/badge ID
- Request supervisor name and landline for callback verification
- Ask for UPI ID or account number "to confirm the reversal"
- Request official email for written confirmation
- Express panic to draw out more details about the threat

### 4. Session Management (`server.js`)

Each session tracks:
- Full message history
- Turn count
- Scam detection state and red flag list
- Accumulated intelligence
- Whether the final result has been submitted

### 5. Final Submission (`finalSubmit.js`)

A final result is submitted automatically (fire-and-forget) to the GUVI evaluation endpoint when any of these conditions are met:

| Condition | Trigger |
|---|---|
| 9+ turns | Always submit |
| 5+ turns AND any intelligence extracted | Submit early if data found |
| 3+ turns AND 5+ red flags | Submit early if high-confidence scam |

The submitted payload includes:
```json
{
  "sessionId": "...",
  "scamDetected": true,
  "scamType": "bank_fraud",
  "confidenceLevel": "high",
  "totalMessagesExchanged": 7,
  "engagementDurationSeconds": 142,
  "extractedIntelligence": {
    "phoneNumbers": ["+91-9876543210"],
    "bankAccounts": [],
    "upiIds": ["scammer@fakebank"],
    "phishingLinks": [],
    "emailAddresses": [],
    "caseIds": ["SBI-12345"],
    "policyNumbers": [],
    "orderNumbers": []
  },
  "agentNotes": "Honeypot (Sarthak persona) engaged scammer for 7 turns over 142s. Scam classified as [bank_fraud] with [high] confidence. Red flags: Urgency language; OTP / PIN request; Account threat; Impersonation; Authority impersonation."
}
```

---

## 🛠️ Local Development Setup

### Prerequisites

- Node.js 18.x or higher
- npm
- Google Gemini API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/honeypot-api.git
   cd honeypot-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create `.env` file**
   ```env
   PORT=3000
   API_KEY=your_secure_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Test the API**
   ```bash
   curl http://localhost:3000/
   ```

---

## 🌐 Deployment on Render.com

### Environment Variables

Add these in the Render dashboard under your service's **Environment** tab:

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default: 3000) | Server port |
| `API_KEY` | **Yes** | Authentication key sent in `x-api-key` header |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key |

### Trust Proxy (Required on Render)

The app sets `app.set('trust proxy', 1)` to correctly identify client IPs behind Render's load balancer. This is required for `express-rate-limit` to function correctly.

### Build & Start Commands

| Setting | Value |
|---|---|
| Build Command | `npm install` |
| Start Command | `npm start` |

---

## 🧪 Testing

### Quick cURL Test
```bash
curl -X POST https://your-app.onrender.com/api/message \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-001",
    "message": {
      "sender": "scammer",
      "text": "URGENT: Your SBI account has been blocked. Share OTP immediately to restore access.",
      "timestamp": "2026-02-01T10:00:00Z"
    },
    "conversationHistory": [],
    "metadata": { "channel": "SMS", "language": "English", "locale": "IN" }
  }'
```

### PowerShell Test
```powershell
$headers = @{
    "x-api-key"    = "YOUR_API_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    sessionId = "test-session-001"
    message   = @{
        sender    = "scammer"
        text      = "Your SBI account has been blocked. Share OTP to restore access."
        timestamp = "2026-02-01T10:00:00Z"
    }
    conversationHistory = @()
    metadata = @{ channel = "SMS"; language = "English"; locale = "IN" }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "https://your-app.onrender.com/api/message" -Method Post -Headers $headers -Body $body | ConvertTo-Json -Depth 5
```

---

## 📊 Scoring Alignment

| Category | Max Points | How This API Scores |
|---|---|---|
| Scam Detection | 20 pts | Pattern engine detects all 12 scam types; `scamDetected: true` submitted in final output |
| Intelligence Extraction | 30 pts | Regex extraction covers phones, UPI, bank accounts, links, emails, case/policy/order IDs |
| Conversation Quality | 30 pts | Rotating strategies ensure 5+ investigative questions; red flags logged every turn |
| Engagement Quality | 10 pts | Session timer + message counter submitted; fallbacks keep scammer engaged |
| Response Structure | 10 pts | All required fields (`sessionId`, `scamDetected`, `extractedIntelligence`, `totalMessagesExchanged`, `engagementDurationSeconds`, `agentNotes`, `scamType`, `confidenceLevel`) present in final output |

---

## ⚠️ Rate Limiting

- **60 requests per minute** per IP on `/api/message`
- OPTIONS requests are skipped (CORS preflight)
- Returns `429` with a JSON error on limit exceeded

---

## 🔒 Security

- API key required on all `/api/message` requests
- Keys compared against `process.env.API_KEY`
- CORS open to all origins (suitable for hackathon evaluation)
- No sensitive data logged; only session IDs, scam types, and turn counts

---

## 📝 Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Server port |
| `API_KEY` | **Yes** | — | API authentication key |
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini API key |

---

## 📄 License

MIT License — free to use for educational purposes.

---

## 👩‍💻 Author

**Kritika Benjwal**  
HCL GUVI India Impact AI Buildathon 2026

---

## 🙏 Acknowledgments

- **Google Gemini** for powering the Sarthak persona
- **HCL & GUVI** for organizing the buildathon
- **Express.js** community for excellent documentation

---

Made with ❤️ for the HCL GUVI India Impact AI Buildathon 🏆
