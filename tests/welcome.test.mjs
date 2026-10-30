import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Initial welcome message in App.tsx', () => {
  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  // Verify welcome message constant exists and matches required text
  assert.ok(
    appContent.includes("text: \"Hey! What's on your mind?\"") ||
    appContent.includes("text: 'Hey! What\\'s on your mind?'"),
    'Welcome message must be "Hey! What\'s on your mind?"'
  );

  // Verify it is configured with assistant sender
  assert.ok(
    appContent.includes("sender: 'assistant'") ||
    appContent.includes('sender: "assistant"'),
    'Welcome message must have assistant sender'
  );

  // Verify state is initialized with exactly this one message
  assert.ok(
    appContent.includes('useState<Message[]>([INITIAL_WELCOME_MESSAGE])'),
    'App must initialize messages with exactly the INITIAL_WELCOME_MESSAGE'
  );

  // Verify the initial welcome message is excluded from API conversation history
  assert.ok(
    appContent.includes("m.id !== 'msg-welcome-init'"),
    'Initial welcome message must be excluded from backend API payload'
  );
});

test('ChatArea does not display Gemini model badge in assistant bubble', () => {
  const chatAreaPath = path.resolve(process.cwd(), 'src/components/ChatArea.tsx');
  const chatAreaContent = fs.readFileSync(chatAreaPath, 'utf-8');

  // Verify model-badge is absent from message bubble
  assert.ok(!chatAreaContent.includes('model-badge'), 'model-badge must not be present in ChatArea.tsx');
  assert.ok(chatAreaContent.includes('OctoberAI'), 'OctoberAI branding label must be present');
});
