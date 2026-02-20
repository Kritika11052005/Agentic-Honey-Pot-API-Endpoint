/**
 * finalSubmit.js
 * Handles submission of final honeypot results to the GUVI evaluation endpoint
 */

const axios = require("axios");
const { classifyScamType } = require("./scamDetector");

const GUVI_FINAL_ENDPOINT = "https://hackathon.guvi.in/api/updateHoneyPotFinalResult";

/**
 * Submits the final honeypot session result to the GUVI evaluation system
 * Called non-blocking (fire-and-forget) after enough turns or intel is gathered
 * @param {object} session - completed session object
 */
async function submitFinalResult(session) {
  const engagementDurationSeconds = Math.floor((Date.now() - session.startTime) / 1000);
  const allText         = session.messages.map(m => m.content).join(" ");
  const scamType        = classifyScamType(session.intelligence, allText);
  const flagCount       = session.redFlags.length;
  const confidenceLevel = flagCount >= 6 ? "high" : flagCount >= 3 ? "medium" : "low";

  // Strip internal suspiciousKeywords — not a scored field in the evaluation
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
    await axios.post(GUVI_FINAL_ENDPOINT, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    });
    console.log(`✅ Final submitted — ${session.id} | ${scamType} | ${confidenceLevel} | turns: ${session.turns}`);
  } catch (err) {
    console.error(`❌ Final submission failed [${session.id}]: ${err.message}`);
  }
}

module.exports = { submitFinalResult };