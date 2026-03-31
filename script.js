/* ═══════════════════════════════════════════════
   Luau Studio AI — script.js
   Groq integration + syntax highlight + tabs
   ═══════════════════════════════════════════════ */

'use strict';

// ── Config ────────────────────────────────────────
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM = `You are an expert Roblox Luau developer. You know:
- All Roblox APIs and Services (Players, Workspace, ReplicatedStorage, RunService, TweenService, etc.)
- Luau syntax, type annotations, generics
- Client-server architecture, RemoteEvents, RemoteFunctions
- DataStore, DataStore2, ProfileService patterns
- Performance optimization, memory management
- Common Roblox game patterns: OOP, Modules, Knit framework

Rules:
- For Generate/Fix/Optimize: return ONLY clean Luau code. No markdown fences. No explanation.
- For Explain: return a clear, well-structured explanation in plain text.
- Always use proper Luau syntax (not Lua 5.1).
- Add brief inline comments for clarity.
- Use pcall/xpcall for error-prone operations.`;

const LOAD_MSGS = {
  fix:      ['Analyzing bugs…', 'Patching errors…', 'Fixing script…'],
  optimize: ['Profiling code…', 'Optimizing…', 'Refactoring…'],
  explain:  ['Reading code…', 'Analyzing logic…', 'Building explanation…'],
  generate: ['Writing script…', 'Generating code…', 'Building your idea…'],
};

// ── State ─────────────────────────────────────────
let totalTokens = 0;
let busy = false;

// ── DOM helpers ───────────────────────────────────
const $ = id => document.getElementById(id);
const el = (sel, ctx = document) => ctx.querySelector(sel);

// ── Elements ──────────────────────────────────────
const promptInput   = $('promptInput');
const codeInput     = $('codeInput');
const lineNums      = $('lineNums');
const outputBody    = $('outputBody');
const emptyState    = $('emptyState');
const loadingState  = $('loadingState');
const loadingLabel  = $('loadingLabel');
const outputPre     = $('outputPre');
const copyOutputBtn = $('copyOutputBtn');
const useAsInputBtn = $('useAsInputBtn');

const genPrompt      = $('genPrompt');
const genOutputBody  = $('genOutputBody');
const genEmptyState  = $('genEmptyState');
const genLoadingState= $('genLoadingState');
const genLoadingLabel= $('genLoadingLabel');
const genOutputPre   = $('genOutputPre');
const copyGenBtn     = $('copyGenBtn');

const apiKeyInput = $('apiKeyInput');
const toggleKeyBtn= $('toggleKeyBtn');
const saveKeyBtn  = $('saveKeyBtn');
const modelSelect = $('modelSelect');
const resetTokens = $('resetTokens');
const tokenCount  = $('tokenCount');
const tokenBig    = $('tokenBig');
const apiDot      = $('apiDot');
const apiLabel    = $('apiLabel');
const modelBadge  = $('modelBadge');
const toast       = $('toast');
const copyPluginBtn = $('copyPluginBtn');

// ── Init from localStorage ─────────────────────────
(function init() {
  const key = localStorage.getItem('groq_key') || '';
  const mdl = localStorage.getItem('groq_model') || 'llama-3.1-8b-instant';
  if (key) { apiKeyInput.value = key; setApiStatus(true); }
  modelSelect.value = mdl;
  modelBadge.textContent = mdl.split('-').slice(0,2).join('-');
  updateLineNums();
})();

// ── Tab routing ───────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + tab).classList.add('active');
  });
});

// ── Line numbers ──────────────────────────────────
function updateLineNums() {
  const n = codeInput.value.split('\n').length;
  lineNums.textContent = Array.from({length: n}, (_, i) => i + 1).join('\n');
}
codeInput.addEventListener('input', updateLineNums);
codeInput.addEventListener('scroll', () => { lineNums.scrollTop = codeInput.scrollTop; });

// Tab key in code editor
codeInput.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const s = codeInput.selectionStart;
  codeInput.value = codeInput.value.slice(0, s) + '    ' + codeInput.value.slice(codeInput.selectionEnd);
  codeInput.selectionStart = codeInput.selectionEnd = s + 4;
  updateLineNums();
});

// ── Syntax highlight ──────────────────────────────
const KEYWORDS = new Set([
  'local','function','return','if','then','else','elseif','end',
  'for','while','do','repeat','until','break','continue','in',
  'not','and','or','nil','true','false','self',
  'require','pcall','xpcall','error','assert','type','typeof',
  'warn','print','tostring','tonumber','pairs','ipairs','next',
  'select','unpack','table','string','math','coroutine','task',
  'game','script','workspace','wait','delay','spawn','Instance',
  'Vector3','Vector2','CFrame','Color3','UDim2','UDim','Enum',
  'TweenInfo','TweenService','RunService','Players','HttpService',
  'ReplicatedStorage','ServerStorage','ServerScriptService',
  'UserInputService','ContextActionService','DataStoreService',
]);

