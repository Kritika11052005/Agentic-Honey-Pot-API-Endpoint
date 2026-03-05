/**
 * agentReply.js
 * Handles LLM-powered honeypot agent responses using Google Gemini API
 * with retry logic, deadline-aware timeouts, and fallback replies
 */

const axios = require("axios");

// 25s total budget per request (evaluator hard limit is 30s, keeping 5s buffer)
const REQUEST_BUDGET_MS = 25000;

// Gemini API endpoint
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

// Rotating question strategies — ensures 5+ investigative questions across turns
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

// Fallback replies used when LLM call fails — all end with a question to keep engagement
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

/**
 * Builds the system prompt for the Sarthak honeypot persona
 * @param {object} session
 * @returns {string}
 */
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

  return `You are Sarthak, a naive and slightly forgetful 68-year-old retired government employee from Chennai.
Someone called you claiming there is an urgent problem with your bank account, package, or insurance.
You do NOT know they are a scammer. You are worried, cooperative, and a bit slow.

YOUR GOAL: Keep this caller engaged as long as possible and extract as much information as you can.

INTELLIGENCE STATUS (what still needs to be extracted):
${intelStatus}

RED FLAGS NOTED SO FAR: ${redFlagList}

THIS TURN's STRATEGY: ${strategy}

STRICT RULES:
- Stay fully in character as Sarthak at all times
- NEVER reveal you are a bot, honeypot, or suspicious
- NEVER refuse to engage — always end with a follow-up question
- Keep reply to 2-3 short sentences only
- If they share a number, link, ID, or email — acknowledge it and ask one more clarifying question
- Sound slow and slightly hard of hearing, ask them to repeat or spell things
- Use natural Indian English: "I am having confusion", "kindly tell me", "my son is asking"
- Do NOT use markdown formatting in your reply`;
}

/**
 * Converts chat message history to Gemini contents format
 * @param {string} systemPrompt
 * @param {Array} messages - [{role, content}]
 * @param {string} userMessage - latest message
 * @returns {Array} Gemini contents array
 */
function buildGeminiContents(systemPrompt, messages, userMessage) {
  const contents = [];

  // Gemini doesn't support system role directly — prepend to first user message
  const history = messages.slice(-10); // last 10 messages for context

  for (let idx = 0; idx < history.length; idx++) {
    const msg = history[idx];
    const role = msg.role === "assistant" ? "model" : "user";
    // Prepend system prompt to very first user message
    const text = (idx === 0 && role === "user")
      ? `${systemPrompt}\n\n---\n\n${msg.content}`
      : msg.content;
    contents.push({ role, parts: [{ text }] });
  }

  // If no history yet, attach system prompt to current message
  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [{ text: `${systemPrompt}\n\n---\n\n${userMessage}` }]
    });
  } else {
    contents.push({ role: "user", parts: [{ text: userMessage }] });
  }

  return contents;
}

/**
 * Calls Google Gemini API with deadline-aware retry and exponential backoff
 * @param {string} systemPrompt
 * @param {Array} messages
 * @param {string} userMessage
 * @param {number} attempt
 * @param {number|null} deadline
 * @returns {string|null}
 */
async function callGemini(systemPrompt, messages, userMessage, attempt = 1, deadline = null) {
  if (!deadline) deadline = Date.now() + REQUEST_BUDGET_MS;

  const remaining = deadline - Date.now();
  if (remaining < 1500) return null;

  const timeout = Math.min(remaining - 500, 10000);

  try {
    const contents = buildGeminiContents(systemPrompt, messages, userMessage);

    const response = await axios.post(
      `${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents,
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.75
        }
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout
      }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;

  } catch (err) {
    const isTimeout   = err.code === "ECONNABORTED" || err.message?.includes("timeout");
    const isRetryable = isTimeout || (err.response?.status >= 500);

    if (isRetryable && attempt < 3 && (deadline - Date.now()) > 2000) {
      const delay = attempt * 800;
      console.warn(`⚠️ Gemini attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return callGemini(systemPrompt, messages, userMessage, attempt + 1, deadline);
    }

    console.error(`❌ Gemini failed after ${attempt} attempt(s): ${err.message}`);
    return null;
  }
}

/**
 * Generates the honeypot agent reply for the current turn
 * @param {object} session
 * @param {string} userMessage
 * @returns {string}
 */
async function generateAgentReply(session, userMessage) {
  // Turn 1 always uses a fixed opener — saves time, ensures quality
  if (session.turns === 1 && (!body.conversationHistory || body.conversationHistory.length === 0)) {
    return "Oh my god, is it really blocked? I am very worried. Before anything else, can you please tell me your name and your employee ID number so I can write it down?";
  }

  const systemPrompt = buildSystemPrompt(session);
  const reply = await callGemini(systemPrompt, session.messages.slice(-12), userMessage);

  return reply || FALLBACK_REPLIES[session.turns % FALLBACK_REPLIES.length];
}

module.exports = { generateAgentReply };