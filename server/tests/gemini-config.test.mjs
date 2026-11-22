import assert from 'node:assert/strict';
import { isGeminiConfigured } from '../dist/config/gemini.js';

assert.equal(isGeminiConfigured(true, 'AQ.some-key-format'), true);
assert.equal(isGeminiConfigured(true, '  '), false);
assert.equal(isGeminiConfigured(false, 'AIzaSy.some-key-format'), false);
assert.equal(isGeminiConfigured(true, 'mock_test-key'), false);

console.log('Gemini configuration tests passed.');
