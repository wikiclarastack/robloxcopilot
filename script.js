/* ============================================================
   ECLIPSE COPILOT — script.js
   Roblox AI Dev Platform · Groq Cloud Integration
   ============================================================ */

'use strict';

// ─── CONFIG ────────────────────────────────────────────────
const CONFIG = {
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  MODELS: {
    'meta-llama/llama-4-maverick-17b-128e-instruct': 'Llama 3.3 70B',
    'meta-llama/llama-3.1-8b-instant': 'Llama 3.1 8B',
    'qwen/qwen3-32b': 'Qwen 3 32B',
    'meta-llama/llama-guard-4-12b': 'GPT-OSS 120B',
  },
  DEFAULT_MODELS: {
    generate: 'meta-llama/llama-guard-4-12b',
    fix: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    autocomplete: 'meta-llama/llama-3.1-8b-instant',
    explain: 'qwen/qwen3-32b',
  },
  AI_TRIGGER: '-- ai:',
  AI_DEBOUNCE_MS: 1200,
  MAX_TOKENS: 4096,
  PLUGIN_PORT: 5500,
};

// ─── STATE ─────────────────────────────────────────────────
const STATE = {
  apiKey: '',
  history: [],
  chatMessages: [],
  currentPanel: 'chat',
  isLoading: false,
  selectedSystemPreset: null,
  projectScripts: [{ name: '', code: '' }],
  editorLineCount: 1,
  aiTriggerTimer: null,
};

// ─── LUAU SYSTEM PROMPT ────────────────────────────────────
const SYSTEM_PROMPT = `You are Eclipse COPILOT, an expert Roblox Luau developer with deep knowledge of:
- Roblox APIs, services, and best practices
- Luau language features, types, and patterns
- Game architecture: ModuleScripts, LocalScripts, ServerScripts, RemoteEvents, RemoteFunctions
- Performance optimization, memory management, and security
- Exploit prevention, server-side validation, and safe Remote usage
- DataStore, PlayerData, and persistence patterns

When generating code:
1. Always use proper Luau syntax and types
2. Include comments explaining complex logic
3. Use modular architecture when appropriate
4. Follow Roblox security best practices (never trust the client)
5. Format code cleanly with consistent indentation (tabs)

When analyzing code:
- List specific issues with line references when possible
- Categorize: ERROR, WARNING, INFO, PERFORMANCE, SECURITY
- Always suggest concrete fixes

Respond in the same language the user writes to you (Portuguese or English).`;

// ─── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadHistory();
  initSidebar();
  initEditor();
  initChat();
  initAnalyzers();
  initGenerator();
  initSettings();
  initProjectAnalyzer();
  updateStatusBar();
  checkApiKey();
});

// ─── SETTINGS ──────────────────────────────────────────────
function loadSettings() {
  STATE.apiKey = localStorage.getItem('eclipse_api_key') || '';
  const fontSize = localStorage.getItem('eclipse_font_size') || '13';
  const tabSize = localStorage.getItem('eclipse_tab_size') || '2';

  const ed = document.getElementById('code-editor');
  if (ed) {
    ed.style.fontSize = fontSize + 'px';
    ed.style.tabSize = tabSize;
  }
}

function saveSettings() {
  const key = document.getElementById('setting-api-key');
  const fontSize = document.getElementById('setting-font-size');
  const tabSize = document.getElementById('setting-tab-size');
  const port = document.getElementById('setting-plugin-port');

  if (key) { STATE.apiKey = key.value.trim(); localStorage.setItem('eclipse_api_key', STATE.apiKey); }
  if (fontSize) { localStorage.setItem('eclipse_font_size', fontSize.value); document.getElementById('code-editor').style.fontSize = fontSize.value + 'px'; }
  if (tabSize) { localStorage.setItem('eclipse_tab_size', tabSize.value); document.getElementById('code-editor').style.tabSize = tabSize.value; }
  if (port) CONFIG.PLUGIN_PORT = parseInt(port.value);

  updateStatusBar();
  checkApiKey();
  showToast('Settings saved!', 'success');
}

function initSettings() {
  const keyInput = document.getElementById('setting-api-key');
  if (keyInput) {
    keyInput.value = STATE.apiKey;
    keyInput.addEventListener('change', saveSettings);
    keyInput.addEventListener('blur', saveSettings);
  }

  const fontInput = document.getElementById('setting-font-size');
  if (fontInput) { fontInput.value = localStorage.getItem('eclipse_font_size') || '13'; fontInput.addEventListener('change', saveSettings); }

  const tabInput = document.getElementById('setting-tab-size');
  if (tabInput) { tabInput.value = localStorage.getItem('eclipse_tab_size') || '2'; tabInput.addEventListener('change', saveSettings); }

  document.getElementById('btn-clear-history')?.addEventListener('click', clearHistory);
  document.getElementById('btn-clear-all-history')?.addEventListener('click', clearHistory);
  document.getElementById('btn-export-settings')?.addEventListener('click', exportSettings);
}

function exportSettings() {
  const data = {
    fontSize: localStorage.getItem('eclipse_font_size') || '13',
    tabSize: localStorage.getItem('eclipse_tab_size') || '2',
    pluginPort: CONFIG.PLUGIN_PORT,
    defaultModels: CONFIG.DEFAULT_MODELS,
  };
  downloadText(JSON.stringify(data, null, 2), 'eclipse_settings.json');
}

