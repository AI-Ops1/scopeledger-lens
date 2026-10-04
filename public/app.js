import { preparePrompt, readReply } from '/handoff.mjs';
const $ = id => document.getElementById(id);
const labels = { potential_extra: 'Potential extra work', appears_covered: 'Appears covered', needs_context: 'More context needed' };
const example = {
  project: 'Riverside · Electrical package',
  scope: 'Electrical scope, revision B:\nSupply and install 24 standard LED fittings in the ground-floor offices.\nEmergency lighting and external lighting are excluded.\nWork is planned during weekday daytime hours.\nChanges must be reviewed by the project manager before approval.',
  instruction: 'Please add six emergency lights to the ground-floor corridor and install them this Saturday. Keep the original 24 standard fittings as planned.',
  context: 'This is an illustrative example, not a real project.'
};
const sample = {
  status: 'potential_extra', summary: 'Emergency lighting is excluded in the supplied scope. The Saturday request also changes the stated working hours.',
  findings: [
    { title: 'Emergency lighting added', status: 'potential_extra', scope_quote: 'Emergency lighting and external lighting are excluded.', instruction_quote: 'Please add six emergency lights to the ground-floor corridor', explanation: 'The request adds emergency lighting that the scope expressly excludes. This supports a potential change; it does not establish approval or entitlement to payment.', question: 'Has the emergency lighting been authorised as a scope change?' },
    { title: 'Saturday installation requested', status: 'potential_extra', scope_quote: 'Work is planned during weekday daytime hours.', instruction_quote: 'install them this Saturday.', explanation: 'Saturday differs from the planned weekday hours. Check the complete contract and any agreed programme changes before assessing cost or time implications.', question: 'Who has approved Saturday working, and what terms apply?' },
    { title: 'Original fittings retained', status: 'appears_covered', scope_quote: 'Supply and install 24 standard LED fittings in the ground-floor offices.', instruction_quote: 'Keep the original 24 standard fittings as planned.', explanation: 'The original 24 fittings are already described in the supplied scope.', question: 'Do the current drawings still identify the same 24 standard fittings?' }
  ],
  missing_context: ['The complete agreement, current drawings and any approved changes.', 'Applicable notice requirements and the sender’s authority.'],
  next_steps: ['Check the instruction against the complete agreement and current revisions.', 'Confirm who may approve scope and working-hours changes.', 'Check and follow the contractual notice process without assuming a deadline.', 'Record any agreed change and its verified cost or programme effect.']
};
let config, current, controller, handoffInput, isSample = false;
function counts() {
  for (const [id, max] of [['scope', 20000], ['instruction', 8000]]) $(id + '-count').textContent = `${$(id).value.length.toLocaleString()} / ${max.toLocaleString()}`;
}
function payload() { return Object.fromEntries(['project', 'scope', 'instruction', 'context'].map(id => [id, $(id).value.trim()])); }
function clearResult() {
  current = null; $('result').hidden = true; $('empty').hidden = false; $('loading').hidden = true; $('reviewed').checked = false; $('copy-draft').disabled = true; $('copy-status').textContent = ''; $('review-note').hidden = true;
}
function invalidate() { handoffInput = null; $('handoff').hidden = true; $('ai-prompt').value = ''; $('ai-reply').value = ''; clearResult(); $('error').hidden = true; counts(); }
for (const id of ['project', 'scope', 'instruction', 'context']) $(id).addEventListener('input', invalidate);
function loadExample() {
  if (controller) return;
  for (const [id, value] of Object.entries(example)) $(id).value = value;
  $('consent').checked = false; invalidate();
}
$('load-example').addEventListener('click', () => { loadExample(); $('scope').focus(); });
function draftFor(result) {
  const project = $('project').value.trim();
  const items = result.findings.filter(f => f.status !== 'appears_covered');
  return `Hi,\n\n${project ? `Regarding ${project}, p` : 'P'}lease clarify the following instruction against the agreed scope:\n\n${(items.length ? items : result.findings).map((f, i) => `${i + 1}. ${f.question}`).join('\n')}\n\nPlease confirm the applicable scope, approval and notice process, and any agreed cost or programme implications. We will review this against the complete project documents.\n\nThank you.`;
}
function render(result, sampleMode = false) {
  current = structuredClone(result); isSample = sampleMode;
  $('empty').hidden = true; $('loading').hidden = true; $('result').hidden = false; $('sample-banner').hidden = !sampleMode;
  $('verdict-label').textContent = labels[result.status]; $('verdict-label').className = `verdict-label ${result.status}`;
  $('summary').textContent = result.summary;
  $('result-meta').textContent = sampleMode ? 'Sample findings using the example excerpts. No AI call was made.' : `${result.findings.length} finding(s) · Exact quote matches verified · ${result.model} · ${new Date(result.checked_at).toLocaleString()}`;
  $('findings').replaceChildren();
  result.findings.forEach((f, i) => {
    const node = $('finding-template').content.cloneNode(true);
    node.querySelector('.finding-number').textContent = String(i + 1).padStart(2, '0');
    node.querySelector('h3').textContent = f.title;
    const state = node.querySelector('.finding-state'); state.textContent = labels[f.status]; state.classList.add(f.status);
    node.querySelector('.finding-explanation').textContent = f.explanation;
    node.querySelector('.scope-quote').textContent = f.scope_quote || 'No relevant clause supplied. Inclusion or exclusion cannot be established.';
    node.querySelector('.instruction-quote').textContent = f.instruction_quote;
    node.querySelector('.finding-question').textContent = `Clarify: ${f.question}`;
    $('findings').append(node);
  });
  for (const [id, values] of [['missing', result.missing_context], ['next-steps', result.next_steps]]) {
    $(id).replaceChildren(...values.map(value => { const li = document.createElement('li'); li.textContent = value; return li; }));
  }
  $('missing-section').hidden = !result.missing_context.length;
  $('draft').textContent = draftFor(result); $('reviewed').checked = false; $('copy-draft').disabled = true;
  $('copy-status').textContent = ''; $('review-note').hidden = true;
}
$('preview-example').addEventListener('click', () => { loadExample(); render(sample, true); });
$('check-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (controller) return;
  if ($('ai-mode').value === 'own') {
    if (!$('check-form').reportValidity()) return;
    try {
      const body = { ...payload(), consent: $('consent').checked };
      const prompt = preparePrompt(body);
      clearResult(); handoffInput = structuredClone(payload());
      $('ai-prompt').value = prompt; $('ai-reply').value = ''; $('handoff').hidden = false;
      $('error').hidden = true; $('import-error').hidden = true; $('prompt-status').textContent = '';
      $('handoff').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { $('error').textContent = error.message; $('error').hidden = false; }
    return;
  }
  if (!config?.ready) { $('error').textContent = 'Live AI is not connected yet. Use “See a sample review” to explore the app.'; $('error').hidden = false; return; }
  if (!$('check-form').reportValidity()) return;
  clearResult(); $('error').hidden = true; $('empty').hidden = true; $('loading').hidden = false;
  controller = new AbortController();
  const activeController = controller;
  $('analyze').disabled = true;
  for (const id of ['project', 'scope', 'instruction', 'context', 'consent', 'load-example']) $(id).disabled = true;
  const timer = setTimeout(() => activeController.abort(), 55000);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Access-Token': $('access').value }, body: JSON.stringify({ ...payload(), consent: $('consent').checked }), signal: activeController.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The check could not be completed.');
    if (controller !== activeController) return;
    render(result);
    if (window.innerWidth < 850) $('result-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (controller !== activeController) return;
    clearResult(); $('error').textContent = error.name === 'AbortError' ? 'The request timed out. No result was accepted. Please try again.' : error.message;
    $('error').hidden = false;
  } finally {
    clearTimeout(timer);
    if (controller === activeController) {
      controller = null;
      updateMode();
      for (const id of ['project', 'scope', 'instruction', 'context', 'consent', 'load-example']) $(id).disabled = false;
    }
  }
});
$('reviewed').addEventListener('change', () => { $('copy-draft').disabled = !$('reviewed').checked; });
$('copy-draft').addEventListener('click', async () => {
  if (!current || !$('reviewed').checked) return;
  try { await navigator.clipboard.writeText($('draft').textContent); $('copy-status').textContent = 'Draft copied. Review before sending.'; }
  catch { $('copy-status').textContent = 'Copy is unavailable here. Select the draft text and copy it manually.'; }
});
function report() {
  const input = payload();
  return `${isSample ? 'ILLUSTRATIVE SAMPLE — NOT LIVE AI\n\n' : ''}ScopeLedger Lens — preliminary scope review\nProject: ${input.project || 'Not supplied'}\n${isSample ? '' : `Model: ${current.model}\nChecked: ${current.checked_at}\n`}\n${labels[current.status]}\n${current.summary}\n\n${current.findings.map((f, i) => `${i + 1}. ${f.title} — ${labels[f.status]}\nScope: ${f.scope_quote || '[not supplied]'}\nInstruction: ${f.instruction_quote}\n${f.explanation}\nClarify: ${f.question}`).join('\n\n')}\n\nMissing context:\n${current.missing_context.map(v => `- ${v}`).join('\n')}\n\nNext steps:\n${current.next_steps.map(v => `- ${v}`).join('\n')}\n\nDRAFT — review before sending:\n${$('draft').textContent}\n\nReview of supplied excerpts only. Verified quotes do not prove interpretation. No determination of entitlement, approval, price or notice deadline.\n`;
}
function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('download').addEventListener('click', () => { if (current) download(report(), 'scopeledger-lens-review.txt'); });
$('prepare-review').addEventListener('click', () => { if (current) { download(`REQUEST FOR HUMAN EXPOSURE REVIEW\nPlease review the following preliminary finding.\n\n${report()}`, 'exposure-review-request.txt'); $('review-note').hidden = false; } });
$('clear').addEventListener('click', () => {
  controller?.abort(); controller = null;
  $('check-form').reset();
  for (const id of ['project', 'scope', 'instruction', 'context', 'consent', 'load-example']) $(id).disabled = false;
  updateMode(); invalidate();
});
(async () => {
  try {
    const response = await fetch('/api/config'); if (!response.ok) throw new Error(); config = await response.json();
    updateMode();
    updateMode();
    if (config.review_url) { $('review-link').href = config.review_url; $('review-link').hidden = false; $('prepare-review').hidden = true; }
  } catch { config = { ready: false }; updateMode(); }
})();

