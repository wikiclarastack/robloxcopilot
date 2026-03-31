const API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Navegação
function nav(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
    if(viewId === 'dashboard') fetchModels();
}

// Configurações
function saveConfig() {
    localStorage.setItem('groq_key', document.getElementById('api-key').value);
    updateStatus();
}

function updateStatus() {
    const key = localStorage.getItem('groq_key');
    const badge = document.getElementById('api-status');
    if(key && key.length > 30) {
        badge.innerText = "● Ready";
        badge.style.color = "#10b981";
    } else {
        badge.innerText = "● Offline";
        badge.style.color = "#ef4444";
    }
}

// Buscar Modelos dinamicamente
async function fetchModels() {
    const key = localStorage.getItem('groq_key');
    if(!key) return;

    try {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
            headers: { "Authorization": `Bearer ${key}` }
        });
        const data = await res.json();
        const select = document.getElementById('model-select');
        select.innerHTML = data.data
            .filter(m => m.id.includes('llama') || m.id.includes('mixtral'))
            .map(m => `<option value="${m.id}">${m.id}</option>`).join('');
    } catch(e) { console.log("Erro ao carregar modelos"); }
}

// Executar IA
async function runAI(prefix = "") {
    const key = localStorage.getItem('groq_key');
    const input = document.getElementById('input-editor').value;
    if(!key || !input) return alert("API Key ou Input faltando!");

    const loader = document.getElementById('loader');
    const output = document.getElementById('output-editor');
    const model = document.getElementById('model-select').value;

    loader.classList.remove('hidden');

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: "You are EclipseCopilot, an expert Roblox Luau developer. Return ONLY code or concise technical explanations. No yapping." },
                    { role: "user", content: `${prefix}\n\nCode/Prompt: ${input}` }
                ],
                temperature: 0.2
            })
        });

        const data = await response.json();
        output.value = data.choices[0].message.content;
        updateLineNumbers('output');
    } catch (err) {
        output.value = "Erro na requisição. Verifique sua chave.";
    } finally {
        loader.classList.add('hidden');
    }
}

// Utilitários
function updateLineNumbers(type) {
    const val = document.getElementById(`${type}-editor`).value;
    const lines = val.split('\n').length;
    document.getElementById(`ln-${type}`).innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');
}

document.getElementById('input-editor').addEventListener('input', () => updateLineNumbers('input'));

function clearAll() {
    document.getElementById('input-editor').value = "";
    document.getElementById('output-editor').value = "";
    updateLineNumbers('input');
    updateLineNumbers('output');
}

// Init
window.onload = () => {
    document.getElementById('api-key').value = localStorage.getItem('groq_key') || "";
    updateStatus();
    updateLineNumbers('input');
};