// ─── GROQ API ──────────────────────────────────────────────
async function askAI(prompt, modelId, systemOverride = null, onStream = null) {
  const key = STATE.apiKey || localStorage.getItem('eclipse_api_key') || '';
  if (!key) {
    showToast('API Key not set! Go to Settings.', 'error');
    throw new Error('No API key');
  }

  const body = {
    model: modelId,
    messages: [
      { role: 'system', content: systemOverride || SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    max_tokens: CONFIG.MAX_TOKENS,
    temperature: 0.7,
    stream: !!onStream,
  };

  const res = await fetch(CONFIG.GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  if (!onStream) {
    const data = await res.json();
    return data.choices[0].message.content;
  }

  // Streaming
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
    for (const line of lines) {
      const raw = line.slice(6);
      if (raw === '[DONE]') continue;
      try {
        const json = JSON.parse(raw);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) { full += delta; onStream(delta, full); }
      } catch (_) {}
    }
  }
  return full;
}

function checkApiKey() {
  const dot = document.getElementById('api-status-dot');
  const txt = document.getElementById('api-status-text');
  const hasKey = !!(STATE.apiKey || localStorage.getItem('eclipse_api_key'));
  if (dot) dot.className = 'status-dot' + (hasKey ? '' : ' offline');
  if (txt) txt.textContent = hasKey ? 'API Ready' : 'No API Key';
}

// ─── SIDEBAR ───────────────────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggle-sidebar');

  document.querySelectorAll('.nav-item[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      switchPanel(panel);
    });
  });

  toggleBtn?.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    toggleBtn.textContent = collapsed ? '▶' : '◀';
  });
}

function switchPanel(panelId) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const panel = document.getElementById('panel-' + panelId);
  const nav = document.getElementById('nav-' + panelId);

  if (panel) panel.classList.add('active');
  if (nav) nav.classList.add('active');

  STATE.currentPanel = panelId;
  const label = document.getElementById('active-panel-label');
  if (label) label.textContent = nav?.querySelector('.nav-label')?.textContent || panelId;
}

// ─── EDITOR ────────────────────────────────────────────────
function initEditor() {
  const editor = document.getElementById('code-editor');
  const lineNumbers = document.getElementById('line-numbers');

  if (!editor) return;

  updateLineNumbers();

  editor.addEventListener('input', () => {
    updateLineNumbers();
    updateEditorStatus();
    updateMinimap();
    handleAITrigger(editor);
  });

  editor.addEventListener('scroll', () => {
    if (lineNumbers) lineNumbers.scrollTop = editor.scrollTop;
    updateMinimapViewport();
  });

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const tabSize = parseInt(localStorage.getItem('eclipse_tab_size') || '2');
      const spaces = ' '.repeat(tabSize);
      editor.value = editor.value.substring(0, start) + spaces + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + tabSize;
      updateLineNumbers();
    }
    if (e.key === 'Enter') {
      setTimeout(autoIndent, 0);
    }
  });

  editor.addEventListener('click', updateEditorStatus);
  editor.addEventListener('keyup', updateEditorStatus);

  // Drag and drop
  editor.addEventListener('dragover', (e) => { e.preventDefault(); editor.style.borderColor = 'var(--neon-purple)'; });
  editor.addEventListener('dragleave', () => { editor.style.borderColor = ''; });
  editor.addEventListener('drop', (e) => {
    e.preventDefault();
    editor.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => { editor.value = ev.target.result; updateLineNumbers(); updateMinimap(); };
      reader.readAsText(file);
      const fn = document.getElementById('editor-filename');
      if (fn) fn.textContent = file.name;
    } else {
      const text = e.dataTransfer.getData('text');
      if (text) { editor.value = text; updateLineNumbers(); updateMinimap(); }
    }
  });

  // Toolbar buttons
  document.getElementById('btn-format')?.addEventListener('click', formatCode);
  document.getElementById('btn-copy-editor')?.addEventListener('click', () => copyText(editor.value));
  document.getElementById('btn-download-editor')?.addEventListener('click', () => {
    const fn = document.getElementById('editor-filename')?.textContent || 'script.luau';
    downloadText(editor.value, fn);
  });
  document.getElementById('btn-analyze-editor')?.addEventListener('click', () => {
    document.getElementById('analyzer-code').value = editor.value;
    switchPanel('analyzer');
    runAnalyzer();
  });
  document.getElementById('btn-debug-editor')?.addEventListener('click', () => {
    document.getElementById('debug-code').value = editor.value;
    switchPanel('debug');
    runDebug();
  });
}

function updateLineNumbers() {
  const editor = document.getElementById('code-editor');
  const lineNumbers = document.getElementById('line-numbers');
  if (!editor || !lineNumbers) return;

  const lines = editor.value.split('\n');
  STATE.editorLineCount = lines.length;
  lineNumbers.innerHTML = lines.map((_, i) => `<div class="line-num">${i + 1}</div>`).join('');

  const lc = document.getElementById('editor-lines-count');
  if (lc) lc.textContent = lines.length + ' lines';
}

function updateEditorStatus() {
  const editor = document.getElementById('code-editor');
  const pos = document.getElementById('editor-cursor-pos');
  if (!editor || !pos) return;

  const before = editor.value.substring(0, editor.selectionStart);
  const lines = before.split('\n');
  pos.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
}

function updateMinimap() {
  const editor = document.getElementById('code-editor');
  const miniContent = document.getElementById('minimap-content');
  if (miniContent) miniContent.textContent = editor?.value || '';
}

function updateMinimapViewport() {
  const editor = document.getElementById('code-editor');
  const viewport = document.getElementById('minimap-viewport');
  const minimap = document.getElementById('editor-minimap');
  if (!editor || !viewport || !minimap) return;

  const ratio = editor.scrollTop / (editor.scrollHeight || 1);
  const visibleRatio = editor.clientHeight / (editor.scrollHeight || 1);
  viewport.style.top = (ratio * minimap.clientHeight) + 'px';
  viewport.style.height = (visibleRatio * minimap.clientHeight) + 'px';
}