function updateMode() {
  const own = $('ai-mode').value === 'own';
  $('analyze').disabled = !own && !config?.ready;
  $('analyze').textContent = own ? 'Prepare my AI prompt →' : 'Check with app AI →';
  $('access-wrap').hidden = own || !config?.access_required;
  $('access').required = !own && Boolean(config?.access_required);
  $('privacy').textContent = own ? 'Your prompt and quote checks stay in this browser. You share the prompt with your AI yourself. Its privacy rules apply.' : 'Text is sent through the app server to OpenAI. The app does not save it. Provider privacy rules apply.';
  $('connection').textContent = own ? 'No API key needed. Use your own AI chat within its usage limits.' : config?.ready ? 'App AI connected.' : 'App AI is not connected. Choose Use your own AI.';
}
$('ai-mode').addEventListener('change', () => { invalidate(); updateMode(); });
$('copy-prompt').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('ai-prompt').value); $('prompt-status').textContent = 'Prompt copied. Paste it into your AI chat.'; }
  catch { $('ai-prompt').focus(); $('ai-prompt').select(); $('prompt-status').textContent = 'Select and copy the prompt manually.'; }
});
$('import-reply').addEventListener('click', () => {
  if (!handoffInput) return;
  try { const result = readReply($('ai-reply').value, handoffInput); render(result); $('import-error').hidden = true; $('result-title').scrollIntoView({ behavior: 'smooth' }); }
  catch(error) { clearResult(); $('import-error').textContent = error.message; $('import-error').hidden = false; }
});
updateMode();
