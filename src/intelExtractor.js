/**
 * intelExtractor.js
 * Handles extraction and merging of scammer intelligence from messages
 */

/**
 * Returns an empty intelligence object with all fields initialized
 * @returns {object}
 */
function emptyIntel() {
  return {
    bankAccounts:       [],
    upiIds:             [],
    phoneNumbers:       [],
    phishingLinks:      [],
    emailAddresses:     [],
    caseIds:            [],
    policyNumbers:      [],
    orderNumbers:       [],
    suspiciousKeywords: []
  };
}

/**
 * Extracts all intelligence fields from a given text string
 * @param {string} text
 * @returns {object} extracted intelligence
 */
function extractIntel(text) {
  if (!text || typeof text !== "string") return emptyIntel();

  // Extract emails first (more specific — has TLD) to avoid UPI collision
  const emailAddresses = (text.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g) || []);

  // UPI IDs: handle@bankname (no TLD) — exclude anything already captured as email
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

/**
 * Merges incoming intel into base intel object (deduplicates all arrays)
 * @param {object} base - existing intel object (mutated in place)
 * @param {object} incoming - new intel to merge in
 */
function mergeIntel(base, incoming) {
  Object.keys(base).forEach(k => {
    base[k] = [...new Set([...base[k], ...(incoming[k] || [])])];
  });
}

module.exports = { emptyIntel, extractIntel, mergeIntel };