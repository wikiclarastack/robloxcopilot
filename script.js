/* ═══════════════════════════════════════════════
   Roblox AI Script Assistant — script.js
   Groq API integration + Plugin endpoint sim
   ═══════════════════════════════════════════════ */

'use strict';

// ── Config ──────────────────────────────────────
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL         = 'llama3-70b-8192';

const SYSTEM_PROMPT = `You are an expert Roblox Luau developer with deep knowledge of:
- Roblox APIs, services (Players, Workspace, ReplicatedStorage, etc.)
- Luau syntax, type annotations, and best practices
- Client-server architecture in Roblox
- RemoteEvents, RemoteFunctions, BindableEvents
- Performance optimization for Roblox games
- Common Roblox patterns: OOP, Modules, etc.

When generating or fixing code:
1. Always use proper Luau syntax (not Lua 5.1)
2. Add brief inline comments for clarity
3. Handle errors with pcall/xpcall where appropriate
4. Return ONLY the code block when asked to generate/fix/optimize
5. For explanations, be clear and concise

For Generate/Fix/Optimize actions: respond with ONLY clean Luau code, no markdown fences.
For Explain: respond with a clear textual explanation.`;

// ── State ────────────────────────────────────────
let totalTokens = 0;
let isLoading   = false;

// ── DOM Refs ─────────────────────────────────────
const $ = id => document.getElementById(id);
const promptInput  = $('promptInput');
const codeInput    = $('codeInput');
const apiKeyInput  = $('apiKey');
const tokenDisplay = $('tokenCount');
const lineNums     = $('lineNums');

const idleState    = $('idleState');
const loadingState = $('loadingState');
const resultState  = $('resultState');
const outputCode   = $('outputCode');
const loadingText  = $('loadingText');

const copyBtn      = $('copyBtn');
const clearBtn     = $('clearBtn');
const copyPlugin   = $('copyPlugin');
const toggleKey    = $('toggleKey');
const toast        = $('toast');

// ── Line Numbers ─────────────────────────────────
function updateLineNums() {
  const lines = codeInput.value.split('\n').length;
  lineNums.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

codeInput.addEventListener('input', updateLineNums);
codeInput.addEventListener('scroll', () => {
  lineNums.scrollTop = codeInput.scrollTop;
});
updateLineNums();

// Tab support in code editor
codeInput.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = codeInput.selectionStart;
    const e2 = codeInput.selectionEnd;
    codeInput.value = codeInput.value.substring(0, s) + '    ' + codeInput.value.substring(e2);
    codeInput.selectionStart = codeInput.selectionEnd = s + 4;
    updateLineNums();
  }
});

// ── Toggle API key visibility ─────────────────────
toggleKey.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

// ── State Management ─────────────────────────────
function showIdle()    { idleState.classList.remove('hidden'); loadingState.classList.add('hidden'); resultState.classList.add('hidden'); }
function showLoading(msg = 'Processing...') {
  idleState.classList.add('hidden'); loadingState.classList.remove('hidden'); resultState.classList.add('hidden');
  loadingText.textContent = msg;
}
function showResult(content) {
  idleState.classList.add('hidden'); loadingState.classList.add('hidden'); resultState.classList.remove('hidden');
  outputCode.innerHTML = highlight(content);
}

