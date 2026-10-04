import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { validateInput, validateResult, analyze, AppError } from '../analysis.mjs';
import { createApp } from '../server.mjs';

const input = { scope: 'Supply 24 standard lights. Emergency lights are excluded.', instruction: 'Please add six emergency lights to the corridor.', context: '', project: 'Test' };
const result = () => ({ summary: 'Emergency lighting may be additional work.', findings: [{ title: 'Emergency lighting', status: 'potential_extra', scope_quote: 'Emergency lights are excluded.', instruction_quote: 'add six emergency lights', explanation: 'The supplied scope excludes this requested work.', question: 'Has this change been approved?' }], missing_context: ['Full contract and approval authority.'], next_steps: ['Review the full contract.'] });
const packet = raw => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(raw) }] }] });

test('input requires consent, sufficient text and bounded strings', () => {
  assert.deepEqual(validateInput({ ...input, consent: true }), input);
  for (const change of [{ consent: false }, { scope: 'short' }, { instruction: 42 }, { scope: 'a'.repeat(20001) }, { context: 'a'.repeat(4001) }]) {
    assert.throws(() => validateInput({ ...input, consent: true, ...change }), AppError);
  }
});
test('fabricated, altered or swapped source quotes fail closed', () => {
  for (const change of [{ scope_quote: 'Emergency lights are included.' }, { instruction_quote: 'Add seven emergency lights.' }, { scope_quote: input.instruction }, { scope_quote: '' }]) {
    const raw = result(); Object.assign(raw.findings[0], change); assert.throws(() => validateResult(raw, input), AppError);
  }
});
test('overall classification is derived from findings, never a provider assertion', () => {
  const raw = result(); raw.status = 'appears_covered'; assert.equal(validateResult(raw, input).status, 'potential_extra');
  raw.findings[0].status = 'needs_context'; raw.findings[0].scope_quote = ''; assert.equal(validateResult(raw, input).status, 'needs_context');
  raw.findings[0].status = 'appears_covered'; raw.findings[0].scope_quote = 'Supply 24 standard lights.'; assert.equal(validateResult(raw, input).status, 'appears_covered');
});
test('invalid arrays, statuses and missing fields are rejected', () => {
  for (const change of [{ findings: [] }, { findings: Array(7).fill(result().findings[0]) }, { next_steps: [] }, { summary: null }, { missing_context: 'unknown' }]) assert.throws(() => validateResult({ ...result(), ...change }, input), AppError);
  const raw = result(); raw.findings[0].status = 'guaranteed_payment'; assert.throws(() => validateResult(raw, input), AppError);
});
test('provider request uses server key, strict schema, no tools, no stored response', async () => {
  const value = await analyze(input, { key: 'test-only', fetchFn: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.equal(body.tools, undefined); assert.deepEqual(JSON.parse(body.input), input);
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    return new Response(JSON.stringify(packet(result())), { status: 200 });
  }});
  assert.equal(value.status, 'potential_extra'); assert.equal(value.model, 'gpt-4.1-mini');
});
test('refusals, incomplete output, malformed JSON, network errors and provider failures do not become findings', async () => {
  const packets = [{ status: 'incomplete', output: [] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not JSON' }] }] }];
  for (const value of packets) await assert.rejects(analyze(input, { key: 'test', fetchFn: async () => new Response(JSON.stringify(value)) }), AppError);
  await assert.rejects(analyze(input, { key: 'test', fetchFn: async () => { throw new Error('private provider error'); } }), e => e.status === 504 && !e.message.includes('private'));
  await assert.rejects(analyze(input, { key: 'test', fetchFn: async () => new Response('secret detail', { status: 429 }) }), e => e.status === 429 && !e.message.includes('secret'));
});
async function withServer(config, fn) {
  const server = createApp(config); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
}
const post = (url, body = { ...input, consent: true }, headers = {}) => fetch(url + '/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
test('missing API key is explicit; no fake live result or leaked configuration', async () => {
  await withServer({ key: '', access: '', review: '' }, async url => {
    const config = await (await fetch(url + '/api/config')).json(); assert.equal(config.ready, false); assert.equal(config.key, undefined);
    const response = await post(url); assert.equal(response.status, 503); assert.match((await response.json()).error, /not connected/);
    const page = await fetch(url); assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal((await fetch(url + '/.env')).status, 404);
  });
});
test('API rejects cross-origin calls, absent access code and invalid consent before provider use', async () => {
  let calls = 0;
  await withServer({ key: 'test', access: 'invite', analyzeFn: async () => { calls++; return result(); } }, async url => {
    assert.equal((await post(url)).status, 401);
    assert.equal((await post(url, undefined, { Origin: 'https://attacker.invalid', 'X-Access-Token': 'invite' })).status, 403);
    assert.equal((await post(url, { ...input, consent: false }, { 'X-Access-Token': 'invite' })).status, 400);
    assert.equal(calls, 0);
  });
});
test('daily provider cap holds even if callers change IP', async () => {
  let calls = 0;
  await withServer({ key: 'test', access: '', cap: 1, analyzeFn: async () => { calls++; return validateResult(result(), input); } }, async url => {
    assert.equal((await post(url)).status, 200); assert.equal((await post(url)).status, 429); assert.equal(calls, 1);
  });
});
test('busy check prevents overlapping provider spend', async () => {
  let finish, started;
  const start = new Promise(resolve => started = resolve);
  await withServer({ key: 'test', access: '', cap: 2, analyzeFn: async () => { started(); await new Promise(resolve => finish = resolve); return validateResult(result(), input); } }, async url => {
    const first = post(url); await start; assert.equal((await post(url)).status, 429); finish(); assert.equal((await first).status, 200);
  });
});
test('oversized request is rejected without a provider call', async () => {
  await withServer({ key: 'test', access: '' }, async url => assert.equal((await post(url, { ...input, scope: 'x'.repeat(150000) })).status, 413));
});
