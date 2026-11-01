import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('App.tsx explicit modality & immutable response policy', () => {
  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  // Verify handleSendMessage accepts modality: InputModality = 'text'
  assert.ok(
    appContent.includes("handleSendMessage = async (text: string, modality: InputModality = 'text')"),
    "handleSendMessage must accept explicit modality parameter defaulting to 'text'"
  );

  // Verify shouldSpeakResponse is captured explicitly at call time
  assert.ok(
    appContent.includes('const shouldSpeakResponse ='),
    'shouldSpeakResponse policy must be captured explicitly at submission time'
  );

  // Verify policy matches: modality === 'microphone' || (modality === 'text' && speakResponsesEnabled)
  assert.ok(
    appContent.includes("modality === 'microphone'") &&
    appContent.includes("modality === 'text' && speakResponsesEnabled"),
    'Response policy must follow Section C truth table'
  );

  // Verify onComplete invokes TTS only when shouldSpeakResponse is true
  assert.ok(
    appContent.includes('if (shouldSpeakResponse)'),
    'ttsService.speak must only be called if shouldSpeakResponse is true'
  );

  // Verify speak responses preference is persisted to localStorage
  assert.ok(
    appContent.includes('october_speak_responses_enabled'),
    'Speak responses preference must be persisted in localStorage'
  );

  // Verify mic toggle finalization submits through pipeline with 'microphone' modality
  assert.ok(
    appContent.includes("handleSendMessage(textToSubmit, 'microphone')"),
    "Deactivating mic must submit completed transcript with 'microphone' modality"
  );
});

test('ChatInput.tsx Live Voice Composer and Speak Responses toggle', () => {
  const chatInputPath = path.resolve(process.cwd(), 'src/components/ChatInput.tsx');
  const chatInputContent = fs.readFileSync(chatInputPath, 'utf-8');

  // Verify typed submission explicitly uses 'text' modality
  assert.ok(
    chatInputContent.includes("onSendMessage(trimmed, 'text')"),
    "ChatInput must pass 'text' modality when user submits typed message"
  );

  // Verify live voice composer updates inputText with voiceTranscript while listening
  assert.ok(
    chatInputContent.includes('isVoiceListening && voiceTranscript !== undefined') &&
    chatInputContent.includes('setInputText(voiceTranscript)'),
    'ChatInput must update composer inputText in real-time as voiceTranscript updates'
  );

  // Verify Speak responses toggle exists with proper accessibility and label
  assert.ok(
    chatInputContent.includes('speak-responses-btn'),
    'ChatInput must render speak-responses-btn toggle'
  );
  assert.ok(
    chatInputContent.includes('Speak responses to typed messages as well.'),
    'ChatInput must display description tooltip for Speak responses'
  );
  assert.ok(
    chatInputContent.includes('Speak replies'),
    'ChatInput must display "Speak replies" label'
  );
  assert.ok(
    chatInputContent.includes('dock-switch-track'),
    'ChatInput must render proper hardware-style switch track'
  );

  // Verify prominent Voice split control and Screen control in Command Dock
  assert.ok(
    chatInputContent.includes('command-dock'),
    'ChatInput must render command-dock toolbar'
  );
  assert.ok(
    chatInputContent.includes('dock-voice-control') && chatInputContent.includes('dock-voice-caret-btn'),
    'ChatInput must render unified dock-voice-control with integrated dropdown caret'
  );
  assert.ok(
    chatInputContent.includes('dock-screen-btn'),
    'ChatInput must render dock-screen-btn'
  );

  // Verify visible "Press ↵ to send" is removed from toolbar
  assert.ok(
    !chatInputContent.includes('Press ↵ to send'),
    '"Press ↵ to send" visible toolbar text must be removed to avoid congestion'
  );
});

test('audioCapture.ts anti-aliasing decimation and 16kHz context', () => {
  const audioPath = path.resolve(process.cwd(), 'src/services/audioCapture.ts');
  const audioContent = fs.readFileSync(audioPath, 'utf-8');

  // Verify 16kHz context request
  assert.ok(
    audioContent.includes('sampleRate: 16000'),
    'audioCapture must request native 16kHz sampleRate from AudioContext'
  );

  // Verify anti-aliasing moving-average decimation filter
  assert.ok(
    audioContent.includes('Anti-aliasing decimation') || audioContent.includes('sum / count'),
    'encodeWavBase64 must use anti-aliasing averaging rather than point decimation'
  );
});

test('speechSynthesis.ts voice ranking and markdown cleaning', () => {
  const synthPath = path.resolve(process.cwd(), 'src/services/speechSynthesis.ts');
  const synthContent = fs.readFileSync(synthPath, 'utf-8');

  // Verify male voices are heavily penalized
  assert.ok(synthContent.includes("score -= 1000"), 'Male voices must be penalized');
  assert.ok(synthContent.includes("'david'"), 'David must be included in penalized male names');
  assert.ok(synthContent.includes("'mark'"), 'Mark must be included in penalized male names');

  // Verify natural female voices are prioritized
  assert.ok(synthContent.includes("score += 100"), 'Natural female voices must receive high priority score');
  assert.ok(synthContent.includes("'zira'"), 'Zira must be included in preferred female names');
  assert.ok(synthContent.includes("'jenny'"), 'Jenny must be included in preferred female names');
  assert.ok(synthContent.includes("'aria'"), 'Aria must be included in preferred female names');

  // Verify cleanTextForSpeech removes markdown
  assert.ok(synthContent.includes('cleanTextForSpeech'), 'cleanTextForSpeech must be implemented');
  assert.ok(synthContent.includes('Code snippet omitted'), 'Code blocks must be stripped from speech output');
});

test('Native SpeechRecognizer binary execution and silence handling', () => {
  const exePath = path.resolve(process.cwd(), 'dist-electron/SpeechRecognizer.exe');
  assert.ok(fs.existsSync(exePath), 'dist-electron/SpeechRecognizer.exe must exist');

  // 1. Empty buffer returns clean error JSON
  const emptyChild = spawnSync(exePath, [], { input: Buffer.alloc(0) });
  assert.equal(emptyChild.status, 0);
  const emptyOutput = JSON.parse(emptyChild.stdout.toString('utf-8').trim());
  assert.equal(emptyOutput.success, false);

  // 2. Silent 16kHz WAV returns success: true, text: "" without crash or hallucinations
  const numSamples = 8000;
  const wavBuffer = Buffer.alloc(44 + numSamples * 2);
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + numSamples * 2, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20); // PCM
  wavBuffer.writeUInt16LE(1, 22); // Mono
  wavBuffer.writeUInt32LE(16000, 24); // 16kHz
  wavBuffer.writeUInt32LE(32000, 28); // byte rate
  wavBuffer.writeUInt16LE(2, 32); // block align
  wavBuffer.writeUInt16LE(16, 34); // 16-bit
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(numSamples * 2, 40);

  const silenceChild = spawnSync(exePath, [], { input: wavBuffer });
  assert.equal(silenceChild.status, 0);
  const silenceOutput = JSON.parse(silenceChild.stdout.toString('utf-8').trim());
  assert.equal(silenceOutput.success, true);
  assert.equal(silenceOutput.text, '');
});