function autoIndent() {
  const editor = document.getElementById('code-editor');
  if (!editor) return;
  const pos = editor.selectionStart;
  const text = editor.value;
  const lines = text.substring(0, pos).split('\n');
  const prevLine = lines[lines.length - 2] || '';
  const indent = prevLine.match(/^(\s*)/)[1];
  const keywords = /\b(then|do|function|repeat|else|elseif)\s*$|\{$/;

  let extraIndent = '';
  const tabSize = parseInt(localStorage.getItem('eclipse_tab_size') || '2');
  if (keywords.test(prevLine.trim()) || prevLine.trim().endsWith('{')) {
    extraIndent = ' '.repeat(tabSize);
  }

  if (extraIndent) {
    const before = text.substring(0, pos);
    const after = text.substring(pos);
    editor.value = before + extraIndent + after;
    editor.selectionStart = editor.selectionEnd = pos + extraIndent.length;
  }

  updateLineNumbers();
}

function formatCode() {
  const editor = document.getElementById('code-editor');
  if (!editor || !editor.value.trim()) return;
  const tabSize = parseInt(localStorage.getItem('eclipse_tab_size') || '2');
  let lines = editor.value.split('\n');
  let indent = 0;
  const tab = ' '.repeat(tabSize);
  const opens = /\b(then|do|function|repeat|else|elseif)\s*$|\{$/;
  const closes = /^\s*(end|until|else|elseif|\})/;

  lines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (closes.test(trimmed)) indent = Math.max(0, indent - 1);
    const result = tab.repeat(indent) + trimmed;
    if (opens.test(trimmed)) indent++;
    return result;
  });

  editor.value = lines.join('\n');
  updateLineNumbers();
  showToast('Code formatted!', 'success');
}

// ─── AI TRIGGER (-- ai:) ───────────────────────────────────
function handleAITrigger(editor) {
  clearTimeout(STATE.aiTriggerTimer);
  STATE.aiTriggerTimer = setTimeout(async () => {
    const text = editor.value;
    const cursor = editor.selectionStart;
    const lines = text.substring(0, cursor).split('\n');
    const currentLine = lines[lines.length - 1];

    if (!currentLine.trim().startsWith(CONFIG.AI_TRIGGER)) return;

    const request = currentLine.trim().slice(CONFIG.AI_TRIGGER.length).trim();
    if (!request || request.length < 3) return;

    const modelId = localStorage.getItem('eclipse_model_autocomplete') || CONFIG.DEFAULT_MODELS.autocomplete;

    try {
      showToast('AI autocomplete generating...', 'info');
      const generated = await askAI(
        `Generate Luau code for: "${request}". Only return the code, no explanations. No markdown, no code fences.`,
        modelId
      );

      const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
      const lineEnd = text.indexOf('\n', cursor);
      const endPos = lineEnd === -1 ? text.length : lineEnd;

      const newCode = '\n-- Generated by Eclipse COPILOT\n' + generated.trim() + '\n';
      editor.value = text.substring(0, endPos) + newCode + text.substring(endPos);
      editor.selectionStart = editor.selectionEnd = endPos + newCode.length;

      updateLineNumbers();
      updateMinimap();
      showToast('AI autocomplete done!', 'success');
      addToHistory({ type: 'autocomplete', prompt: request, model: modelId });
    } catch (e) {
      showToast('Autocomplete error: ' + e.message, 'error');
    }
  }, CONFIG.AI_DEBOUNCE_MS);
}

// ─── CHAT ──────────────────────────────────────────────────
function initChat() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const clearBtn = document.getElementById('clear-chat');
  const attachBtn = document.getElementById('attach-code-btn');

  sendBtn?.addEventListener('click', sendChatMessage);
  clearBtn?.addEventListener('click', clearChat);

  attachBtn?.addEventListener('click', () => {
    const code = document.getElementById('code-editor')?.value?.trim();
    if (!code) { showToast('Editor is empty!', 'warning'); return; }
    const inp = document.getElementById('chat-input');
    if (inp) inp.value += `\n\`\`\`luau\n${code}\n\`\`\``;
    updateTokenCounter();
    inp?.focus();
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    if (e.key === 'Enter' && e.shiftKey) { setTimeout(() => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 150) + 'px'; }, 0); }
  });

  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    updateTokenCounter();
  });

  // Suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (input) input.value = prompt;
      sendChatMessage();
    });
  });
}

function updateTokenCounter() {
  const input = document.getElementById('chat-input');
  const counter = document.getElementById('token-counter');
  if (!input || !counter) return;
  const est = Math.round(input.value.length / 4);
  counter.textContent = `~${est} tokens`;
  counter.className = 'token-counter' + (est > 3000 ? ' danger' : est > 1500 ? ' warning' : '');
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const model = document.getElementById('chat-model-select')?.value || CONFIG.DEFAULT_MODELS.explain;

  if (!input?.value.trim() || STATE.isLoading) return;

  const prompt = input.value.trim();
  input.value = '';
  input.style.height = 'auto';
  updateTokenCounter();

  // Hide welcome
  const welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.style.display = 'none';

  // Add user message
  appendChatMessage('user', prompt);

  // Add typing indicator
  const typingId = appendTypingIndicator();

  STATE.isLoading = true;
  document.getElementById('send-btn').disabled = true;

  try {
    let fullResponse = '';
    const msgId = 'msg-' + Date.now();

    const typingEl = document.getElementById(typingId);
    if (typingEl) {
      typingEl.id = msgId;
      typingEl.querySelector('.message-body').innerHTML = '';
    }

    await askAI(prompt, model, null, (delta, full) => {
      fullResponse = full;
      const bodyEl = document.getElementById(msgId)?.querySelector('.message-body');
      if (bodyEl) bodyEl.innerHTML = formatMessageContent(full);
      scrollChatToBottom();
    });

    // Finalize message
    const bodyEl = document.getElementById(msgId)?.querySelector('.message-body');
    if (bodyEl) bodyEl.innerHTML = formatMessageContent(fullResponse);

    // Update model badge
    const header = document.getElementById(msgId)?.querySelector('.message-model');
    if (header) header.textContent = CONFIG.MODELS[model] || model;

    addToHistory({ type: 'chat', prompt, model, response: fullResponse.substring(0, 200) });
    scrollChatToBottom();

  } catch (e) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) {
      typingEl.querySelector('.message-body').innerHTML = `<span style="color:var(--neon-red)">Error: ${e.message}</span>`;
    }
  } finally {
    STATE.isLoading = false;
    document.getElementById('send-btn').disabled = false;
  }
}