// ── Syntax Highlighting ───────────────────────────
function highlight(code) {
  // Escape HTML first
  let out = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Order matters — process from most specific to least
  // 1. Comments
  out = out.replace(/(--[^\n]*)/g, '<span class="cmt">$1</span>');

  // 2. Strings (only outside comments — simple approach)
  out = out.replace(/(?<!<span class="cmt">.*?)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\[\[[\s\S]*?\]\])/g,
    '<span class="str">$1</span>');

  // 3. Numbers
  out = out.replace(/\b(\d+\.?\d*)\b(?![^<]*>)/g, '<span class="num">$1</span>');

  // 4. Keywords
  const keywords = [
    'local','function','return','if','then','else','elseif','end',
    'for','while','do','repeat','until','break','in','not','and','or',
    'nil','true','false','self','require','pcall','xpcall','error',
    'type','typeof','warn','print','assert','tostring','tonumber',
    'pairs','ipairs','next','select','unpack','table','string','math',
    'coroutine','task','game','script','workspace','wait','delay'
  ];
  const kwReg = new RegExp(`\\b(${keywords.join('|')})\\b(?![^<]*>)`, 'g');
  out = out.replace(kwReg, '<span class="kw">$1</span>');

  // 5. Function calls
  out = out.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()(?![^<]*>)/g,
    '<span class="fn">$1</span>');

  // 6. Operators
  out = out.replace(/(?<!=)(==|~=|&lt;=|&gt;=|\.\.\.?|#)(?![^<]*>)/g,
    '<span class="op">$1</span>');

  return out;
}

// ── Token Counter ─────────────────────────────────
function estimateTokens(text) {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}
function updateTokens(added) {
  totalTokens += added;
  tokenDisplay.textContent = totalTokens.toLocaleString();
  tokenDisplay.style.animation = 'none';
  requestAnimationFrame(() => {
    tokenDisplay.style.animation = '';
    tokenDisplay.style.color = 'var(--accent3)';
    setTimeout(() => { tokenDisplay.style.color = 'var(--accent)'; }, 600);
  });
}

// ── Toast ─────────────────────────────────────────
let toastTimer;
function showToast(msg = 'Copied!') {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
}

// ── Copy ─────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  const text = outputCode.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => showToast('Code copied!'));
});

clearBtn.addEventListener('click', () => {
  showIdle();
  outputCode.innerHTML = '';
});

copyPlugin.addEventListener('click', () => {
  const text = $('pluginCode').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('Plugin code copied!'));
});

// ── Build Prompt per Action ───────────────────────
function buildPrompt(action, userPrompt, code) {
  switch (action) {
    case 'generate':
      return `Generate a complete, working Roblox Luau script for the following:

${userPrompt}

Requirements:
- Use proper Luau syntax
- Add comments explaining key sections
- Make it production-ready
- Return ONLY the code, no explanation, no markdown fences.`;

    case 'fix':
      if (!code.trim()) return null;
      return `Fix all bugs, errors and issues in this Roblox Luau script.
${userPrompt ? `Additional context: ${userPrompt}` : ''}

Script to fix:
\`\`\`lua
${code}
\`\`\`

Return ONLY the corrected Luau code. No explanation, no markdown fences.`;

    case 'optimize':
      if (!code.trim()) return null;
      return `Optimize this Roblox Luau script for better performance, readability and best practices.
${userPrompt ? `Focus on: ${userPrompt}` : ''}

Script to optimize:
\`\`\`lua
${code}
\`\`\`

Return ONLY the optimized Luau code. No explanation, no markdown fences.`;

    case 'explain':
      if (!code.trim() && !userPrompt.trim()) return null;
      const subject = code.trim()
        ? `Explain this Roblox Luau script in detail:\n\`\`\`lua\n${code}\n\`\`\``
        : `Explain this concept in Roblox Luau: ${userPrompt}`;
      return subject + '\n\nInclude: what it does, how it works, potential issues, and improvement suggestions.';

    default:
      return userPrompt;
  }
}

// ── Loading Messages ──────────────────────────────
const loadingMessages = {
  generate: ['Generating script...', 'Writing Luau code...', 'Building your script...'],
  fix:      ['Analyzing errors...', 'Fixing your script...', 'Patching bugs...'],
  optimize: ['Analyzing performance...', 'Optimizing code...', 'Refactoring script...'],
  explain:  ['Reading your code...', 'Analyzing logic...', 'Preparing explanation...'],
};

