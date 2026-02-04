/**
 * Agentic Honey-Pot API Server - CORRECT FORMAT
 * Based on OFFICIAL Problem Statement
 * 
 * Expected Response:
 * {
 *   "status": "success",
 *   "reply": "Agent's response text here"
 * }
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory conversation storage
const conversations = new Map();

// ============================================
// MIDDLEWARE: API Key Authentication
// ============================================
const authenticateAPIKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  
  console.log('━'.repeat(50));
  console.log('🔑 API Key Authentication');
  console.log('━'.repeat(50));
  console.log('Received:', apiKey ? '✓' : '✗');
  
  if (!apiKey) {
    return res.status(401).json({
      status: "error",
      message: "Missing API key"
    });
  }

  const cleanKey = apiKey.replace(/^Bearer\s+/i, '').trim();
  const expectedKey = (process.env.API_KEY || '').trim();
  
  if (cleanKey !== expectedKey) {
    return res.status(403).json({
      status: "error",
      message: "Invalid API key"
    });
  }

  console.log('✅ Authentication successful');
  console.log('━'.repeat(50));
  next();
};

// ============================================
// SCAM DETECTION ENGINE
// ============================================
class ScamDetector {
  static scamPatterns = [
    /\b(urgent|immediately|act now|limited time|expires|deadline)\b/i,
    /\b(verify|confirm|update|validate).*(account|payment|card|kyc|details|information)\b/i,
    /\b(account|payment|card).*(suspended|blocked|locked|frozen|restricted)\b/i,
    /\b(won|winner|prize|lottery|reward|congratulations|selected)\b/i,
    /\b(send|transfer|pay|deposit).*(money|amount|rupees|rs|inr|usd)\b/i,
    /\b(bank|upi|paytm|phonepe|gpay|account number)\b/i,
    /\b(click here|link|website|portal|tap here)\b/i,
    /(http|https):\/\/[^\s]+/i,
    /\b(bank|government|tax|income tax|customs|police|court)\b/i,
    /\b(officer|department|authority|official)\b/i,
    /\b(otp|password|pin|cvv|card number|expiry|aadhar|pan)\b/i,
    /\b(legal action|arrest|warrant|fine|penalty|court case)\b/i
  ];

  static detect(message) {
    let scamScore = 0;
    for (const pattern of this.scamPatterns) {
      if (pattern.test(message)) scamScore++;
    }
    
    const isScam = scamScore >= 2;
    const confidence = Math.min((scamScore / 5) * 100, 100);

    return { isScam, confidence: Math.round(confidence), scamScore };
  }
}

// ============================================
// INTELLIGENCE EXTRACTION ENGINE
// ============================================
class IntelligenceExtractor {
  static patterns = {
    bankAccount: /\b\d{9,18}\b/g,
    upiId: /\b[\w\.\-]+@(paytm|ybl|oksbi|okhdfcbank|okicici|okaxis)\b/gi,
    phoneNumber: /\b[6-9]\d{9}\b/g,
    url: /(https?:\/\/[^\s]+)/g,
    keyword: /\b(urgent|verify|immediately|blocked|suspended|otp|account|bank)\b/gi
  };

  static extract(text) {
    if (typeof text !== 'string') text = String(text);
    return {
      bankAccounts: [...new Set((text.match(this.patterns.bankAccount) || []))],
      upiIds: [...new Set((text.match(this.patterns.upiId) || []))],
      phoneNumbers: [...new Set((text.match(this.patterns.phoneNumber) || []))],
      phishingLinks: [...new Set((text.match(this.patterns.url) || []))],
      suspiciousKeywords: [...new Set((text.match(this.patterns.keyword) || []).map(k => k.toLowerCase()))]
    };
  }
}

// ============================================
// AGENTIC AI HANDLER
// ============================================
class AgenticHandler {
  static async generateResponse(history, userMessage, scamContext) {
    try {
      const systemPrompt = `You are a honeypot AI engaging with scammers. Act as a naive, tech-unsavvy person who is concerned but willing to help. Extract bank accounts, UPI IDs, and phishing links by asking clarifying questions. NEVER reveal you know this is a scam. Keep responses under 60 words and natural.`;
      
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: process.env.AI_MODEL || 'anthropic/claude-3.5-sonnet',
          messages: messages,
          max_tokens: 120,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'Honeypot API'
          },
          timeout: 5000
        }
      );

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('AI Error:', error.message);
      const fallbacks = [
        "Oh no, this is concerning! What should I do? Can you help me understand what's happening?",
        "I'm worried about my account. Which bank is this for? What steps do I need to follow?",
        "This sounds urgent. Could you please send me the link or number where I should verify?",
        "I want to fix this. What information do you need from me to resolve this issue?",
        "I'm not very tech-savvy. Can you guide me through the verification process step by step?"
      ];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
  }
}

// ============================================
// CALLBACK TO GUVI PLATFORM
// ============================================
async function sendFinalResultToGUVI(sessionData) {
  try {
    const payload = {
      sessionId: sessionData.id,
      scamDetected: sessionData.scamDetected,
      totalMessagesExchanged: sessionData.metrics.turnCount,
      extractedIntelligence: {
        bankAccounts: sessionData.intelligence.bankAccounts,
        upiIds: sessionData.intelligence.upiIds,
        phishingLinks: sessionData.intelligence.phishingLinks,
        phoneNumbers: sessionData.intelligence.phoneNumbers,
        suspiciousKeywords: sessionData.intelligence.suspiciousKeywords
      },
      agentNotes: sessionData.agentNotes || "Scam engagement completed"
    };

    console.log('📤 Sending final result to GUVI platform...');
    
    const response = await axios.post(
      'https://hackathon.guvi.in/api/updateHoneyPotFinalResult',
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );

    console.log('✅ Final result sent to GUVI:', response.status);
    return true;
  } catch (error) {
    console.error('❌ Failed to send final result to GUVI:', error.message);
    return false;
  }
}

// ============================================
// API ROUTES
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: "success",
    message: "Honeypot API is healthy",
    version: "4.0.0"
  });
});

app.get('/', (req, res) => {
  res.json({
    status: "success",
    message: "Agentic Honey-Pot API",
    version: "4.0.0"
  });
});

// MAIN ENDPOINT - CORRECT FORMAT
app.post('/api/message', authenticateAPIKey, async (req, res) => {
  try {
    console.log('📥 Request:', JSON.stringify(req.body, null, 2));
    
    const { sessionId, message, conversationHistory, metadata } = req.body;

    // Extract message
    let userMessage, messageTimestamp;
    if (typeof message === 'object' && message !== null) {
      userMessage = message.text;
      messageTimestamp = message.timestamp;
    } else if (typeof message === 'string') {
      userMessage = message;
      messageTimestamp = Date.now();
    }

    // Validation
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid message field"
      });
    }

    // Generate session ID
    const convId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get or create conversation
    if (!conversations.has(convId)) {
      conversations.set(convId, {
        id: convId,
        startTime: Date.now(),
        messages: [],
        scamDetected: false,
        intelligence: {
          bankAccounts: [],
          upiIds: [],
          phoneNumbers: [],
          phishingLinks: [],
          suspiciousKeywords: []
        },
        metrics: { turnCount: 0, engagementDuration: 0 },
        agentNotes: ""
      });
    }

    const conv = conversations.get(convId);

    // Detect scam
    const detection = ScamDetector.detect(userMessage);
    if (detection.isScam && !conv.scamDetected) {
      conv.scamDetected = true;
      console.log('🚨 Scam detected! Confidence:', detection.confidence + '%');
    }

    // Extract intelligence
    const intel = IntelligenceExtractor.extract(userMessage);
    Object.keys(intel).forEach(key => {
      conv.intelligence[key] = [...new Set([...conv.intelligence[key], ...intel[key]])];
    });

    // Add user message
    conv.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: messageTimestamp || Date.now()
    });

    // Generate AI response
    let aiReply;
    if (conv.scamDetected) {
      console.log('🤖 Generating AI response...');
      aiReply = await AgenticHandler.generateResponse(
        conv.messages,
        userMessage,
        detection
      );
    } else {
      aiReply = "Hello! How can I help you?";
    }

    // Add AI response to conversation
    conv.messages.push({
      role: 'assistant',
      content: aiReply,
      timestamp: Date.now()
    });

    // Update metrics
    conv.metrics.turnCount++;
    conv.metrics.engagementDuration = Date.now() - conv.startTime;

    // Update agent notes
    if (conv.scamDetected) {
      conv.agentNotes = `Scam detected with ${detection.confidence}% confidence. Engaged for ${conv.metrics.turnCount} turns.`;
    }

    // Check if we should send final result to GUVI
    // Send after 5+ turns or if significant intelligence extracted
    const shouldSendFinal = conv.scamDetected && (
      conv.metrics.turnCount >= 5 ||
      conv.intelligence.bankAccounts.length > 0 ||
      conv.intelligence.upiIds.length > 0 ||
      conv.intelligence.phishingLinks.length > 0
    );

    if (shouldSendFinal && !conv.finalResultSent) {
      conv.finalResultSent = true;
      // Send asynchronously (don't wait for it)
      sendFinalResultToGUVI(conv).catch(err => 
        console.error('Background GUVI callback failed:', err)
      );
    }

    console.log('✅ Response sent');
    console.log('📊 Turn:', conv.metrics.turnCount);
    console.log('📤 Sending response:', JSON.stringify({ status: "success", reply: aiReply }));
    // RETURN CORRECT FORMAT
    res.json({
      status: "success",
      reply: aiReply
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('━'.repeat(50));
  console.log('🍯 Agentic Honey-Pot API v4.0 (CORRECT FORMAT)');
  console.log('━'.repeat(50));
  console.log(`✅ Server: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${process.env.API_KEY ? '✓' : '✗'}`);
  console.log(`🤖 OpenRouter: ${process.env.OPENROUTER_API_KEY ? '✓' : '✗'}`);
  console.log('━'.repeat(50));
  console.log('Response Format: { status: "success", reply: "..." }');
  console.log('━'.repeat(50));
});

module.exports = app;