function appendChatMessage(role, content, model = '') {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const isUser = role === 'user';
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.innerHTML = `
    <div class="message-avatar">${isUser ? '👤' : '🤖'}</div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-name">${isUser ? 'You' : 'Eclipse COPILOT'}</span>
        <span class="message-time">${time}</span>
        ${model ? `<span class="message-model">${CONFIG.MODELS[model] || model}</span>` : ''}
      </div>
      <div class="message-body">${isUser ? escapeHtml(content) : formatMessageContent(content)}</div>
    </div>`;

  container.appendChild(el);
  scrollChatToBottom();
  return el.id;
}

function appendTypingIndicator() {
  const container = document.getElementById('chat-messages');
  const id = 'typing-' + Date.now();
  const el = document.createElement('div');
  el.className = 'message assistant';
  el.id = id;
  el.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-name">Eclipse COPILOT</span>
        <span class="message-model">thinking...</span>
      </div>
      <div class="message-body">
        <div class="typing-indicator"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
      </div>
    </div>`;
  container.appendChild(el);
  scrollChatToBottom();
  return id;
}

function formatMessageContent(text) {
  if (!text) return '';

  // Escape HTML first
  let html = text;

  // Code blocks (```lang\n...\n```)
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang || 'luau';
    const escaped = escapeHtml(code.trim());
    return `<div class="message-code-block">
      <div class="code-block-header">
        <span class="lang-tag">${language}</span>
        <div class="code-block-actions">
          <button class="btn btn-ghost btn-icon" onclick="copyText(\`${code.replace(/`/g,'\\`')}\`)" title="Copy">📋</button>
          <button class="btn btn-ghost btn-icon" onclick="sendCodeToEditor(\`${code.replace(/`/g,'\\`')}\`)" title="Send to Editor">📝</button>
          <button class="btn btn-ghost btn-icon" onclick="downloadText(\`${code.replace(/`/g,'\\`')}\`,'script.luau')" title="Download">⬇️</button>
        </div>
      </div>
      <div class="code-block-body">${escaped}</div>
    </div>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-elevated);padding:1px 5px;border-radius:3px;font-family:\'JetBrains Mono\',monospace;font-size:11px;">$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Bullet lists
  html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin:10px 0 5px;font-size:13px;color:var(--text-primary)">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 6px;font-size:14px;color:var(--neon-purple-bright)">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 style="margin:14px 0 8px;font-size:15px;color:var(--neon-blue-bright)">$1</h2>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  return '<p>' + html + '</p>';
}

function scrollChatToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function clearChat() {
  const container = document.getElementById('chat-messages');
  if (container) container.innerHTML = '';
  const welcome = document.getElementById('chat-welcome');
  if (welcome) { welcome.style.display = ''; container?.appendChild(welcome); }
  STATE.chatMessages = [];
}

// ─── SEND CODE TO EDITOR ───────────────────────────────────
function sendCodeToEditor(code) {
  const editor = document.getElementById('code-editor');
  if (!editor) return;
  editor.value = code;
  updateLineNumbers();
  updateMinimap();
  switchPanel('editor');
  showToast('Code sent to editor!', 'success');
}

// ─── ANALYZERS ─────────────────────────────────────────────
function initAnalyzers() {
  // Script Analyzer
  document.getElementById('btn-run-analyzer')?.addEventListener('click', runAnalyzer);
  document.getElementById('btn-paste-from-editor-analyzer')?.addEventListener('click', () => pasteFromEditor('analyzer-code'));
  document.getElementById('btn-clear-analyzer')?.addEventListener('click', () => clearAnalyzer('analyzer-code', 'analyzer-results'));

  // Exploit Scanner
  document.getElementById('btn-run-exploit')?.addEventListener('click', runExploitScan);
  document.getElementById('btn-paste-from-editor-exploit')?.addEventListener('click', () => pasteFromEditor('exploit-code'));
  document.getElementById('btn-clear-exploit')?.addEventListener('click', () => clearAnalyzer('exploit-code', 'exploit-results'));

  // Refactor
  document.getElementById('btn-run-refactor')?.addEventListener('click', runRefactor);
  document.getElementById('btn-paste-from-editor-refactor')?.addEventListener('click', () => pasteFromEditor('refactor-code'));
  document.getElementById('btn-clear-refactor')?.addEventListener('click', () => clearAnalyzer('refactor-code', 'refactor-results'));

  // Debug
  document.getElementById('btn-run-debug')?.addEventListener('click', runDebug);
  document.getElementById('btn-paste-from-editor-debug')?.addEventListener('click', () => pasteFromEditor('debug-code'));
  document.getElementById('btn-clear-debug')?.addEventListener('click', () => clearAnalyzer('debug-code', 'debug-results'));
}

function pasteFromEditor(targetId) {
  const code = document.getElementById('code-editor')?.value?.trim();
  const target = document.getElementById(targetId);
  if (!code) { showToast('Editor is empty!', 'warning'); return; }
  if (target) { target.value = code; showToast('Pasted from editor!', 'success'); }
}

