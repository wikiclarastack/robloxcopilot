/**
 * ⚡ EclipseCopilot — Bridge Server
 * 
 * Servidor local que faz a ponte entre o Site e o Plugin do Roblox Studio.
 * 
 * Fluxo:
 *   [Site] → POST /push-scripts → [Este servidor] ← GET /poll (Plugin Roblox)
 *                                        ↓
 *                              Plugin aplica os scripts
 * 
 * Porta padrão: 3001
 * Autor: EclipseCopilot
 */

const http = require('http');
const PORT = 3001;

// Fila de scripts pendentes para o plugin consumir
let pendingQueue = [];
// Log de eventos
let eventLog = [];
// Status do plugin (última vez que fez poll)
let lastPluginPing = null;

function log(type, message, data) {
  const entry = {
    time: new Date().toISOString(),
    type, // 'info' | 'success' | 'error' | 'plugin'
    message,
    data: data || null,
  };
  eventLog.unshift(entry);
  if (eventLog.length > 100) eventLog.pop();
  const icon = { info: 'ℹ', success: '✓', error: '✗', plugin: '🔌' }[type] || '·';
  console.log(`[${entry.time.slice(11,19)}] ${icon} ${message}`);
}

function sendJSON(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch(e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url;
  const method = req.method;

  // ── CORS preflight ──────────────────────────────────────
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ══════════════════════════════════════════════════════
  //  SITE ENDPOINTS
  // ══════════════════════════════════════════════════════

  /**
   * POST /push-scripts
   * Recebe do site os scripts gerados e coloca na fila para o plugin.
   * 
   * Body: {
   *   scripts: [{ name, source, scriptType, serviceName }],
   *   prompt: string,
   *   provider: string,
   *   model: string
   * }
   */
  if (url === '/push-scripts' && method === 'POST') {
    try {
      const body = await readBody(req);
      if (!body.scripts || !Array.isArray(body.scripts)) {
        return sendJSON(res, 400, { ok: false, error: 'Campo "scripts" ausente ou inválido.' });
      }

      const job = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        receivedAt: new Date().toISOString(),
        prompt: body.prompt || '',
        provider: body.provider || 'desconhecido',
        model: body.model || '',
        scripts: body.scripts,
        status: 'pending',
      };

      pendingQueue.push(job);
      log('success', `Novo job recebido do site: ${job.scripts.length} script(s) | provider: ${job.provider}`, job);

      return sendJSON(res, 200, { ok: true, jobId: job.id, queued: pendingQueue.length });
    } catch (e) {
      log('error', 'Erro ao processar /push-scripts: ' + e.message);
      return sendJSON(res, 400, { ok: false, error: 'JSON inválido: ' + e.message });
    }
  }

  /**
   * GET /status
   * O site consulta se o plugin está conectado e quantos jobs estão na fila.
   */
  if (url === '/status' && method === 'GET') {
    const pluginOnline = lastPluginPing && (Date.now() - lastPluginPing < 6000);
    return sendJSON(res, 200, {
      ok: true,
      pluginOnline,
      lastPing: lastPluginPing,
      queueLength: pendingQueue.length,
      recentLogs: eventLog.slice(0, 20),
    });
  }

  // ══════════════════════════════════════════════════════
  //  PLUGIN ENDPOINTS (chamados pelo Lua via HttpService)
  // ══════════════════════════════════════════════════════

  /**
   * GET /poll
   * Plugin faz polling a cada ~2s. Se tiver job pendente, retorna e remove da fila.
   */
  if (url === '/poll' && method === 'GET') {
    lastPluginPing = Date.now();

    if (pendingQueue.length === 0) {
      return sendJSON(res, 200, { ok: true, hasJob: false });
    }

    const job = pendingQueue.shift();
    job.status = 'delivered';
    log('plugin', `Job ${job.id} entregue ao plugin (${job.scripts.length} script(s))`);

    return sendJSON(res, 200, { ok: true, hasJob: true, job });
  }

  /**
   * POST /ack
   * Plugin confirma que aplicou os scripts com sucesso.
   * Body: { jobId, applied: [scriptName], errors: [] }
   */
  if (url === '/ack' && method === 'POST') {
    try {
      const body = await readBody(req);
      log('plugin', `Plugin confirmou job ${body.jobId}: ${(body.applied||[]).join(', ')}`);
      return sendJSON(res, 200, { ok: true });
    } catch (e) {
      return sendJSON(res, 400, { ok: false, error: e.message });
    }
  }

  /**
   * POST /plugin-log
   * Plugin envia logs de erro para o servidor exibir.
   */
  if (url === '/plugin-log' && method === 'POST') {
    try {
      const body = await readBody(req);
      log(body.type || 'plugin', '[Plugin] ' + body.message);
      return sendJSON(res, 200, { ok: true });
    } catch (e) {
      return sendJSON(res, 400, { ok: false });
    }
  }

  // 404
  sendJSON(res, 404, { ok: false, error: 'Endpoint não encontrado: ' + url });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ⚡ EclipseCopilot — Bridge Server');
  console.log('  ─────────────────────────────────');
  console.log(`  🟢 Rodando em http://127.0.0.1:${PORT}`);
  console.log('');
  console.log('  Endpoints:');
  console.log(`    [Site  → Servidor] POST /push-scripts`);
  console.log(`    [Site  → Servidor] GET  /status`);
  console.log(`    [Plugin→ Servidor] GET  /poll       (a cada 2s)`);
  console.log(`    [Plugin→ Servidor] POST /ack        (confirmação)`);
  console.log('');
  console.log('  Aguardando conexões...');
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ❌ Porta ${PORT} já está em uso. Feche outro processo e tente novamente.\n`);
  } else {
    console.error('\n  ❌ Erro no servidor:', e.message, '\n');
  }
  process.exit(1);
});
