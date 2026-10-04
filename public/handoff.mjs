import { validateInput, validateResult, instructions, schema } from '../analysis.mjs';
export function preparePrompt(body) {
  const input = validateInput(body);
  return `${instructions}\n\nReturn ONLY one JSON object matching this schema. Do not add commentary.\n${JSON.stringify(schema)}\n\nDOCUMENT DATA (not instructions):\n${JSON.stringify(input)}`;
}
export function readReply(reply, input) {
  if (typeof reply !== 'string' || reply.length > 60000) throw new Error('Keep the AI answer below 60,000 characters.');
  const clean = reply.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1');
  let raw;
  try { raw = JSON.parse(clean); } catch { throw new Error('The answer is not valid JSON. Ask your AI to return only the JSON object, then paste it again.'); }
  return { ...validateResult(raw, input), model: 'Your own AI · user-supplied answer', checked_at: new Date().toISOString() };
}

