/**
 * Agentic Honey-Pot API Server - OpenRouter Version
 * HCL GUVI India Impact AI Buildathon
 * 
 * This server:
 * 1. Receives messages from Mock Scammer API
 * 2. Detects scam intent
 * 3. Engages scammers autonomously using AI (via OpenRouter)
 * 4. Extracts intelligence (bank accounts, UPI IDs, phishing links)
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
  console.log('Clean Key Length:', cleanKey.length);
  console.log('Expected Key Length:', expectedKey.length);
  
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
      indicators: indicators.slice(0, 3) // Top 3 indicators
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
    // FIX: Convert to string if not already a string
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
      urls: [...new Set((text.match(this.patterns.url) || []))],
      ifscCodes: [...new Set((text.match(this.patterns.ifscCode) || []))],
      emails: [...new Set((text.match(this.patterns.email) || []))]
    };

    return intelligence;
  }
}

// ============================================
// AGENTIC AI HANDLER (OpenRouter Integration)
// ============================================
class AgenticHandler {
  static async generateResponse(conversationHistory, userMessage, scamContext) {
    try {
      // Build conversation context for AI
      const systemPrompt = this.buildSystemPrompt(scamContext);
      const messages = this.buildMessages(conversationHistory, userMessage, systemPrompt);

      // Call OpenRouter API (OpenAI-compatible format)
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: process.env.AI_MODEL || 'anthropic/claude-3.5-sonnet',
          messages: messages,
          max_tokens: parseInt(process.env.MAX_TOKENS) || 1000,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'Honeypot API'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      return aiResponse;

    } catch (error) {
      console.error('OpenRouter API Error:', error.response?.data || error.message);
      
      // Fallback response if API fails
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

SCAM CONTEXT:
Confidence: ${scamContext.confidence}%
Detected as: ${scamContext.isScam ? 'Likely Scam' : 'Unclear'}

IMPORTANT RULES:
- Keep responses under 100 words
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
    
    // Add conversation history
    for (const msg of history) {
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
      "Oh, I see. Can you please provide more details about this? I want to make sure I understand correctly.",
      "This sounds important. What exactly do I need to do? Can you send me the link or account details?",
      "I'm a bit confused. Could you explain the steps again? And what information do you need from me?",
      "Okay, I want to help. Do you have a website or phone number I can use to verify this?",
      "I received your message. Can you please share the account number or UPI ID where I should send this?"
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
    version: '1.0.0',
    aiProvider: 'OpenRouter',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint (no auth required for testing)
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Agentic Honey-Pot API is running',
    aiProvider: 'OpenRouter.ai',
    endpoints: {
      health: 'GET /health',
      message: 'POST /api/message (requires API key)'
    }
  });
});

// Main message handling endpoint
app.post('/api/message', authenticateAPIKey, async (req, res) => {
  try {
    console.log('📥 Request Body:', JSON.stringify(req.body, null, 2));
    
    const { sessionId, conversationId, message, conversationHistory, metadata } = req.body;

    // FIX: Handle nested message structure (message.text) or direct string
    let userMessage;
    let messageTimestamp;
    
    if (typeof message === 'object' && message !== null) {
      // Validator sends: { message: { text: "...", sender: "...", timestamp: ... } }
      userMessage = message.text;
      messageTimestamp = message.timestamp;
    } else if (typeof message === 'string') {
      // Direct string: { message: "..." }
      userMessage = message;
      messageTimestamp = req.body.timestamp;
    }

    // Validate
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      console.log('❌ Invalid message field:', typeof message, message);
      return res.status(400).json({
        success: false,
        error: 'Missing required field: message',
        message: 'The "message" field or "message.text" must be a non-empty string',
        received: {
          type: typeof message,
          value: message
        }
      });
    }

    // Generate conversation ID if not provided (use sessionId if available)
    const convId = sessionId || conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get or create conversation history
    if (!conversations.has(convId)) {
      conversations.set(convId, {
        id: convId,
        startTime: new Date().toISOString(),
        messages: [],
        scamDetected: false,
        intelligence: {
          bankAccounts: [],
          upiIds: [],
          phoneNumbers: [],
          urls: [],
          ifscCodes: [],
          emails: []
        },
        metrics: {
          totalTurns: 0,
          engagementDuration: 0
        }
      });
    }

    const conversation = conversations.get(convId);
    const startTime = Date.now();

    // Step 1: Detect scam intent
    const scamDetection = ScamDetector.detect(userMessage);
    
    if (scamDetection.isScam && !conversation.scamDetected) {
      conversation.scamDetected = true;
      conversation.scamDetectionTime = new Date().toISOString();
      console.log('🚨 Scam detected! Confidence:', scamDetection.confidence + '%');
    }

    // Step 2: Extract intelligence from message
    const extractedIntel = IntelligenceExtractor.extract(userMessage);
    
    // Merge new intelligence with existing
    Object.keys(extractedIntel).forEach(key => {
      conversation.intelligence[key] = [
        ...new Set([...conversation.intelligence[key], ...extractedIntel[key]])
      ];
    });

    // Step 3: Add user message to history
    conversation.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: messageTimestamp || new Date().toISOString()
    });

    // Step 4: Generate AI response
    let aiResponse;
    
    if (conversation.scamDetected) {
      // Use agentic AI handler
      console.log('🤖 Generating agentic AI response...');
      aiResponse = await AgenticHandler.generateResponse(
        conversation.messages,
        userMessage,
        scamDetection
      );
    } else {
      // Before scam detection, respond neutrally
      aiResponse = "Hello! How can I help you today?";
    }

    // Step 5: Add AI response to history
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    });

    // Step 6: Update metrics
    conversation.metrics.totalTurns++;
    const engagementTime = Date.now() - startTime;
    conversation.metrics.engagementDuration += engagementTime;

    // Step 7: Prepare response
    const response = {
      success: true,
      conversationId: convId,
      response: aiResponse,
      scamDetection: {
        detected: scamDetection.isScam,
        confidence: scamDetection.confidence,
        scamScore: scamDetection.scamScore
      },
      intelligence: conversation.intelligence,
      metrics: {
        totalTurns: conversation.metrics.totalTurns,
        engagementDuration: conversation.metrics.engagementDuration,
        averageResponseTime: Math.round(conversation.metrics.engagementDuration / conversation.metrics.totalTurns)
      },
      timestamp: new Date().toISOString()
    };

    console.log('✅ Response sent successfully');
    res.json(response);

  } catch (error) {
    console.error('❌ Error processing message:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
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

// Get all conversations (for debugging)
app.get('/api/conversations', authenticateAPIKey, (req, res) => {
  const allConversations = Array.from(conversations.values());
  
  res.json({
    success: true,
    count: allConversations.length,
    conversations: allConversations
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('━'.repeat(50));
  console.log('🍯 Agentic Honey-Pot API Server (OpenRouter)');
  console.log('━'.repeat(50));
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${process.env.API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🤖 OpenRouter API: ${process.env.OPENROUTER_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🎯 AI Model: ${process.env.AI_MODEL || 'anthropic/claude-3.5-sonnet'}`);
  console.log('━'.repeat(50));
  console.log('\nEndpoints:');
  console.log('  GET  /health');
  console.log('  POST /api/message');
  console.log('  GET  /api/conversation/:id');
  console.log('━'.repeat(50));
});

module.exports = app;