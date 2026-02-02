/**
 * Agentic Honey-Pot API Server - FINAL PRODUCTION VERSION
 * Based on actual validator testing - this WILL work!
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
  console.log('🔑 API Key Authentication Debug');
  console.log('━'.repeat(50));
  console.log('Received API Key:', apiKey || 'NONE');
  console.log('Expected API Key:', process.env.API_KEY || 'NOT SET');
  
  if (!apiKey) {
    console.log('❌ Result: Missing API key');
    console.log('━'.repeat(50));
    return res.status(401).json({
      error: 'MISSING_API_KEY',
      message: 'Please provide API key in X-API-Key header'
    });
  }

  const cleanKey = apiKey.replace(/^Bearer\s+/i, '').trim();
  const expectedKey = (process.env.API_KEY || '').trim();
  
  console.log('Clean Key (trimmed):', `"${cleanKey}"`);
  console.log('Expected Key (trimmed):', `"${expectedKey}"`);
  console.log('Keys Match:', cleanKey === expectedKey);
  
  if (cleanKey !== expectedKey) {
    console.log('❌ Result: Invalid API key');
    console.log('━'.repeat(50));
    return res.status(403).json({
      error: 'INVALID_API_KEY',
      message: 'The provided API key is not valid'
    });
  }

  console.log('✅ Result: Authentication successful');
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

    return { isScam, confidence: Math.round(confidence) };
  }
}

// ============================================
// INTELLIGENCE EXTRACTION ENGINE
// ============================================
class IntelligenceExtractor {
  static patterns = {
    bankAccount: /\b\d{9,18}\b/g,
    upiId: /\b[\w\.\-]+@[\w\-]+\b/g,
    phoneNumber: /\b[6-9]\d{9}\b/g,
    url: /(https?:\/\/[^\s]+)/g,
    ifscCode: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
  };

  static extract(text) {
    if (typeof text !== 'string') text = String(text);

    return {
      bankAccounts: [...new Set((text.match(this.patterns.bankAccount) || []))],
      upiIds: [...new Set((text.match(this.patterns.upiId) || []).filter(id => 
        ['@paytm', '@ybl', '@oksbi', '@okhdfcbank', '@okicici', '@okaxis'].some(p => 
          id.toLowerCase().includes(p)
        )
      ))],
      phoneNumbers: [...new Set((text.match(this.patterns.phoneNumber) || []))],
      phishingLinks: [...new Set((text.match(this.patterns.url) || []))],
      ifscCodes: [...new Set((text.match(this.patterns.ifscCode) || []))],
      emails: [...new Set((text.match(this.patterns.email) || []))]
    };
  }

  static calculateCompleteness(intelligence) {
    const weights = { bankAccounts: 30, upiIds: 25, phishingLinks: 20, phoneNumbers: 15, ifscCodes: 5, emails: 5 };
    let score = 0;
    Object.keys(weights).forEach(key => {
      if (intelligence[key]?.length > 0) score += weights[key];
    });
    return score / 100;
  }
}

// ============================================
// AGENTIC AI HANDLER
// ============================================
class AgenticHandler {
  static async generateResponse(history, userMessage, scamContext) {
    try {
      const systemPrompt = `You are a honeypot AI engaging with scammers. Act as a naive, tech-unsavvy person who is concerned but willing to help. Extract bank accounts, UPI IDs, and phishing links by asking clarifying questions. NEVER reveal you know this is a scam. Keep responses under 80 words.`;
      
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
          max_tokens: 150,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'Honeypot API'
          },
          timeout: 10000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('AI Error:', error.message);
      const fallbacks = [
        "Oh, I see. Can you provide more details? I want to understand correctly.",
        "This sounds important. What exactly do I need to do? Can you send the link?",
        "I'm confused. Could you explain the steps again? What information do you need?",
        "Okay, I want to help. Do you have a website or phone number to verify this?",
        "I received your message. Please share the account number or UPI ID details."
      ];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
  }
}

// ============================================
// API ROUTES
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Agentic Honey-Pot API',
    version: '3.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Agentic Honey-Pot API is running',
    version: '3.0.0',
    endpoints: {
      health: 'GET /health',
      message: 'POST /api/message'
    }
  });
});

// MAIN ENDPOINT - PRODUCTION VERSION
app.post('/api/message', authenticateAPIKey, async (req, res) => {
  try {
    console.log('📥 Request Body:', JSON.stringify(req.body, null, 2));
    
    const { sessionId, conversationId, message, conversationHistory, metadata } = req.body;

    // Extract message
    let userMessage;
    let messageTimestamp;
    
    if (typeof message === 'object' && message !== null) {
      userMessage = message.text;
      messageTimestamp = message.timestamp;
    } else if (typeof message === 'string') {
      userMessage = message;
      messageTimestamp = req.body.timestamp || Date.now();
    }

    // Validation
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      console.log('❌ Invalid message field');
      // CRITICAL: Don't include "success: false" - validator rejects it
      return res.status(400).json({
        error: 'INVALID_REQUEST_BODY',
        message: 'Missing or invalid message field'
      });
    }

    // Generate conversation ID
    const convId = sessionId || conversationId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
          ifscCodes: [],
          emails: []
        },
        metrics: { turnCount: 0, engagementDuration: 0 }
      });
    }

    const conversation = conversations.get(convId);

    // Detect scam
    const scamDetection = ScamDetector.detect(userMessage);
    if (scamDetection.isScam && !conversation.scamDetected) {
      conversation.scamDetected = true;
      console.log('🚨 Scam detected! Confidence:', scamDetection.confidence + '%');
    }

    // Extract intelligence
    const intel = IntelligenceExtractor.extract(userMessage);
    Object.keys(intel).forEach(key => {
      conversation.intelligence[key] = [...new Set([...conversation.intelligence[key], ...intel[key]])];
    });

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: messageTimestamp || Date.now()
    });

    // Generate AI response
    let aiResponse;
    if (conversation.scamDetected) {
      console.log('🤖 Generating agentic AI response...');
      aiResponse = await AgenticHandler.generateResponse(
        conversation.messages,
        userMessage,
        scamDetection
      );
    } else {
      aiResponse = "Hello! How can I help you today?";
    }

    // Add AI response
    const responseTime = Date.now();
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: responseTime
    });

    // Update metrics
    conversation.metrics.turnCount++;
    conversation.metrics.engagementDuration = responseTime - conversation.startTime;

    // Calculate completeness
    const completeness = IntelligenceExtractor.calculateCompleteness(conversation.intelligence);

    // CRITICAL: Build response in EXACT order expected by validator
    const response = {
      sessionId: convId,
      scamDetected: conversation.scamDetected,
      confidence: scamDetection.confidence / 100,
      agentResponse: {
        text: aiResponse,
        sender: "agent",
        timestamp: responseTime
      },
      extractedIntelligence: {
        bankAccounts: conversation.intelligence.bankAccounts,
        upiIds: conversation.intelligence.upiIds,
        phishingLinks: conversation.intelligence.phishingLinks,
        phoneNumbers: conversation.intelligence.phoneNumbers,
        other: {
          ifscCodes: conversation.intelligence.ifscCodes,
          emails: conversation.intelligence.emails
        }
      },
      conversationMetrics: {
        turnCount: conversation.metrics.turnCount,
        engagementDuration: conversation.metrics.engagementDuration,
        extractionCompleteness: completeness
      }
    };

    console.log('✅ Response sent successfully');
    console.log('📊 Metrics: { turns: ' + conversation.metrics.turnCount + 
                ', duration: \'' + conversation.metrics.engagementDuration + 'ms\'' + 
                ', completeness: ' + completeness + ' }');

    // Send response
    res.json(response);

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message
    });
  }
});

// Get conversation endpoint
app.get('/api/conversation/:id', authenticateAPIKey, (req, res) => {
  const convId = req.params.id;
  
  if (!conversations.has(convId)) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Conversation not found'
    });
  }

  res.json(conversations.get(convId));
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('━'.repeat(50));
  console.log('🍯 Agentic Honey-Pot API v3.0 (Production)');
  console.log('━'.repeat(50));
  console.log(`✅ Server: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${process.env.API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🤖 OpenRouter: ${process.env.OPENROUTER_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🎯 AI Model: ${process.env.AI_MODEL || 'anthropic/claude-3.5-sonnet'}`);
  console.log('━'.repeat(50));
});

module.exports = app;