function highlight(raw) {
  // Escape HTML
  let s = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Comments first (protect them)
  const comments = [];
  s = s.replace(/(--[^\n]*)/g, m => {
    comments.push(`<span class="cmt">${m}</span>`);
    return `\x00C${comments.length - 1}\x00`;
  });

  // Strings
  s = s.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\[\[[\s\S]*?\]\])/g,
    '<span class="str">$1</span>');

  // Numbers
  s = s.replace(/\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, '<span class="num">$1</span>');

  // Keywords
  s = s.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, m =>
    KEYWORDS.has(m) ? `<span class="kw">${m}</span>` : m
  );

  // Function calls
  s = s.replace(/\b([A-Za-z_][A-Za-z0-9_]*)(?=\s*\()/g, (m, fn) =>
    KEYWORDS.has(fn) ? m : `<span class="fn">${fn}</span>`
  );

  // Restore comments
  s = s.replace(/\x00C(\d+)\x00/g, (_, i) => comments[parseInt(i)]);

  return s;
}

// ── Output state helpers ──────────────────────────
function showEmpty(body, empty, loading, pre) {
  empty.classList.remove('hidden');
  loading.classList.add('hidden');
  pre.classList.add('hidden');
}
function showLoading(body, empty, loading, pre, label, msg) {
  empty.classList.add('hidden');
  loading.classList.remove('hidden');
  pre.classList.add('hidden');
  body.style.alignItems = 'center';
  body.style.justifyContent = 'center';
  label.textContent = msg;
}
function showResult(body, empty, loading, pre, code) {
  empty.classList.add('hidden');
  loading.classList.add('hidden');
  pre.classList.remove('hidden');
  body.style.alignItems = 'flex-start';
  body.style.justifyContent = 'flex-start';
  pre.innerHTML = highlight(code);
  pre._rawText = code;
}

// ── Token tracker ─────────────────────────────────
function addTokens(n) {
  totalTokens += n;
  tokenCount.textContent = totalTokens.toLocaleString();
  if (tokenBig) tokenBig.textContent = totalTokens.toLocaleString();
}

// ── API status ────────────────────────────────────
function setApiStatus(on) {
  if (on) {
    apiDot.className = 'dot online';
    apiLabel.textContent = 'API ready';
  } else {
    apiDot.className = 'dot offline';
    apiLabel.textContent = 'No key';
  }
}

// ── Groq call ─────────────────────────────────────
async function groq(userMsg) {
  const key = localStorage.getItem('groq_key') || apiKeyInput.value.trim();
  if (!key) throw new Error('No API key. Go to Settings and save your Groq key.');

  const model = modelSelect.value;
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.25,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: userMsg },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const tokens = data.usage?.total_tokens || Math.ceil((userMsg + text).length / 4);
  addTokens(tokens);

  // Strip accidental markdown fences
  return text.replace(/^```(?:lua|luau)?\n?/i, '').replace(/\n?```$/i, '').trim();
}

// ── Build prompts ─────────────────────────────────
function buildPrompt(action, prompt, code) {
  switch (action) {
    case 'fix':
      return `Fix all bugs and errors in this Roblox Luau script.
${prompt ? 'Additional context: ' + prompt : ''}

Script:
${code}

Return ONLY the corrected code.`;

    case 'optimize':
      return `Optimize this Roblox Luau script for performance, readability and best practices.
${prompt ? 'Focus on: ' + prompt : ''}

Script:
${code}

Return ONLY the optimized code.`;

    case 'explain':
      return `Explain this Roblox Luau script clearly and concisely.
Cover: what it does, how it works, any potential issues, and suggestions.

${code ? 'Script:\n' + code : 'Topic: ' + prompt}`;

    case 'generate':
      return `Generate a complete, working Roblox Luau script for:

${prompt}

Requirements:
- Proper Luau syntax
- Clear inline comments
- Production-ready quality
- Return ONLY the code, no explanation.`;
  }
}

// ── Editor actions ────────────────────────────────
async function runEditorAction(action) {
  if (busy) return;

  const prompt = promptInput.value.trim();
  const code   = codeInput.value.trim();

  if ((action === 'fix' || action === 'optimize') && !code) {
    showResult(outputBody, emptyState, loadingState, outputPre,
      '⚠ Paste a script in the code editor first.');
    return;
  }
  if (action === 'explain' && !code && !prompt) {
    showResult(outputBody, emptyState, loadingState, outputPre,
      '⚠ Paste a script or enter a prompt to explain.');
    return;
  }

  const msg = LOAD_MSGS[action][Math.floor(Math.random() * 3)];
  busy = true;
  setAllBtnsDisabled(true);
  showLoading(outputBody, emptyState, loadingState, outputPre, loadingLabel, msg);

  try {
    const result = await groq(buildPrompt(action, prompt, code));
    showResult(outputBody, emptyState, loadingState, outputPre, result);
  } catch (e) {
    showResult(outputBody, emptyState, loadingState, outputPre, '❌ ' + e.message);
  } finally {
    busy = false;
    setAllBtnsDisabled(false);
  }
}

