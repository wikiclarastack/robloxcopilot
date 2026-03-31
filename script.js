// O Eclipse agora busca a chave no localStorage para não ser bloqueado pelo GitHub
let GROQ_API_KEY = localStorage.getItem('eclipse_key') || "";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

function saveKey() {
    const key = document.getElementById('groq-key-input').value.trim();
    if (key) {
        localStorage.setItem('eclipse_key', key);
        GROQ_API_KEY = key;
        checkStatus();
        alert("Configuração salva com segurança.");
    }
}

function checkStatus() {
    const indicator = document.getElementById('api-indicator');
    if (GROQ_API_KEY.startsWith('gsk_')) {
        indicator.classList.add('online');
    } else {
        indicator.classList.remove('online');
    }
}

async function generateResponse(customPrompt = null) {
    if (!GROQ_API_KEY) {
        alert("Configure sua API Key na aba de configurações primeiro!");
        showTab('settings');
        return;
    }

    const input = document.getElementById('ai-input').value;
    const output = document.getElementById('ai-output');
    const loader = document.getElementById('ai-loader');
    const model = document.getElementById('model-select').value;

    if (!input && !customPrompt) return;

    loader.classList.remove('hidden');
    
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { 
                        role: "system", 
                        content: "Você é o EclipseCopilot Elite. Escreva APENAS código Luau Roblox puro. Use a biblioteca 'task' em vez de 'wait'. Priorize performance e legibilidade." 
                    },
                    { role: "user", content: customPrompt ? `${customPrompt}: ${input}` : input }
                ],
                temperature: 0.2
            })
        });

        const data = await response.json();
        const code = data.choices[0].message.content.replace(/```lua|```/g, "").trim();
        output.value = code;
        updateLineNumbers('output');
    } catch (error) {
        output.value = "-- Erro: Verifique sua chave ou conexão.";
    } finally {
        loader.classList.add('hidden');
    }
}

function quickAction(cmd) {
    generateResponse(cmd);
}

function updateLineNumbers(type) {
    const area = document.getElementById(`ai-${type}`);
    const lines = area.value.split('\n').length;
    document.getElementById(`ln-${type}`).innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');
}

document.getElementById('ai-input').addEventListener('input', () => updateLineNumbers('input'));

function copyResult() {
    navigator.clipboard.writeText(document.getElementById('ai-output').value);
}

// Inicialização
window.onload = () => {
    document.getElementById('groq-key-input').value = GROQ_API_KEY;
    checkStatus();
    updateLineNumbers('input');
};