function clearAnalyzer(inputId, resultsId) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (input) input.value = '';
  if (results) results.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><h4>Cleared</h4></div>';
}

async function runAnalyzer() {
  const code = document.getElementById('analyzer-code')?.value?.trim();
  const model = document.getElementById('analyzer-model-select')?.value || CONFIG.DEFAULT_MODELS.fix;
  const resultsEl = document.getElementById('analyzer-results');

  if (!code) { showToast('Paste a script first!', 'warning'); return; }
  setResultsLoading(resultsEl, 'Analyzing script...');

  const prompt = `Analyze this Luau script for a Roblox game. Find and report:
1. Syntax errors or runtime errors
2. Bad practices (global variables, deprecated APIs)
3. Memory leaks (events not disconnected, tables growing unboundedly)
4. Heavy loops or performance issues
5. Code quality improvements

Format your response as a JSON array of issues like:
[{"type":"ERROR"|"WARNING"|"INFO"|"PERFORMANCE","title":"...","description":"...","fix":"..."}]

Script:
\`\`\`luau
${code}
\`\`\`

Return ONLY the JSON array, no other text.`;

  try {
    const response = await askAI(prompt, model);
    const issues = parseJSONSafe(response, []);
    renderAnalysisResults(resultsEl, issues, code, model);
    addToHistory({ type: 'analyze', prompt: 'Script Analysis', model });
  } catch (e) {
    resultsEl.innerHTML = errorCard(e.message);
  }
}

async function runExploitScan() {
  const code = document.getElementById('exploit-code')?.value?.trim();
  const model = document.getElementById('exploit-model-select')?.value || CONFIG.DEFAULT_MODELS.fix;
  const resultsEl = document.getElementById('exploit-results');

  if (!code) { showToast('Paste a script first!', 'warning'); return; }
  setResultsLoading(resultsEl, 'Scanning for exploits...');

  const prompt = `Scan this Roblox Luau script for security vulnerabilities. Check for:
1. RemoteEvents that trust client data without validation
2. RemoteFunctions that trust client return values
3. Server-side scripts doing game:GetService("Players").LocalPlayer (only valid in LocalScript)
4. Missing server-side validation of user input
5. Exposed datastores or currency manipulation risks
6. exploitable patterns (godmode, infinite money, etc.)

Format your response as a JSON array:
[{"type":"CRITICAL"|"HIGH"|"MEDIUM"|"LOW","title":"...","description":"...","line":"...","fix":"..."}]

Script:
\`\`\`luau
${code}
\`\`\`

Return ONLY the JSON array.`;

  try {
    const response = await askAI(prompt, model);
    const issues = parseJSONSafe(response, []);
    renderExploitResults(resultsEl, issues);
    addToHistory({ type: 'exploit', prompt: 'Exploit Scan', model });
  } catch (e) {
    resultsEl.innerHTML = errorCard(e.message);
  }
}

async function runRefactor() {
  const code = document.getElementById('refactor-code')?.value?.trim();
  const model = document.getElementById('refactor-model-select')?.value || CONFIG.DEFAULT_MODELS.fix;
  const resultsEl = document.getElementById('refactor-results');

  if (!code) { showToast('Paste a script first!', 'warning'); return; }
  setResultsLoading(resultsEl, 'Refactoring script...');

  const prompt = `Refactor this Luau script to:
1. Improve readability with better variable names and comments
2. Split large functions into smaller, focused ones
3. Extract repeated logic into reusable functions or ModuleScripts
4. Remove dead code (unused variables, unreachable code)
5. Apply proper OOP if appropriate
6. Use local variables instead of globals

First provide a brief explanation of the changes made, then the refactored code.

Script:
\`\`\`luau
${code}
\`\`\``;

  try {
    const response = await askAI(prompt, model);
    renderTextResult(resultsEl, response, 'Refactored Script');
    addToHistory({ type: 'refactor', prompt: 'Script Refactor', model });
  } catch (e) {
    resultsEl.innerHTML = errorCard(e.message);
  }
}

async function runDebug() {
  const code = document.getElementById('debug-code')?.value?.trim();
  const model = document.getElementById('debug-model-select')?.value || CONFIG.DEFAULT_MODELS.fix;
  const resultsEl = document.getElementById('debug-results');

  if (!code) { showToast('Paste a script first!', 'warning'); return; }
  setResultsLoading(resultsEl, 'Debugging script...');

  const prompt = `Debug this Luau script. For each bug found:
1. Identify the exact error or problem
2. Explain why it's a bug and what it causes
3. Show the corrected code

Then provide the COMPLETE corrected script at the end.

Script:
\`\`\`luau
${code}
\`\`\``;

  try {
    const response = await askAI(prompt, model);
    renderTextResult(resultsEl, response, 'Debug Report');
    addToHistory({ type: 'debug', prompt: 'Auto Debug', model });
  } catch (e) {
    resultsEl.innerHTML = errorCard(e.message);
  }
}

// ─── RENDER HELPERS ────────────────────────────────────────
function setResultsLoading(el, msg) {
  if (!el) return;
  el.innerHTML = `<div class="empty-state">
    <div class="loading-spinner"></div>
    <p style="margin-top:12px;color:var(--text-secondary)">${msg}</p>
  </div>`;
}