// ── Generate action ───────────────────────────────
async function runGenerate() {
  if (busy) return;

  const prompt = genPrompt.value.trim();
  if (!prompt) {
    showResult(genOutputBody, genEmptyState, genLoadingState, genOutputPre,
      '⚠ Describe what you want to generate first.');
    return;
  }

  const msg = LOAD_MSGS.generate[Math.floor(Math.random() * 3)];
  busy = true;
  setAllBtnsDisabled(true);
  showLoading(genOutputBody, genEmptyState, genLoadingState, genOutputPre, genLoadingLabel, msg);

  try {
    const result = await groq(buildPrompt('generate', prompt, ''));
    showResult(genOutputBody, genEmptyState, genLoadingState, genOutputPre, result);
  } catch (e) {
    showResult(genOutputBody, genEmptyState, genLoadingState, genOutputPre, '❌ ' + e.message);
  } finally {
    busy = false;
    setAllBtnsDisabled(false);
  }
}

function setAllBtnsDisabled(v) {
  document.querySelectorAll('.btn, .action-btn').forEach(b => b.disabled = v);
}

// ── Event listeners ───────────────────────────────

// Editor buttons
document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const a = btn.dataset.action;
    if (a === 'generate') runGenerate();
    else runEditorAction(a);
  });
});

// Quick tags
document.querySelectorAll('.qtag').forEach(tag => {
  tag.addEventListener('click', () => {
    genPrompt.value = tag.dataset.prompt;
    genPrompt.focus();
  });
});

// Ctrl+Enter shortcut
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    const active = el('.tab.active');
    if (active?.id === 'tab-generate') runGenerate();
    else runEditorAction('fix');
  }
});

// Copy output
copyOutputBtn.addEventListener('click', () => {
  const txt = outputPre._rawText || outputPre.textContent;
  if (!txt) return;
  navigator.clipboard.writeText(txt).then(() => showToast('Copied!'));
});

// Use as input
useAsInputBtn.addEventListener('click', () => {
  const txt = outputPre._rawText || outputPre.textContent;
  if (!txt) return;
  codeInput.value = txt;
  updateLineNums();
  // Switch to editor tab
  document.querySelector('[data-tab="editor"]').click();
  showToast('Pasted into editor');
});

// Copy generate output
copyGenBtn.addEventListener('click', () => {
  const txt = genOutputPre._rawText || genOutputPre.textContent;
  if (!txt) return;
  navigator.clipboard.writeText(txt).then(() => showToast('Copied!'));
});

// Copy plugin code
copyPluginBtn.addEventListener('click', () => {
  const txt = $('pluginCodeEl').textContent;
  navigator.clipboard.writeText(txt).then(() => showToast('Plugin code copied!'));
});

// Settings
toggleKeyBtn.addEventListener('click', () => {
  const show = apiKeyInput.type === 'password';
  apiKeyInput.type = show ? 'text' : 'password';
  toggleKeyBtn.textContent = show ? 'Hide' : 'Show';
});

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return showToast('Enter a key first');
  localStorage.setItem('groq_key', key);
  setApiStatus(true);
  showToast('API key saved ✓');
});

modelSelect.addEventListener('change', () => {
  localStorage.setItem('groq_model', modelSelect.value);
  modelBadge.textContent = modelSelect.value.split('-').slice(0,2).join('-');
  showToast('Model updated');
});

resetTokens.addEventListener('click', () => {
  totalTokens = 0;
  tokenCount.textContent = '0';
  if (tokenBig) tokenBig.textContent = '0';
  showToast('Token count reset');
});

// ── Toast ─────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2000);
}

// ── Plugin RBXAI helper (for devtools) ────────────
window.RBXAI = {
  async process({ prompt = '', code = '' } = {}) {
    promptInput.value = prompt;
    codeInput.value = code;
    updateLineNums();
    document.querySelector('[data-tab="editor"]').click();
    const action = /fix|bug|error/i.test(prompt) ? 'fix'
      : /optim|faster/i.test(prompt) ? 'optimize'
      : /explain|what|how/i.test(prompt) ? 'explain' : 'fix';
    await runEditorAction(action);
    return { result: outputPre._rawText || outputPre.textContent };
  }
};

console.log('%cLuau Studio AI', 'color:#38bdf8;font-weight:bold;font-size:14px');
console.log('window.RBXAI available for plugin integration');
