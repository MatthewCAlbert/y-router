import express from 'express';
import cors from 'cors';
import { Env } from './env';
import { formatAnthropicToOpenAI } from './formatRequest';
import { streamOpenAIToAnthropic } from './streamResponse';
import { formatOpenAIToAnthropic } from './formatResponse';
import { indexHtml } from './indexHtml';
import { termsHtml } from './termsHtml';
import { privacyHtml } from './privacyHtml';
import { installSh } from './installSh';

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Environment configuration
const env: Env = {
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
};

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(indexHtml);
});

// Terms endpoint
app.get('/terms', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(termsHtml);
});

// Privacy endpoint
app.get('/privacy', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(privacyHtml);
});

// Install script endpoint
app.get('/install.sh', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(installSh);
});

// Main API endpoint - Anthropic to OpenAI translation
app.post('/v1/messages', async (req, res) => {
  try {
    const anthropicRequest = req.body;
    const openaiRequest = formatAnthropicToOpenAI(anthropicRequest);
    const bearerToken = req.headers['x-api-key'] as string;

    if (!bearerToken) {
      return res.status(401).json({ error: 'Missing x-api-key header' });
    }

    const baseUrl = env.OPENROUTER_BASE_URL;
    const openaiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(openaiRequest),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      return res.status(openaiResponse.status).send(errorText);
    }

    if (openaiRequest.stream) {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const anthropicStream = streamOpenAIToAnthropic(
        openaiResponse.body as ReadableStream,
        openaiRequest.model
      );

      // Convert ReadableStream to Node.js stream
      const reader = anthropicStream.getReader();
      
      const streamData = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } catch (error) {
          console.error('Streaming error:', error);
        } finally {
          res.end();
        }
      };

      streamData();
    } else {
      // Handle non-streaming response
      const openaiData = await openaiResponse.json();
      const anthropicResponse = formatOpenAIToAnthropic(openaiData, openaiRequest.model);
      res.setHeader('Content-Type', 'application/json');
      res.json(anthropicResponse);
    }
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).send('Not Found');
});

// Start server
app.listen(port, () => {
  console.log(`y-router server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`API endpoint: http://localhost:${port}/v1/messages`);
}); 