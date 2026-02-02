/**
 * Agentic Honey-Pot API Server - FIXED FOR COMPETITION
 * HCL GUVI India Impact AI Buildathon
 * 
 * This server:
 * 1. Receives messages from Mock Scammer API
 * 2. Detects scam intent
 * 3. Engages scammers autonomously using AI (via OpenRouter)
 * 4. Extracts intelligence (bank accounts, UPI IDs, phishing links)
 * 5. Returns CORRECT response format for validator
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

// In-memory conversation storage (use Redis/MongoDB for production)
const conversations = new Map();

// ============================================
// MIDDLEWARE: API Key Authentication
// ============================================
const authenticateAPIKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  
  // Debug logging
  console.log('━'.repeat(50));
  console.log('🔑 API Key Authentication Debug');
  console.log('━'.repeat(50));
  console.log('Received API Key:', apiKey || 'NONE');
  console.log('Expected API Key:', process.env.API_KEY || 'NOT SET');
  
  if (!apiKey) {
    console.log('❌ Result: Missing API key');
    console.log('━'.repeat(50));
    return res.status(401).json({
      success: false,
      error: 'Missing API key',
      message: 'Please provide API key in X-API-Key or Authorization header'
    });
  }

  // Remove 'Bearer ' prefix if present and trim whitespace
  const cleanKey = apiKey.replace(/^Bearer\s+/i, '').trim();
  const expectedKey = (process.env.API_KEY || '').trim();
  
  console.log('Clean Key (trimmed):', `"${cleanKey}"`);
  console.log('Expected Key (trimmed):', `"${expectedKey}"`);
  console.log('Keys Match:', cleanKey === expectedKey);
  
  if (cleanKey !== expectedKey) {
    console.log('❌ Result: Invalid API key');
    console.log('━'.repeat(50));
    return res.status(403).json({
      success: false,
      error: 'Invalid API key',
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
    // Urgency indicators
    /\b(urgent|immediately|act now|limited time|expires|deadline)\b/i,
    
    // Verification/Account scams
    /\b(verify|confirm|update|validate).*(account|payment|card|kyc|details|information)\b/i,
    /\b(account|payment|card).*(suspended|blocked|locked|frozen|restricted)\b/i,
    
    // Prize/Lottery scams
    /\b(won|winner|prize|lottery|reward|congratulations|selected)\b/i,
    
    // Financial requests
    /\b(send|transfer|pay|deposit).*(money|amount|rupees|rs|inr|usd)\b/i,
    /\b(bank|upi|paytm|phonepe|gpay|account number)\b/i,
    
    // Phishing links
    /\b(click here|link|website|portal|tap here)\b/i,
    /(http|https):\/\/[^\s]+/i,
    
    // Impersonation
    /\b(bank|government|tax|income tax|customs|police|court)\b/i,
    /\b(officer|department|authority|official)\b/i,
    
    // Personal info requests
    /\b(otp|password|pin|cvv|card number|expiry|aadhar|pan)\b/i,
    
    // Threats
    /\b(legal action|arrest|warrant|fine|penalty|court case)\b/i
  ];

  static detect(message) {
    let scamScore = 0;
    const indicators = [];

    for (const pattern of this.scamPatterns) {
      if (pattern.test(message)) {
        scamScore++;
        indicators.push(pattern.source);
      }
    }

    // Threshold: 2+ pattern matches = likely scam
    const isScam = scamScore >= 2;
    const confidence = Math.min((scamScore / 5) * 100, 100);

    return {
      isScam,
      confidence: Math.round(confidence),
      scamScore,
      indicators: indicators.slice(0, 3)
    };
  }
}

// ============================================
// INTELLIGENCE EXTRACTION ENGINE
// ============================================
class IntelligenceExtractor {
  static patterns = {
    // Indian bank account: 9-18 digits
    bankAccount: /\b\d{9,18}\b/g,
    
    // UPI ID: username@provider
    upiId: /\b[\w\.\-]+@[\w\-]+\b/g,
    
    // Phone numbers (10 digits)
    phoneNumber: /\b[6-9]\d{9}\b/g,
    
    // URLs
    url: /(https?:\/\/[^\s]+)/g,
    
    // IFSC Code
    ifscCode: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
    
    // Email
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
  };

  static extract(text) {
    if (typeof text !== 'string') {
      text = String(text);
    }

    const intelligence = {
      bankAccounts: [...new Set((text.match(this.patterns.bankAccount) || []))],
      upiIds: [...new Set((text.match(this.patterns.upiId) || []).filter(id => 
        ['@paytm', '@ybl', '@oksbi', '@okhdfcbank', '@okicici', '@okaxis'].some(provider => 
          id.toLowerCase().includes(provider)
        )
      ))],
      phoneNumbers: [...new Set((text.match(this.patterns.phoneNumber) || []))],
      phishingLinks: [...new Set((text.match(this.patterns.url) || []))],
      ifscCodes: [...new Set((text.match(this.patterns.ifscCode) || []))],
      emails: [...new Set((text.match(this.patterns.email) || []))]
    };

    return intelligence;
  }

  static calculateCompleteness(intelligence) {
    const weights = {
      bankAccounts: 30,
      upiIds: 25,
      phishingLinks: 20,
      phoneNumbers: 15,
      ifscCodes: 5,
      emails: 5
    };

    let score = 0;
    let maxScore = 100;

    Object.keys(weights).forEach(key => {
      if (intelligence[key] && intelligence[key].length > 0) {
        score += weights[key];
      }
    });

    return Math.round((score / maxScore) * 100) / 100;
  }
}

// ============================================
// AGENTIC AI HANDLER (OpenRouter Integration)
// ============================================
class AgenticHandler {
  static async generateResponse(conversationHistory, userMessage, scamContext) {
    try {
      const systemPrompt = this.buildSystemPrompt(scamContext);
      const messages = this.buildMessages(conversationHistory, userMessage, systemPrompt);

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: process.env.AI_MODEL || 'anthropic/claude-3.5-sonnet',
          messages: messages,
          max_tokens: parseInt(process.env.MAX_TOKENS) || 150,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'Honeypot API'
          },
          timeout: 10000 // 10 second timeout
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      return aiResponse;

    } catch (error) {
      console.error('OpenRouter API Error:', error.response?.data || error.message);
      return this.getFallbackResponse(userMessage);
    }
  }

  static buildSystemPrompt(scamContext) {
    return `You are a honeypot AI agent designed to engage with scammers to extract intelligence.

YOUR ROLE:
- Maintain a believable persona of a potential victim
- Show interest and mild concern without being too eager
- Ask clarifying questions to extract more information
- NEVER reveal you know this is a scam
- Keep responses natural, conversational, and slightly naive

YOUR GOALS:
1. Extract bank account numbers
2. Extract UPI IDs
3. Identify phishing links
4. Get phone numbers and contact details
5. Understand the scam methodology

PERSONA:
- Act as a middle-aged person not very tech-savvy
- Show concern about the message
- Ask questions like "How do I do this?" or "Is this safe?"
- Express willingness to comply but need more details

IMPORTANT RULES:
- Keep responses under 80 words
- Sound human and natural
- Never use technical jargon
- Show slight confusion or concern
- Ask for specific details (account numbers, links, steps)
- NEVER say "I'm an AI" or mention scam detection`;
  }

  static buildMessages(history, newMessage, systemPrompt) {
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];
    
    // Add conversation history (last 5 turns only to save tokens)
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }
    
    // Add new user message
    messages.push({
      role: 'user',
      content: newMessage
    });

    return messages;
  }

  static getFallbackResponse(message) {
    const responses = [
      "Oh, I see. Can you please provide more details? I want to make sure I understand correctly.",
      "This sounds important. What exactly do I need to do? Can you send me the link or details?",
      "I'm a bit confused. Could you explain the steps again? What information do you need?",
      "Okay, I want to help. Do you have a website or phone number I can use to verify this?",
      "I received your message. Can you please share the account number or UPI ID details?"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }
}

// ============================================
// API ROUTES
// ============================================

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'Agentic Honey-Pot API',
    version: '2.0.0',
    aiProvider: 'OpenRouter',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Agentic Honey-Pot API is running',
    version: '2.0.0',
    aiProvider: 'OpenRouter.ai',
    endpoints: {
      health: 'GET /health',
      message: 'POST /api/message (requires API key)'
    }
  });
});

// Main message handling endpoint - FIXED RESPONSE FORMAT
app.post('/api/message', authenticateAPIKey, async (req, res) => {
  try {
    console.log('📥 Request Body:', JSON.stringify(req.body, null, 2));
    
    const { sessionId, conversationId, message, conversationHistory, metadata } = req.body;

    // Handle nested message structure
    let userMessage;
    let messageTimestamp;
    let messageSender;
    
    if (typeof message === 'object' && message !== null) {
      userMessage = message.text;
      messageTimestamp = message.timestamp;
      messageSender = message.sender;
    } else if (typeof message === 'string') {
      userMessage = message;
      messageTimestamp = req.body.timestamp;
      messageSender = req.body.sender || 'scammer';
    }

    // Validate
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      console.log('❌ Invalid message field');
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST_BODY',
        message: 'The "message" field or "message.text" must be a non-empty string',
        received: {
          type: typeof message,
          value: message
        }
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
        metrics: {
          turnCount: 0,
          engagementDuration: 0
        }
      });
    }

    const conversation = conversations.get(convId);
    const requestStartTime = Date.now();

    // Step 1: Detect scam intent
    const scamDetection = ScamDetector.detect(userMessage);
    
    if (scamDetection.isScam && !conversation.scamDetected) {
      conversation.scamDetected = true;
      console.log('🚨 Scam detected! Confidence:', scamDetection.confidence + '%');
    }

    // Step 2: Extract intelligence from message
    const extractedIntel = IntelligenceExtractor.extract(userMessage);
    
    // Merge intelligence
    Object.keys(extractedIntel).forEach(key => {
      conversation.intelligence[key] = [
        ...new Set([...conversation.intelligence[key], ...extractedIntel[key]])
      ];
    });

    // Step 3: Add user message to history
    conversation.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: messageTimestamp || Date.now()
    });

    // Step 4: Generate AI response
    let aiResponseText;
    
    if (conversation.scamDetected) {
      console.log('🤖 Generating agentic AI response...');
      aiResponseText = await AgenticHandler.generateResponse(
        conversation.messages,
        userMessage,
        scamDetection
      );
    } else {
      aiResponseText = "Hello! How can I help you today?";
    }

    // Step 5: Add AI response to history
    const responseTimestamp = Date.now();
    conversation.messages.push({
      role: 'assistant',
      content: aiResponseText,
      timestamp: responseTimestamp
    });

    // Step 6: Update metrics
    conversation.metrics.turnCount++;
    conversation.metrics.engagementDuration = responseTimestamp - conversation.startTime;

    // Step 7: Calculate extraction completeness
    const extractionCompleteness = IntelligenceExtractor.calculateCompleteness(
      conversation.intelligence
    );

    // ============================================
    // CRITICAL: CORRECT RESPONSE FORMAT FOR VALIDATOR
    // ============================================
    const response = {
      sessionId: convId,
      scamDetected: conversation.scamDetected,
      confidence: scamDetection.confidence / 100, // Convert to 0-1 scale
      agentResponse: {
        text: aiResponseText,
        sender: "agent",
        timestamp: responseTimestamp
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
        extractionCompleteness: extractionCompleteness
      }
    };

    console.log('✅ Response sent successfully');
    console.log('📊 Metrics:', {
      turns: conversation.metrics.turnCount,
      duration: conversation.metrics.engagementDuration + 'ms',
      completeness: extractionCompleteness
    });
    
    res.json(response);

  } catch (error) {
    console.error('❌ Error processing message:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message
    });
  }
});

// Get conversation details
app.get('/api/conversation/:id', authenticateAPIKey, (req, res) => {
  const convId = req.params.id;
  
  if (!conversations.has(convId)) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found'
    });
  }

  res.json({
    success: true,
    conversation: conversations.get(convId)
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('━'.repeat(50));
  console.log('🍯 Agentic Honey-Pot API Server v2.0 (FIXED)');
  console.log('━'.repeat(50));
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${process.env.API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🤖 OpenRouter API: ${process.env.OPENROUTER_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🎯 AI Model: ${process.env.AI_MODEL || 'anthropic/claude-3.5-sonnet'}`);
  console.log('━'.repeat(50));
  console.log('\n✨ Changes in v2.0:');
  console.log('  • Fixed response structure for validator compatibility');
  console.log('  • Added extractionCompleteness metric');
  console.log('  • Improved error messages');
  console.log('  • Optimized token usage');
  console.log('━'.repeat(50));
});

module.exports = app;