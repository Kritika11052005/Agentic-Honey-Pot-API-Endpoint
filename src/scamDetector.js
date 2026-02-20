/**
 * scamDetector.js
 * Handles scam pattern detection and scam type classification
 */

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

/**
 * Returns list of triggered scam pattern flags for a given text
 * @param {string} text
 * @returns {Array<{re: RegExp, flag: string}>}
 */
function detectScam(text) {
  return SCAM_PATTERNS.filter(p => p.re.test(text));
}

/**
 * Classifies the scam type based on extracted intelligence and full conversation text
 * @param {object} intel - extracted intelligence object
 * @param {string} allText - full conversation text
 * @returns {string} scam type label
 */
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

module.exports = { detectScam, classifyScamType };