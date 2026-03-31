let KEY = localStorage.getItem('eclipse_key') || "";
const API = "https://api.groq.com/openai/v1/chat/completions";

function switchView(v) {
    document.querySelectorAll('.view').forEach(e => e.classList.add('hidden'));
    document.getElementById(`view-${v}`).classList.remove('hidden');
}

function showTab(t) {
    document.querySelectorAll('.tab').forEach(e => e.classList.remove('active'));
    document.querySelectorAll('.s-nav').forEach(e => e.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

function saveKey() {
    const val = document.getElementById('api-key-input').value;
    localStorage.setItem('eclipse_key', val);
    KEY = val;
    checkStatus();
}

function checkStatus() {
    const s = document.getElementById('api-status');
    KEY.startsWith('gsk_') ? s.classList.add('on') : s.classList.remove('on');
}

async function generate(act = null) {
    if(!KEY) return alert("Coloque sua Key nas Configurações!");

    const input = document.getElementById('p-input');
    const output = document.getElementById('p-output');
    const loader = document.getElementById('loader');
    const model = document.getElementById('model-select').value;

    loader.classList.remove('hidden');
    
    try {
        const res = await fetch(API, {
            method: "POST",
            headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: "Você é o EclipseCopilot. Escreva APENAS código Luau Roblox. Sem comentários, sem explicações." },
                    { role: "user", content: act ? `${act} este código: ${input.value}` : input.value }
                ]
            })
        });

        const data = await res.json();
        output.value = data.choices[0].message.content.replace(/```lua|```/g, "").trim();
    } catch (err) {
        output.value = "-- Erro na API. Verifique sua Key.";
    } finally {
        loader.classList.add('hidden');
    }
}

function runAction(a) { generate(a); }
function copyCode() { navigator.clipboard.writeText(document.getElementById('p-output').value); }

window.onload = () => {
    document.getElementById('api-key-input').value = KEY;
    checkStatus();
};
