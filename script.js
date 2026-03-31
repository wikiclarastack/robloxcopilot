const API_URL = "https://api.groq.com/openai/v1/chat/completions";
let history = JSON.parse(localStorage.getItem('eclipse_history')) || [];

// Carregar API Key salva
document.getElementById('api-key').value = localStorage.getItem('groq_key') || "";

// Atualizar Números de Linhas
const editor = document.getElementById('code-editor');
const lineNumbers = document.getElementById('line-numbers');

editor.addEventListener('input', () => {
    updateLineNumbers();
    handleAutocomplete();
    updateTokenCount();
});

function updateLineNumbers() {
    const lines = editor.value.split('\n').length;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');
}

function updateTokenCount() {
    const text = editor.value + document.getElementById('user-input').value;
    const tokens = Math.ceil(text.length / 4); 
    document.getElementById('token-counter').innerText = tokens;
}

function saveKey() {
    localStorage.setItem('groq_key', document.getElementById('api-key').value);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`${tabId}-tab`).classList.add('active');
    event.currentTarget.classList.add('active');
    if(tabId === 'history') renderHistory();
}

async function askAI(prompt, contextCode = "") {
    const key = localStorage.getItem('groq_key');
    if (!key) return "ERRO: Insira sua API Key da Groq na barra lateral.";

    document.getElementById('loading-indicator').classList.remove('hidden');
    
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify({
                model: "llama3-70b-8192",
                messages: [
                    {
                        role: "system", 
                        content: "Você é o EclipseCopilot, uma IA especializada em Roblox Luau. Gere apenas código funcional, otimizado e utilize as melhores práticas (Task library, Attributes, StreamingEnabled). Se for um sistema completo, explique a estrutura de pastas."
                    },
                    {role: "user", content: `Contexto do Script:\n${contextCode}\n\nPergunta: ${prompt}`}
                ],
                temperature: 0.5
            })
        });

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        saveHistory(prompt);
        return content;
    } catch (e) {
        return "Erro ao conectar com a Groq. Verifique sua chave e conexão.";
    } finally {
        document.getElementById('loading-indicator').classList.add('hidden');
    }
}

async function handleChat() {
    const input = document.getElementById('user-input');
    const msg = input.value.trim();
    if (!msg) return;

    appendMessage(msg, 'user');
    input.value = "";
    
    const response = await askAI(msg, editor.value);
    appendMessage(response, 'ai');
}

function appendMessage(text, type) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerText = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function quickAction(action) {
    let prompt = "";
    const currentCode = editor.value;

    switch(action) {
        case 'Fix Script': prompt = "Corrija os erros deste script Luau e explique o que estava errado."; break;
        case 'Optimize': prompt = "Otimize este script para melhor performance no Roblox."; break;
        case 'Explain': prompt = "Explique detalhadamente como este script funciona."; break;
        case 'Debug': prompt = "Analise este código em busca de memory leaks ou bugs lógicos."; break;
    }

    switchTab('chat');
    appendMessage(`${action} solicitado...`, 'user');
    const res = await askAI(prompt, currentCode);
    appendMessage(res, 'ai');
}

async function handleAutocomplete() {
    const lines = editor.value.split('\n');
    const lastLine = lines[lines.length - 1];

    if (lastLine.startsWith('-- ai:')) {
        const query = lastLine.replace('-- ai:', '').trim();
        if (query.length < 5) return;

        const res = await askAI(`Complete este código ou crie o sistema solicitado: ${query}`, editor.value);
        editor.value += `\n${res}`;
        updateLineNumbers();
    }
}

function saveHistory(p) {
    history.unshift({ date: new Date().toLocaleString(), prompt: p });
    if(history.length > 20) history.pop();
    localStorage.setItem('eclipse_history', JSON.stringify(history));
}

function renderHistory() {
    const container = document.getElementById('history-list');
    container.innerHTML = history.map(h => `
        <div class="history-item" style="padding:15px; border-bottom:1px solid #222">
            <small style="color:var(--purple)">${h.date}</small>
            <p style="font-size:0.8rem; margin-top:5px">${h.prompt}</p>
        </div>
    `).join('');
}

function copyCode() {
    navigator.clipboard.writeText(editor.value);
    alert("Código copiado!");
}

function clearEditor() {
    editor.value = "";
    updateLineNumbers();
}

updateLineNumbers();