function renderAnalysisResults(el, issues, code, model) {
  if (!el) return;

  if (!issues.length) {
    el.innerHTML = `<div class="result-card success">
      <div class="result-title"><span class="severity-icon">✅</span> No Issues Found</div>
      <div class="result-desc">Your script looks clean! No errors, bad practices, or performance issues detected.</div>
    </div>`;
    return;
  }

  const typeMap = { ERROR: 'error', WARNING: 'warning', PERFORMANCE: 'warning', INFO: 'info' };
  const iconMap = { ERROR: '🔴', WARNING: '🟠', PERFORMANCE: '⚡', INFO: '🔵' };

  el.innerHTML = `<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary)">${issues.length} issue(s) found by ${CONFIG.MODELS[model] || model}</div>` +
    issues.map(issue => `
    <div class="result-card ${typeMap[issue.type] || 'info'}">
      <div class="result-title">
        <span class="severity-icon">${iconMap[issue.type] || 'ℹ️'}</span>
        <span>${issue.type || 'INFO'}: ${escapeHtml(issue.title || 'Issue')}</span>
      </div>
      <div class="result-desc">${escapeHtml(issue.description || '')}</div>
      ${issue.fix ? `<div class="result-fix">${escapeHtml(issue.fix)}</div>` : ''}
    </div>`).join('');
}

function renderExploitResults(el, issues) {
  if (!el) return;

  if (!issues.length) {
    el.innerHTML = `<div class="result-card success">
      <div class="result-title"><span class="severity-icon">✅</span> No Vulnerabilities Found</div>
      <div class="result-desc">Script passed the exploit scan. No obvious security issues detected.</div>
    </div>`;
    return;
  }

  const typeMap = { CRITICAL: 'error', HIGH: 'error', MEDIUM: 'warning', LOW: 'info' };
  const iconMap = { CRITICAL: '🚨', HIGH: '🔴', MEDIUM: '🟠', LOW: '🟡' };

  el.innerHTML = `<div style="margin-bottom:12px;font-size:12px;color:var(--neon-red)">${issues.length} security issue(s) found</div>` +
    issues.map(issue => `
    <div class="result-card ${typeMap[issue.type] || 'warning'}">
      <div class="result-title">
        <span class="severity-icon">${iconMap[issue.type] || '⚠️'}</span>
        <span>${issue.type || 'MEDIUM'}: ${escapeHtml(issue.title || 'Issue')}</span>
        ${issue.line ? `<span style="font-size:10px;color:var(--text-muted)">Line ${issue.line}</span>` : ''}
      </div>
      <div class="result-desc">${escapeHtml(issue.description || '')}</div>
      ${issue.fix ? `<div class="result-fix">${escapeHtml(issue.fix)}</div>` : ''}
    </div>`).join('');
}

function renderTextResult(el, text, title) {
  if (!el) return;
  el.innerHTML = `<div class="result-card info">
    <div class="result-title"><span class="severity-icon">📋</span> ${title}</div>
    <div class="result-desc">${formatMessageContent(text)}</div>
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button class="btn btn-secondary" onclick="copyText(\`${text.replace(/`/g,'\\`')}\`)">📋 Copy</button>
      <button class="btn btn-secondary" onclick="sendCodeToEditor(extractFirstCodeBlock(\`${text.replace(/`/g,'\\`')}\`))">📝 Send to Editor</button>
      <button class="btn btn-secondary" onclick="downloadText(\`${text.replace(/`/g,'\\`')}\`,'result.luau')">⬇️ Download</button>
    </div>
  </div>`;
}

function errorCard(msg) {
  return `<div class="result-card error">
    <div class="result-title"><span class="severity-icon">❌</span> Error</div>
    <div class="result-desc">${escapeHtml(msg)}</div>
  </div>`;
}

function extractFirstCodeBlock(text) {
  const match = text.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  return match ? match[1].trim() : text;
}

// ─── PROJECT ANALYZER ──────────────────────────────────────
let projectScriptCount = 1;

