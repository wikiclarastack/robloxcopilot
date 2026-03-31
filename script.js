const API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Carregar Chave da API Salva (Local)
document.getElementById('api-key').value = localStorage.getItem('groq_key') || "";
updateApiStatus();

// Referências do Editor
const editor = document.getElementById('code-editor');
const responseField = document.getElementById('response-editor');
const lineNumbersInput = document.getElementById('line-numbers');
const aiLoading = document.getElementById('ai-loading');

// Listener para atualização automática de números de linhas e tokens
editor.addEventListener('input', () => {
    updateLineNumbers();
    updateTokenCount();
});

// Manipulação do Navegador e Tabs
function switchDashboardTab(tabId) {
    document.querySelectorAll('.dashboard-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dashboard-sidebar .nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`dashboard-${tabId}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

// Ativa o Painel quando clica nos botões
document.querySelectorAll('.dashboard-btn, .hero-btns .primary-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('dashboard').classList.remove('hidden-init');
        document.getElementById('about').style.height = 'auto'; // Ajusta hero para scrollar
        switchDashboardTab('editor'); // Abre o editor por padrão
    });
});

// Funções de Interface
function updateLineNumbers() {
    const lines = editor.value.split('\n').length;
    lineNumbersInput.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');
}

function updateTokenCount() {
    const text = editor.value;
    // Aproximação grosseira: 1 token ~ 4 caracteres em código
    const tokens = Math.ceil(text.length / 4); 
    document.getElementById('token-counter').innerText = tokens;
}

function saveApiKey() {
    const key = document.getElementById('api-key').value.trim();
    if (key) {
        localStorage.setItem('groq_key', key);
        alert("API Key salva localmente no navegador.");
        updateApiStatus();
    }
}

function updateApiStatus() {
    const key = localStorage.getItem('groq_key');
    const light = document.getElementById('api-status-light');
    if (key && key.startsWith('gsk_')) {
        light.className = "status-online";
    } else {
        light.className = "status-offline";
    }
}

function copyResponseCode() {
    navigator.clipboard.writeText(responseField.value);
}

function clearEditor() {
    editor.value = "";
    updateLineNumbers();
    updateTokenCount();
}

// Lógica de Integração com a Groq Cloud
async function askEclipseIA(prompt) {
    const key = localStorage.getItem('groq_key');
    if (!key) {
        alert("ERRO: Por favor, configure sua Groq API Key nas Configurações do Painel.");
        switchDashboardTab('settings');
        return null;
    }

    aiLoading.classList.remove('hidden');
    responseField.value = ""; // Limpa a resposta anterior

    const codeContext = editor.value;

    const requestBody = {
        model: "llama3-70b-8192", // Modelo poderoso e gratuito no momento
        messages: [
            {
                role: "system", 
                content: `Você é o EclipseCopilot, uma IA especializada em Roblox Luau. 
                Siga estritamente as melhores práticas de Roblox (Task library, StreamingEnabled, Attributes).
                Análise o contexto do código fornecido e gere apenas o código funcional e otimizado. 
                Se necessário, adicione breves comentários -- explicativos em português no código gerado.
                NÃO use blocos de marcação Markdown ou introduções, apenas o código puro.`
            },
            {
                role: "user", 
                content: `CONTEXTO DO SCRIPT (LUAU):\n${codeContext}\n\nSOLICITAÇÃO: ${prompt}`
            }
        ],
        temperature: 0.3 // Baixa temperatura para resultados mais consistentes
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Groq API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error("Erro na requisição:", error);
        return `-- ERRO DE CONEXÃO COM A IA:\n-- Verifique sua API Key e conexão com a internet.\n-- ${error.message}`;
    } finally {
        aiLoading.classList.add('hidden');
    }
}

// Funções de Ação Rápida (Tools)
async function quickAction(action) {
    if (!editor.value.trim()) {
        alert("Cole algum código Luau no editor primeiro.");
        return;
    }

    let prompt = "";
    switch(action) {
        case 'Fix Script': prompt = "Analise o script abaixo em busca de erros de sintaxe ou lógicos. Forneça o script corrigido e funcional."; break;
        case 'Optimize': prompt = "Otimize este script Luau para melhor performance no Roblox, garantindo que não quebre a lógica existente."; break;
        case 'Explain': prompt = "Explique como este script funciona, adicionando breves comentários -- explicativos nas linhas principais."; break;
        case 'Refactor': prompt = "Refatore este código para usar padrões mais modernos (ex: Task library ao invés de wait(), modularização sugerida)."; break;
    }

    const result = await askEclipseIA(prompt);
    if (result) {
        responseField.value = result;
    }
}

// Inicialização
updateLineNumbers();
updateTokenCount();
