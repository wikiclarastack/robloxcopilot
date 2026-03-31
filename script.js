// Recupera a chave do navegador (Segurança total contra Secret Scanning)
let API_KEY = localStorage.getItem('eclipse_key') || "";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${view}`).classList.remove('hidden');
}

function showTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
}

function saveAPIKey() {
    const val = document.getElementById('api-key-input').value;
    localStorage.setItem('eclipse_key', val);
    API_KEY = val;
    updateStatus();
}

function updateStatus() {
    const light = document.getElementById('status-light');
    if (API_KEY.startsWith('gsk_')) {
        light.classList.add('online');
    } else {
        light.classList.remove('online');
    }
}

async function generate(action = null) {
    if (!API_KEY) return alert("Configure sua API Key nas Settings primeiro!");
    
    const promptField = document.getElementById('prompt-input');
    const outputField = document.getElementById('code-output');
    const loader = document.getElementById('loader');
    const model = document.getElementById('model-select').value;

    loader.classList.remove('hidden');
    outputField.value = "-- Gerando código de elite...";

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { 
                        role: "system", 
                        content: "Você é o EclipseCopilot. Retorne APENAS código Luau Roblox otimizado. Use task.wait() e nunca use wait(). Sem explicações." 
                    },
                    { role: "user", content: action ? `${action}: ${promptField.value}` : promptField.value }
                ],
                temperature: 0.1
            })
        });

        const data = await response.json();
        const code = data.choices[0].message.content.replace(/```lua|```/g, "").trim();
        outputField.value = code;
    } catch (e) {
        outputField.value = "-- Erro na conexão. Verifique sua chave.";
    } finally {
        loader.classList.add('hidden');
    }
}

function runAction(type) { generate(type); }
function copyCode() { navigator.clipboard.writeText(document.getElementById('code-output').value); alert("Copiado!"); }

window.onload = () => {
    document.getElementById('api-key-input').value = API_KEY;
    updateStatus();
};