function initProjectAnalyzer() {
  document.getElementById('btn-add-project-script')?.addEventListener('click', addProjectScript);
  document.getElementById('btn-run-project')?.addEventListener('click', runProjectAnalyzer);
  document.getElementById('btn-clear-project')?.addEventListener('click', () => {
    document.getElementById('project-scripts-list').innerHTML = '';
    projectScriptCount = 0;
    addProjectScript();
    document.getElementById('project-results').innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><h4>Cleared</h4></div>`;
  });
}

function addProjectScript() {
  const list = document.getElementById('project-scripts-list');
  if (!list) return;
  const idx = projectScriptCount++;
  const entry = document.createElement('div');
  entry.className = 'project-script-entry';
  entry.dataset.index = idx;
  entry.innerHTML = `
    <div class="project-script-header">
      <input type="text" placeholder="Script name (e.g., ServerScriptService/GameManager)" />
      <button class="btn-icon" onclick="this.closest('.project-script-entry').remove()" title="Remove">✕</button>
    </div>
    <textarea placeholder="-- Paste script code here..."></textarea>`;
  list.appendChild(entry);
}

window.removeProjectScript = function(idx) {
  document.querySelector(`.project-script-entry[data-index="${idx}"]`)?.remove();
};

async function runProjectAnalyzer() {
  const entries = document.querySelectorAll('.project-script-entry');
  const resultsEl = document.getElementById('project-results');

  const scripts = [];
  entries.forEach(entry => {
    const name = entry.querySelector('input')?.value?.trim() || 'Unknown Script';
    const code = entry.querySelector('textarea')?.value?.trim() || '';
    if (code) scripts.push({ name, code });
  });

  if (!scripts.length) { showToast('Add at least one script!', 'warning'); return; }
  setResultsLoading(resultsEl, 'Analyzing project architecture...');

  const model = CONFIG.DEFAULT_MODELS.explain;
  const scriptsText = scripts.map(s => `### ${s.name}\n\`\`\`luau\n${s.code}\n\`\`\``).join('\n\n');

  const prompt = `Analyze this Roblox project consisting of ${scripts.length} scripts. Provide:
1. Architecture overview and how scripts interact
2. Issues in the overall architecture
3. Redundant or duplicate code across scripts
4. Missing components (e.g., missing RemoteEvents, missing error handling)
5. Concrete improvement suggestions with priority (HIGH/MEDIUM/LOW)

Scripts:
${scriptsText}`;

  try {
    const response = await askAI(prompt, model);
    renderTextResult(resultsEl, response, `Project Analysis — ${scripts.length} scripts`);
    addToHistory({ type: 'project', prompt: `Project Analysis (${scripts.length} scripts)`, model });
  } catch (e) {
    resultsEl.innerHTML = errorCard(e.message);
  }
}

// ─── SYSTEM GENERATOR ──────────────────────────────────────
const SYSTEM_PROMPTS = {
  pet: 'Create a complete pet system for Roblox including: PetModule (ModuleScript with pet data, equip/unequip logic), ServerScript (pet spawning, saving with DataStore), LocalScript (UI for pet display, animations), RemoteEvents (EquipPet, UnequipPet, HatchEgg). Include egg hatching with rarity system.',
  inventory: 'Create a complete inventory system for Roblox including: InventoryModule (ModuleScript), ServerScript (item pickup, validation, DataStore saving), LocalScript (inventory UI with grid layout), RemoteEvents (AddItem, RemoveItem, UseItem). Support item stacking and categories.',
  combat: 'Create a complete combat system for Roblox including: CombatModule (ModuleScript with damage calculation, status effects), ServerScript (hit validation, health management), LocalScript (attack inputs, combo system, cooldown UI), RemoteEvents (Attack, TakeDamage, ApplyEffect).',
  skills: 'Create a complete skill/ability system for Roblox including: SkillModule (ModuleScript with skill tree, XP system), ServerScript (skill activation server-side, effect application), LocalScript (skill bar UI, keybinds, cooldown display), RemoteEvents (UseSkill, LevelUpSkill).',
  leaderboard: 'Create a complete leaderboard system for Roblox including: LeaderboardModule (ModuleScript with OrderedDataStore), ServerScript (data saving/loading, ranking calculation), LocalScript (leaderboard UI with animations, top 10 display), RemoteEvents (UpdateLeaderboard). Auto-refresh every 60 seconds.',
  shop: 'Create a complete shop system for Roblox including: ShopModule (ModuleScript with item catalog, purchase validation), ServerScript (currency management, purchase processing), LocalScript (shop UI with categories, item previews, buy button), RemoteEvents (BuyItem, GetCurrency).',
  trading: 'Create a complete player-to-player trading system for Roblox including: TradeModule (ModuleScript), ServerScript (trade session management, item exchange), LocalScript (trade UI with accept/decline, item selection), RemoteEvents (SendTradeRequest, AcceptTrade, DeclineTrade, AddItemToTrade).',
  quest: 'Create a complete quest system for Roblox including: QuestModule (ModuleScript with quest definitions, progress tracking), ServerScript (quest assignment, completion checking, DataStore), LocalScript (quest log UI, progress bars), RemoteEvents (AssignQuest, UpdateProgress, CompleteQuest).',
};

function initGenerator() {
  document.querySelectorAll('.system-preset').forEach(preset => {
    preset.addEventListener('click', () => {
      document.querySelectorAll('.system-preset').forEach(p => p.classList.remove('selected'));
      preset.classList.add('selected');
      STATE.selectedSystemPreset = preset.dataset.system;
    });
  });

  document.getElementById('btn-generate-system')?.addEventListener('click', runSystemGenerator);
  document.getElementById('btn-clear-generator')?.addEventListener('click', () => {
    document.querySelectorAll('.system-preset').forEach(p => p.classList.remove('selected'));
    STATE.selectedSystemPreset = null;
    const custom = document.getElementById('generator-custom');
    if (custom) custom.value = '';
    document.getElementById('generator-results').innerHTML = `<div class="empty-state"><div class="empty-icon">⚡</div><h4>Cleared</h4></div>`;
  });
}

async function runSystemGenerator() {
  const model = document.getElementById('generator-model-select')?.value || CONFIG.DEFAULT_MODELS.generate;
  const customText = document.getElementById('generator-custom')?.value?.trim();
  const resultsEl = document.getElementById('generator-results');

  let systemRequest = customText;
  if (!systemRequest && STATE.selectedSystemPreset) {
    systemRequest = SYSTEM_PROMPTS[STATE.selectedSystemPreset];
  }

  if (!systemRequest) { showToast('Select a preset or describe a system!', 'warning'); return; }
  setResultsLoading(resultsEl, 'Generating complete game system...');

  const prompt = `${systemRequest}

Provide:
1. Brief architecture overview
2. Complete code for each script (clearly labeled with filename and script type)
3. Setup instructions
4. Recommended folder structure in Explorer

Make the code production-ready, well-commented, with proper error handling and security (server-side validation).`;

  try {
    const response = await askAI(prompt, model);
    renderTextResult(resultsEl, response, 'Generated Game System');
    addToHistory({ type: 'generate', prompt: systemRequest.substring(0, 80), model });
    showToast('System generated!', 'success');
  } catch (e) {
    resultsEl.innerHTML = errorCard(e.message);
  }
}

// ─── HISTORY ───────────────────────────────────────────────
function loadHistory() {
  try {
    STATE.history = JSON.parse(localStorage.getItem('eclipse_history') || '[]');
  } catch { STATE.history = []; }
  renderHistory();
}

function addToHistory(entry) {
  const item = {
    id: Date.now(),
    ...entry,
    time: new Date().toISOString(),
  };
  STATE.history.unshift(item);
  if (STATE.history.length > 100) STATE.history = STATE.history.slice(0, 100);
  localStorage.setItem('eclipse_history', JSON.stringify(STATE.history));

  const count = document.getElementById('history-count');
  if (count) count.textContent = STATE.history.length;

  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;

  const count = document.getElementById('history-count');
  if (count) count.textContent = STATE.history.length;

  if (!STATE.history.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h4>No History Yet</h4><p>Your conversations and prompts will appear here.</p></div>`;
    return;
  }

  const typeIcon = { chat: '💬', analyze: '🔍', exploit: '🛡️', debug: '🐛', refactor: '🔧', generate: '⚡', project: '📂', autocomplete: '✨' };

  list.innerHTML = STATE.history.map(item => `
    <div class="history-item" onclick="loadHistoryItem(${item.id})">
      <span class="history-icon">${typeIcon[item.type] || '📋'}</span>
      <div class="history-info">
        <div class="history-prompt">${escapeHtml(item.prompt || 'Untitled')}</div>
        <div class="history-meta">
          <span>${item.type}</span>
          <span>${CONFIG.MODELS[item.model] || item.model || ''}</span>
          <span>${new Date(item.time).toLocaleString('pt-BR')}</span>
        </div>
      </div>
      <button class="history-delete" onclick="event.stopPropagation();deleteHistoryItem(${item.id})" title="Delete">✕</button>
    </div>`).join('');
}

window.loadHistoryItem = function(id) {
  const item = STATE.history.find(h => h.id === id);
  if (!item) return;
  if (item.type === 'chat') {
    const input = document.getElementById('chat-input');
    if (input) input.value = item.prompt;
    switchPanel('chat');
  } else if (item.type === 'analyze') {
    switchPanel('analyzer');
  } else if (item.type === 'generate') {
    switchPanel('generator');
  }
};

window.deleteHistoryItem = function(id) {
  STATE.history = STATE.history.filter(h => h.id !== id);
  localStorage.setItem('eclipse_history', JSON.stringify(STATE.history));
  renderHistory();
};

function clearHistory() {
  STATE.history = [];
  localStorage.removeItem('eclipse_history');
  renderHistory();
  showToast('History cleared!', 'success');
}

// ─── STATUS BAR ────────────────────────────────────────────
function updateStatusBar() {
  const key = STATE.apiKey || localStorage.getItem('eclipse_api_key');
  const modelEl = document.getElementById('statusbar-model');
  const activeModelName = document.getElementById('active-model-name');
  const modelName = CONFIG.MODELS[CONFIG.DEFAULT_MODELS.fix] || 'Llama 3.3 70B';

  if (modelEl) modelEl.textContent = modelName;
  if (activeModelName) activeModelName.textContent = modelName;

  // Sync selector to statusbar
  const chatSel = document.getElementById('chat-model-select');
  if (chatSel) {
    chatSel.addEventListener('change', () => {
      const selected = CONFIG.MODELS[chatSel.value] || chatSel.value;
      if (activeModelName) activeModelName.textContent = selected;
      if (modelEl) modelEl.textContent = selected;
    });
  }
}

// ─── TOAST NOTIFICATIONS ───────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

// ─── UTILITIES ─────────────────────────────────────────────
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success')).catch(() => showToast('Copy failed', 'error'));
}

window.copyText = copyText;
window.downloadText = downloadText;
window.sendCodeToEditor = sendCodeToEditor;
window.extractFirstCodeBlock = extractFirstCodeBlock;

function downloadText(text, filename = 'script.luau') {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded!', 'success');
}

function parseJSONSafe(text, fallback = []) {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(text);
  } catch { return fallback; }
}

// ─── PLUGIN SERVER SIMULATION ──────────────────────────────
// The Roblox Studio plugin uses HttpService:PostAsync to localhost.
// Since browsers can't run an HTTP server directly, we expose a
// global handler that can be triggered by a local proxy script.
window.ECLIPSE_PLUGIN_HANDLER = async function(payload) {
  const { prompt, code, action } = payload;
  const model = CONFIG.DEFAULT_MODELS.fix;

  let finalPrompt = prompt || '';
  if (code) finalPrompt += `\n\`\`\`luau\n${code}\n\`\`\``;
  if (action === 'fix') finalPrompt = `Fix this Luau script:\n\`\`\`luau\n${code}\n\`\`\``;
  if (action === 'analyze') finalPrompt = `Analyze this Luau script for errors and improvements:\n\`\`\`luau\n${code}\n\`\`\``;
  if (action === 'generate') finalPrompt = `Generate Luau code for: ${prompt}`;
  if (action === 'explain') finalPrompt = `Explain this Luau script:\n\`\`\`luau\n${code}\n\`\`\``;

  try {
    return await askAI(finalPrompt, model);
  } catch (e) {
    return 'Error: ' + e.message;
  }
};

// Log plugin endpoint info
console.log('%cEclipse COPILOT Plugin Bridge', 'color:#a855f7;font-weight:bold;font-size:14px');
console.log(`Plugin endpoint: window.ECLIPSE_PLUGIN_HANDLER({ action, prompt, code })`);
console.log('For Roblox Studio integration, use a local proxy server on port', CONFIG.PLUGIN_PORT);

// ─── KEYBOARD SHORTCUTS ────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); switchPanel('chat'); }
  if ((e.ctrlKey || e.metaKey) && e.key === '2') { e.preventDefault(); switchPanel('editor'); }
  if ((e.ctrlKey || e.metaKey) && e.key === '3') { e.preventDefault(); switchPanel('analyzer'); }
  if ((e.ctrlKey || e.metaKey) && e.key === '4') { e.preventDefault(); switchPanel('exploit'); }
  if ((e.ctrlKey || e.metaKey) && e.key === '5') { e.preventDefault(); switchPanel('generator'); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); document.getElementById('toggle-sidebar')?.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (STATE.currentPanel === 'editor') { const code = document.getElementById('code-editor')?.value; downloadText(code || '', 'script.luau'); } }
});