// ── Groq API Call ─────────────────────────────────
async function callGroq(prompt) {
  const key = apiKeyInput.value.trim();
  if (!key) {
    throw new Error('No API key. Enter your Groq API key in the field below the code editor.');
  }

  const body = {
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt }
    ]
  };

  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Update token counter
  const used = data.usage?.total_tokens || estimateTokens(prompt + content);
  updateTokens(used);

  // Strip markdown fences if model adds them anyway
  return content.replace(/^```(?:lua|luau)?\n?/i, '').replace(/\n?```$/i, '').trim();
}

// ── Main Action Handler ───────────────────────────
async function handleAction(action) {
  if (isLoading) return;

  const userPrompt = promptInput.value.trim();
  const code       = codeInput.value.trim();

  // Validation
  if (action === 'generate' && !userPrompt) {
    showResult('⚠ Please enter a prompt describing what you want to generate.');
    return;
  }
  if ((action === 'fix' || action === 'optimize') && !code) {
    showResult('⚠ Please paste a script in the code editor to ' + action + '.');
    return;
  }
  if (action === 'explain' && !code && !userPrompt) {
    showResult('⚠ Please paste code or enter a prompt to explain.');
    return;
  }

  const prompt = buildPrompt(action, userPrompt, code);
  if (!prompt) return;

  isLoading = true;
  setButtonsDisabled(true);

  const msgs = loadingMessages[action];
  const msg  = msgs[Math.floor(Math.random() * msgs.length)];
  showLoading(msg);

  try {
    const result = await callGroq(prompt);
    showResult(result);
  } catch (err) {
    showResult(`❌ Error: ${err.message}\n\nCheck your API key and try again.`);
  } finally {
    isLoading = false;
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(state) {
  document.querySelectorAll('[data-action]').forEach(btn => btn.disabled = state);
}

// ── Button Events ─────────────────────────────────
document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => handleAction(btn.dataset.action));
});

// ── Keyboard Shortcut: Ctrl+Enter = Generate ─────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    handleAction('generate');
  }
});

// ── Plugin Endpoint Simulation ────────────────────
// This simulates what a backend would do.
// When using Live Server, the plugin calls http://localhost:5500/ai
// The site intercepts via a Service Worker or the user can run a tiny node proxy.
// For a pure static approach, we expose a helper the plugin can call via
// a shared localStorage trick if both are on same machine.

// Plugin-compatible function exposed globally (for advanced setups)
window.RBXAI = {
  /**
   * Process a request as if it came from the Roblox plugin.
   * Usage in browser console: RBXAI.process({ prompt: "Fix this", code: "..." })
   */
  async process(payload) {
    const { prompt = '', code = '' } = payload;
    promptInput.value = prompt;
    codeInput.value   = code;
    updateLineNums();

    // Determine action from prompt keywords
    let action = 'generate';
    const p = prompt.toLowerCase();
    if (p.includes('fix') || p.includes('error') || p.includes('bug'))    action = 'fix';
    if (p.includes('optim') || p.includes('faster') || p.includes('improve')) action = 'optimize';
    if (p.includes('explain') || p.includes('what') || p.includes('how')) action = 'explain';

    await handleAction(action);
    return { result: outputCode.textContent };
  }
};

// ── LocalStorage: persist API key ────────────────
const savedKey = localStorage.getItem('groq_api_key');
if (savedKey) apiKeyInput.value = savedKey;

apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('groq_api_key', apiKeyInput.value);
});

// ── Init ──────────────────────────────────────────
showIdle();
console.log(
  '%c Roblox AI Script Assistant ',
  'background:#00e5ff;color:#080b10;font-weight:bold;padding:4px 8px;border-radius:4px',
  '\nPowered by Groq · ' + MODEL
);
console.log(
  'Plugin API exposed as window.RBXAI\n' +
  'Use: RBXAI.process({ prompt: "...", code: "..." })'
);
