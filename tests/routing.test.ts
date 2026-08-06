import test from 'node:test';
import assert from 'node:assert/strict';
import { routeInboundMessage } from '../supabase/functions/_shared/whatsapp/routing.ts';

test('payment messages always hand off urgently', () => {
  const result = routeInboundMessage('The amount was deducted from my card');
  assert.equal(result.action, 'handoff');
  assert.equal(result.category, 'Payment issue');
  assert.equal(result.priority, 'urgent');
});

test('Arabic missing-item complaint goes to complaints', () => {
  const result = routeInboundMessage('الطلب وصل ناقص');
  assert.equal(result.action, 'handoff');
  assert.equal(result.teamKey, 'complaints');
});

test('food-safety concerns have highest priority', () => {
  const result = routeInboundMessage('I think this caused an allergy and we went to hospital');
  assert.equal(result.action, 'handoff');
  assert.equal(result.priority, 'urgent');
  assert.equal(result.category, 'Food safety');
});

test('explicit human request bypasses AI', () => {
  const result = routeInboundMessage('Please connect me to a person');
  assert.equal(result.action, 'handoff');
  assert.equal(result.category, 'Human requested');
});

test('routine informational request may use AI', () => {
  const result = routeInboundMessage('What time does the Safwa branch close?');
  assert.equal(result.action, 'ai');
});

test('unsupported non-text content fails closed', () => {
  const result = routeInboundMessage('');
  assert.equal(result.action, 'handoff');
  assert.equal(result.category, 'Unsupported message');
});
