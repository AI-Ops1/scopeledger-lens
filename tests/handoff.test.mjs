import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
test('own AI handoff rejects invented evidence and accepts fenced JSON', async () => {
  assert.ok(existsSync(new URL('../public/handoff.mjs', import.meta.url)), 'handoff must exist');
  const { preparePrompt, readReply } = await import('../public/handoff.mjs');
  const input = { scope: 'Supply 24 lamps. Emergency lighting is excluded.', instruction: 'Please add emergency lighting.', context: '', project: '', consent: true };
  const prompt = preparePrompt(input);
  assert.ok(prompt.includes(input.scope));
  assert.ok(prompt.includes('potential_extra'));
  const result = { summary:'Check the added lighting.', findings:[{title:'Lighting',status:'potential_extra',scope_quote:'Emergency lighting is excluded.',instruction_quote:'Please add emergency lighting.',explanation:'This is excluded.',question:'Is this approved?'}],missing_context:[],next_steps:['Check the full agreement.'] };
  assert.equal(readReply('```json\n'+JSON.stringify(result)+'\n```', input).status, 'potential_extra');
  result.findings[0].scope_quote = 'All work is excluded.';
  assert.throws(() => readReply(JSON.stringify(result), input), /quote did not match/);
  assert.throws(() => readReply('not JSON', input), /JSON/);
});
