// sidepanel.js — EmailCraft AI Core Logic

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
let state = {
  provider: 'anthropic',   // active provider
  keys: {},                // { anthropic, gemini, groq, openai }
  models: {                // selected model per provider
    anthropic: 'claude-sonnet-4-20250514',
    gemini: 'gemini-2.0-flash',
    groq: 'llama-3.3-70b-versatile',
    openai: 'gpt-4o',
  },
  userName: '',
  defaultTone: 'professional',
  pageContext: null,
  generatedEmail: '',
  generatedReply: '',
  conversationHistory: [],
  appTheme: 'obsidian',
};

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadPageContext();
  setupNavTabs();
  setupSettings();
  setupCompose();
  setupReply();
  setupTools();
  setupVault();
});

// ═══════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════
async function loadSettings() {
  const stored = await chrome.storage.local.get([
    'provider', 'providerKeys', 'providerModels', 'userName', 'defaultTone', 'appTheme'
  ]);

  state.provider    = stored.provider    || 'anthropic';
  state.keys        = stored.providerKeys  || {};
  state.models      = { ...state.models, ...(stored.providerModels || {}) };
  state.userName    = stored.userName    || '';
  state.defaultTone = stored.defaultTone || 'professional';
  state.appTheme    = stored.appTheme    || 'obsidian';

  document.body.className = state.appTheme === 'obsidian' ? '' : `theme-${state.appTheme}`;
  const themeEl = document.getElementById('appTheme');
  if (themeEl) themeEl.value = state.appTheme;

  // Fill in each provider's key & model field
  ['anthropic', 'gemini', 'groq', 'openai'].forEach(p => {
    const keyEl   = document.getElementById(`key-${p}`);
    const modelEl = document.getElementById(`model-${p}`);
    if (keyEl   && state.keys[p])   keyEl.value   = state.keys[p];
    if (modelEl && state.models[p]) modelEl.value = state.models[p];
  });

  if (state.userName) document.getElementById('userNameInput').value = state.userName;
  if (state.defaultTone) {
    document.getElementById('defaultTone').value = state.defaultTone;
    document.getElementById('composeTone').value = state.defaultTone;
  }

  // Activate the saved provider tab
  activateProviderTab(state.provider);
}

function activateProviderTab(provider) {
  document.querySelectorAll('.provider-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.provider === provider);
  });
  document.querySelectorAll('.provider-config').forEach(c => c.classList.add('hidden'));
  const cfg = document.getElementById(`config-${provider}`);
  if (cfg) cfg.classList.remove('hidden');
  state.provider = provider;
}

function setupSettings() {
  const toggle = document.getElementById('settingsToggle');
  const panel  = document.getElementById('settingsPanel');
  toggle.addEventListener('click', () => panel.classList.toggle('hidden'));

  // Provider tab switching
  document.querySelectorAll('.provider-tab').forEach(tab => {
    tab.addEventListener('click', () => activateProviderTab(tab.dataset.provider));
  });

  document.getElementById('saveSettings').addEventListener('click', async () => {
    // Collect all keys & models
    const providerKeys   = {};
    const providerModels = {};
    ['anthropic', 'gemini', 'groq', 'openai'].forEach(p => {
      const k = document.getElementById(`key-${p}`)?.value.trim();
      const m = document.getElementById(`model-${p}`)?.value;
      if (k) providerKeys[p]   = k;
      if (m) providerModels[p] = m;
    });

    const userName    = document.getElementById('userNameInput').value.trim();
    const defaultTone = document.getElementById('defaultTone').value;
    const appTheme    = document.getElementById('appTheme').value;

    state.keys        = providerKeys;
    state.models      = { ...state.models, ...providerModels };
    state.userName    = userName;
    state.defaultTone = defaultTone;
    state.appTheme    = appTheme;

    document.body.className = appTheme === 'obsidian' ? '' : `theme-${appTheme}`;

    await chrome.storage.local.set({
      provider: state.provider,
      providerKeys,
      providerModels,
      userName,
      defaultTone,
      appTheme,
    });

    const status = document.getElementById('settingsStatus');
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 2500);
    document.getElementById('composeTone').value = defaultTone;
    showToast(`${state.provider} key saved ✓`, 'success');
  });
}

// ═══════════════════════════════════════════════════════
// PAGE CONTEXT
// ═══════════════════════════════════════════════════════
async function loadPageContext() {
  const strip = document.getElementById('contextStrip');
  const titleEl = document.getElementById('contextTitle');
  const urlEl = document.getElementById('contextUrl');
  const iconEl = document.getElementById('contextIcon');
  const recipientInput = document.getElementById('recipientInput');

  try {
    const ctx = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' }, resolve);
    });

    if (!ctx || !ctx.content) {
      titleEl.textContent = 'No page content available';
      return;
    }

    state.pageContext = ctx;
    titleEl.textContent = ctx.title || 'Current Page';
    urlEl.textContent = ctx.url || '';

    // Set icon based on page type
    const icons = {
      linkedin_profile: '👤',
      job_posting: '💼',
      article: '📰',
      github: '🐱',
      gmail: '📧',
      outlook: '📧',
      generic: '📄'
    };
    iconEl.textContent = icons[ctx.pageType] || '📄';

    // Auto-fill recipient for LinkedIn
    if (ctx.pageType === 'linkedin_profile' && !recipientInput.value) {
      const nameMatch = ctx.content.match(/Name:\s*(.+)/);
      if (nameMatch) recipientInput.value = nameMatch[1].trim();
    }

  } catch (e) {
    titleEl.textContent = 'Could not read page';
  }
}

document.getElementById('refreshContext').addEventListener('click', loadPageContext);
document.getElementById('clearSessionBtn').addEventListener('click', () => {
  state.conversationHistory = [];
  state.generatedEmail = '';
  state.generatedReply = '';
  state.pageContext = null;
  document.getElementById('emailOutput').innerText = '';
  document.getElementById('replyEmailOutput').innerText = '';
  document.getElementById('outputSubjectRow').classList.add('hidden');
  document.getElementById('composeOutput').classList.add('hidden');
  document.getElementById('replyOutput').classList.add('hidden');
  document.getElementById('userPrompt').value = '';
  document.getElementById('receivedEmail').value = '';
  document.getElementById('refineInput').value = '';
  document.getElementById('contextTitle').textContent = 'Session Cleared';
  document.getElementById('contextUrl').textContent = '';
  showToast('Temporary session cleared 🧹', 'success');
});

// ═══════════════════════════════════════════════════════
// NAV TABS
// ═══════════════════════════════════════════════════════
function setupNavTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });
}

// ═══════════════════════════════════════════════════════
// MULTI-PROVIDER AI CALL
// ═══════════════════════════════════════════════════════

// Unified interface — pick provider automatically from state
async function callClaude(messages, systemPrompt, maxTokens = 1000) {
  const provider = state.provider;
  const apiKey   = state.keys[provider];
  const model    = state.models[provider];

  if (!apiKey) {
    throw new Error(`No API key for ${provider}. Open Settings ⚙ to add one.`);
  }

  switch (provider) {
    case 'anthropic': return callAnthropic(messages, systemPrompt, maxTokens, apiKey, model);
    case 'gemini':    return callGemini(messages, systemPrompt, maxTokens, apiKey, model);
    case 'groq':      return callOpenAICompat(messages, systemPrompt, maxTokens, apiKey, model, 'https://api.groq.com/openai/v1/chat/completions');
    case 'openai':    return callOpenAICompat(messages, systemPrompt, maxTokens, apiKey, model, 'https://api.openai.com/v1/chat/completions');
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Anthropic ──
async function callAnthropic(messages, systemPrompt, maxTokens, apiKey, model) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic error ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ── Google Gemini ──
async function callGemini(messages, systemPrompt, maxTokens, apiKey, model) {
  // Convert messages format
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { maxOutputTokens: maxTokens },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Gemini error ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── OpenAI-compatible (works for Groq, OpenAI, and most others) ──
async function callOpenAICompat(messages, systemPrompt, maxTokens, apiKey, model, endpoint) {
  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: allMessages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ═══════════════════════════════════════════════════════
// RAG: VAULT RETRIEVAL
// ═══════════════════════════════════════════════════════
async function getRelevantVaultItems(query, limit = 3) {
  const stored = await chrome.storage.local.get('vault');
  const vault = stored.vault || [];
  if (vault.length === 0) return '';

  // Simple keyword matching (local, private)
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  const scored = vault.map(item => {
    const text = `${item.title} ${item.category} ${item.text}`.toLowerCase();
    const score = queryWords.reduce((acc, word) => acc + (text.includes(word) ? 1 : 0), 0);
    return { ...item, score };
  }).sort((a, b) => b.score - a.score).slice(0, limit);

  const relevant = scored.filter(i => i.score > 0 || vault.length <= 3);
  if (relevant.length === 0) return '';

  const ragContext = relevant.map((item, i) =>
    `--- Writing Sample ${i + 1} (${item.category}) ---\n${item.text.substring(0, 600)}`
  ).join('\n\n');

  return `\n\n=== USER'S WRITING STYLE SAMPLES (match their voice) ===\n${ragContext}\n=== END STYLE SAMPLES ===`;
}

// ═══════════════════════════════════════════════════════
// COMPOSE TAB
// ═══════════════════════════════════════════════════════
function setupCompose() {
  document.getElementById('generateEmail').addEventListener('click', generateEmail);
  document.getElementById('generateSubjects').addEventListener('click', generateSubjects);
  document.getElementById('insertEmail').addEventListener('click', () => insertIntoCompose(document.getElementById('emailOutput').innerText));
  document.getElementById('copyEmail').addEventListener('click', () => copyText(document.getElementById('emailOutput').innerText, 'Email copied!'));
  document.getElementById('saveToVault').addEventListener('click', () => {
    const text = document.getElementById('emailOutput').innerText.trim();
    if (text) openVaultSaveModal(text);
  });
  document.getElementById('refineEmail').addEventListener('click', refineEmail);
  document.getElementById('refineInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') refineEmail();
  });
}

async function generateEmail() {
  if (!checkApiKey()) return;

  const prompt = document.getElementById('userPrompt').value.trim();
  const tone = document.getElementById('composeTone').value;
  const length = document.getElementById('composeLength').value;
  const recipient = document.getElementById('recipientInput').value.trim();
  const useCtx = document.getElementById('usePageContext').checked;

  setLoading('compose', true, 'Crafting your email…');

  try {
    const ragContext = await getRelevantVaultItems(`${prompt} ${tone} email`);

    const pageCtxText = (useCtx && state.pageContext?.content)
      ? `\n\nCURRENT PAGE CONTEXT (use this to make the email relevant):\n${state.pageContext.content.substring(0, 2000)}`
      : '';

    const recipientText = recipient ? `\nRecipient: ${recipient}` : '';
    const signOff = state.userName ? `Sign off as: ${state.userName}` : '';

    const system = `You are an expert email writer. Write emails that are natural, effective, and human.
${signOff}${ragContext}

Always respond with ONLY the email in this exact format:
SUBJECT: [subject line]

[email body]

No extra commentary, no "Here is your email:", just the email.`;

    const userMsg = `Write a ${tone}, ${length} email.${recipientText}
User's intent: ${prompt || 'Write an appropriate email based on the page context'}${pageCtxText}`;

    const result = await callClaude([{ role: 'user', content: userMsg }], system, 1200);

    // Parse subject and body
    const lines = result.trim().split('\n');
    let subject = '';
    let bodyStart = 0;

    if (lines[0].startsWith('SUBJECT:')) {
      subject = lines[0].replace('SUBJECT:', '').trim();
      bodyStart = 1;
      while (bodyStart < lines.length && lines[bodyStart].trim() === '') bodyStart++;
    }

    const body = lines.slice(bodyStart).join('\n').trim();
    state.generatedEmail = body;

    // Reset conversation for refine
    state.conversationHistory = [
      { role: 'user', content: userMsg },
      { role: 'assistant', content: result }
    ];

    // Display
    document.getElementById('emailOutput').innerText = body;
    if (subject) {
      document.getElementById('outputSubject').textContent = subject;
      document.getElementById('outputSubjectRow').classList.remove('hidden');
    } else {
      document.getElementById('outputSubjectRow').classList.add('hidden');
    }

    // Sentiment analysis
    analyzeSentimentInline(body);

    showOutput('compose');

  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading('compose', false);
  }
}

async function generateSubjects() {
  if (!checkApiKey()) return;

  const emailText = document.getElementById('emailOutput').innerText.trim();
  const prompt = document.getElementById('userPrompt').value.trim();

  const context = emailText || prompt;
  if (!context) {
    showToast('Generate an email first, or describe the email topic', 'error');
    return;
  }

  setLoading('compose', true, 'Generating subject lines…');

  try {
    const system = `You are an email subject line expert. Generate 5 compelling, varied subject lines.
Respond with ONLY 5 subject lines, one per line, no numbering, no bullets, no extra text.`;

    const result = await callClaude(
      [{ role: 'user', content: `Generate 5 subject lines for this email:\n\n${context.substring(0, 800)}` }],
      system, 300
    );

    const subjects = result.trim().split('\n').filter(s => s.trim()).slice(0, 5);
    const list = document.getElementById('subjectsList');
    list.innerHTML = '';
    subjects.forEach(s => {
      const btn = document.createElement('div');
      btn.className = 'subject-option';
      btn.textContent = s.trim();
      btn.addEventListener('click', () => {
        document.getElementById('outputSubject').textContent = s.trim();
        document.getElementById('outputSubjectRow').classList.remove('hidden');
        showToast('Subject selected!', 'success');
      });
      list.appendChild(btn);
    });

    document.getElementById('subjectsPanel').classList.remove('hidden');
    showOutput('compose');

  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading('compose', false);
  }
}

async function refineEmail() {
  const instruction = document.getElementById('refineInput').value.trim();
  if (!instruction || !state.conversationHistory.length) {
    showToast('Generate an email first', 'error');
    return;
  }

  setLoading('compose', true, 'Refining…');

  try {
    const history = [
      ...state.conversationHistory,
      { role: 'user', content: `Please refine the email: ${instruction}. Return only the updated email body (no subject prefix needed).` }
    ];

    const system = `You are an expert email writer helping refine emails. Return only the updated email body.`;
    const result = await callClaude(history, system, 1000);

    state.generatedEmail = result.trim();
    document.getElementById('emailOutput').innerText = result.trim();
    state.conversationHistory = [...history, { role: 'assistant', content: result }];
    document.getElementById('refineInput').value = '';
    analyzeSentimentInline(result.trim());

  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading('compose', false);
  }
}

function analyzeSentimentInline(text) {
  // Quick heuristic-based sentiment (local, no API call needed)
  const positive = ['happy', 'excited', 'pleased', 'delighted', 'look forward', 'appreciate', 'thank', 'great', 'excellent', 'wonderful', 'opportunity', 'glad'];
  const negative = ['unfortunately', 'regret', 'sorry', 'unable', 'problem', 'issue', 'concern', 'disappointed', 'fail', 'difficult'];
  const assertive = ['must', 'need', 'require', 'expect', 'immediately', 'urgent', 'demand', 'insist'];
  const formal = ['sincerely', 'regards', 'dear', 'pursuant', 'herewith', 'accordingly', 'therefore'];

  const lower = text.toLowerCase();
  const posScore = positive.filter(w => lower.includes(w)).length;
  const negScore = negative.filter(w => lower.includes(w)).length;
  const assertScore = assertive.filter(w => lower.includes(w)).length;
  const formalScore = formal.filter(w => lower.includes(w)).length;

  let label, color, pct;

  if (assertScore >= 2) { label = 'Assertive'; color = '#d4a853'; pct = 85; }
  else if (negScore > posScore) { label = 'Cautious / Apologetic'; color = '#c4943d'; pct = 35; }
  else if (formalScore >= 2 && posScore < 3) { label = 'Formal & Neutral'; color = '#6b9bb8'; pct = 60; }
  else if (posScore >= 3) { label = 'Warm & Positive'; color = '#5dba7d'; pct = 80; }
  else { label = 'Neutral & Professional'; color = '#8a8a8a'; pct = 55; }

  document.getElementById('sentimentValue').textContent = label;
  document.getElementById('sentimentValue').style.color = color;
  document.getElementById('sentimentFill').style.width = pct + '%';
  document.getElementById('sentimentFill').style.background = color;
  document.getElementById('sentimentBar').classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════
// SMART REPLY TAB
// ═══════════════════════════════════════════════════════
function setupReply() {
  document.getElementById('generateReply').addEventListener('click', generateReply);
  document.getElementById('insertReply').addEventListener('click', () => insertIntoCompose(document.getElementById('replyEmailOutput').innerText));
  document.getElementById('copyReply').addEventListener('click', () => copyText(document.getElementById('replyEmailOutput').innerText, 'Reply copied!'));
  document.getElementById('saveReplyToVault').addEventListener('click', () => {
    const text = document.getElementById('replyEmailOutput').innerText.trim();
    if (text) openVaultSaveModal(text);
  });
}

async function generateReply() {
  if (!checkApiKey()) return;
  const received = document.getElementById('receivedEmail').value.trim();
  if (!received) { showToast('Please paste the email you received', 'error'); return; }

  const tone = document.getElementById('replyTone').value;
  const goal = document.getElementById('replyGoal').value;
  const notes = document.getElementById('replyNotes').value.trim();

  setLoading('reply', true);

  try {
    const ragContext = await getRelevantVaultItems(`email reply ${goal}`);
    const signOff = state.userName ? `Sign off as: ${state.userName}` : '';

    const system = `You are an expert at writing email replies. Analyze the received email carefully.
${signOff}${ragContext}
Return ONLY the reply email body. No preamble. No "Here is your reply:".`;

    const content = `Write a reply to this email.
Tone: ${tone === 'match' ? 'Match the sender\'s tone' : tone}
Goal: ${goal.replace(/_/g, ' ')}
${notes ? `Additional points to include: ${notes}` : ''}

RECEIVED EMAIL:
${received}`;

    const result = await callClaude([{ role: 'user', content }], system, 1000);
    state.generatedReply = result.trim();
    document.getElementById('replyEmailOutput').innerText = result.trim();
    showOutput('reply');

  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading('reply', false);
  }
}

// ═══════════════════════════════════════════════════════
// TOOLS TAB
// ═══════════════════════════════════════════════════════
function setupTools() {
  // Accordion tool cards
  document.querySelectorAll('.tool-header').forEach(header => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling;
      const isOpen = !body.classList.contains('hidden');
      // Close all
      document.querySelectorAll('.tool-body').forEach(b => b.classList.add('hidden'));
      document.querySelectorAll('.tool-header').forEach(h => h.classList.remove('open'));
      // Toggle clicked
      if (!isOpen) {
        body.classList.remove('hidden');
        header.classList.add('open');
      }
    });
  });

  // Summarizer
  document.getElementById('summarizeChain').addEventListener('click', async () => {
    if (!checkApiKey()) return;
    const text = document.getElementById('chainInput').value.trim();
    if (!text) { showToast('Paste an email thread first', 'error'); return; }

    setLoading('summarize', true);
    try {
      const system = `You are an expert at summarizing email threads. Be concise and structured.`;
      const content = `Summarize this email thread and suggest a smart reply. Format:

**THREAD SUMMARY:**
[2-4 bullet points of key points]

**KEY DECISIONS/OUTCOMES:**
[Any decisions made or pending]

**SUGGESTED REPLY:**
[Draft a brief, appropriate reply]

THREAD:
${text.substring(0, 3000)}`;

      const result = await callClaude([{ role: 'user', content }], system, 800);
      document.getElementById('summarizeResult').textContent = result.trim();
      showToolOutput('summarize');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading('summarize', false); }
  });

  // Commitment Tracker
  document.getElementById('trackCommitments').addEventListener('click', async () => {
    if (!checkApiKey()) return;
    const text = document.getElementById('commitmentInput').value.trim();
    if (!text) { showToast('Paste an email first', 'error'); return; }

    setLoading('commitment', true);
    try {
      const system = `Extract commitments and action items from emails. Be precise and structured.`;
      const content = `Extract all commitments, promises, and action items from this email. Format as:

📌 ACTION ITEMS (things to do):
• [item 1]
• [item 2]

🤝 COMMITMENTS MADE:
• [commitment 1]

📅 DEADLINES MENTIONED:
• [any dates or timeframes]

⚠️ THINGS TO FOLLOW UP ON:
• [follow-up items]

If none in a category, write "None".

EMAIL:
${text}`;

      const result = await callClaude([{ role: 'user', content }], system, 600);
      document.getElementById('commitmentResult').textContent = result.trim();
      showToolOutput('commitment');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading('commitment', false); }
  });

  // Follow-up Drafter
  document.getElementById('draftFollowup').addEventListener('click', async () => {
    if (!checkApiKey()) return;
    const text = document.getElementById('followupInput').value.trim();
    if (!text) { showToast('Paste your original email first', 'error'); return; }

    const days = document.getElementById('followupDays').value || '5';
    const signOff = state.userName ? `Sign off as: ${state.userName}` : '';

    setLoading('followup', true);
    try {
      const ragContext = await getRelevantVaultItems('follow up email');
      const system = `You are an expert at writing gentle, effective follow-up emails. ${signOff}${ragContext}
Return ONLY the follow-up email body. No preamble.`;
      const content = `Write a polite follow-up email. It has been ${days} days since I sent the original email below with no response.
Keep it brief, warm, and non-pushy. Reference the original briefly.

ORIGINAL EMAIL:
${text}`;

      const result = await callClaude([{ role: 'user', content }], system, 600);
      document.getElementById('followupEmailOutput').innerText = result.trim();
      showToolOutput('followup');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading('followup', false); }
  });

  document.getElementById('copyFollowup').addEventListener('click', () =>
    copyText(document.getElementById('followupEmailOutput').innerText, 'Follow-up copied!'));

  // Sentiment Analyzer (tool)
  document.getElementById('analyzeSentiment').addEventListener('click', async () => {
    if (!checkApiKey()) return;
    const text = document.getElementById('sentimentInput').value.trim();
    if (!text) { showToast('Paste an email to analyze', 'error'); return; }

    setLoading('sentiment', true);
    try {
      const system = `You are an expert at analyzing email tone and sentiment. Give actionable feedback.`;
      const content = `Analyze the tone and sentiment of this email. Format:

🎭 OVERALL TONE: [one phrase]
😊 HOW IT READS: [how the recipient will likely feel reading this — 2 sentences]
✅ STRENGTHS: [what works well — 2 bullets]
⚠️ RISKS: [what might be misinterpreted — 1-2 bullets, or "None"]
💡 SUGGESTIONS: [1-2 specific improvements if any]
📊 PROFESSIONALISM SCORE: [X/10]

EMAIL:
${text}`;

      const result = await callClaude([{ role: 'user', content }], system, 500);
      document.getElementById('sentimentResult').textContent = result.trim();
      showToolOutput('sentiment');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading('sentiment', false); }
  });
}

// ═══════════════════════════════════════════════════════
// VAULT TAB (RAG)
// ═══════════════════════════════════════════════════════
function setupVault() {
  // Add section toggle
  document.getElementById('vaultAddToggle').addEventListener('click', () => {
    document.getElementById('vaultAddBody').classList.toggle('hidden');
  });

  // Save button
  document.getElementById('saveToVaultBtn').addEventListener('click', async () => {
    const title = document.getElementById('vaultTitle').value.trim();
    const category = document.getElementById('vaultCategory').value;
    const text = document.getElementById('vaultEmailText').value.trim();

    if (!title || !text) { showToast('Add a label and email text', 'error'); return; }

    await saveVaultItem({ title, category, text, date: Date.now() });
    document.getElementById('vaultTitle').value = '';
    document.getElementById('vaultEmailText').value = '';
    document.getElementById('vaultAddBody').classList.add('hidden');
    showToast('Saved to Vault ✓', 'success');
    renderVault();
  });

  // Search
  document.getElementById('vaultSearch').addEventListener('input', renderVault);

  renderVault();
}

async function saveVaultItem(item) {
  const stored = await chrome.storage.local.get('vault');
  const vault = stored.vault || [];
  vault.unshift({ id: Date.now(), ...item });
  await chrome.storage.local.set({ vault });
}

async function renderVault() {
  const stored = await chrome.storage.local.get('vault');
  const vault = stored.vault || [];
  const query = document.getElementById('vaultSearch').value.toLowerCase();
  const list = document.getElementById('vaultList');
  const empty = document.getElementById('vaultEmpty');

  const filtered = query
    ? vault.filter(i => `${i.title} ${i.category} ${i.text}`.toLowerCase().includes(query))
    : vault;

  // Remove old items
  list.querySelectorAll('.vault-item').forEach(el => el.remove());

  if (filtered.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  filtered.forEach(item => {
    const el = document.createElement('div');
    el.className = 'vault-item';
    el.innerHTML = `
      <div class="vault-item-header">
        <div class="vault-item-title">${escapeHtml(item.title)}</div>
        <div class="vault-item-cat">${item.category.replace(/_/g, ' ')}</div>
      </div>
      <div class="vault-item-preview">${escapeHtml(item.text.substring(0, 80))}…</div>
      <div class="vault-item-actions">
        <button class="btn-xs" data-copy="${item.id}">📋 Copy</button>
        <button class="btn-xs" data-use="${item.id}">↗ Use</button>
        <button class="btn-xs vault-delete" data-del="${item.id}">✕ Remove</button>
      </div>
    `;
    list.appendChild(el);
  });

  // Wire up buttons
  list.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = vault.find(i => i.id === parseInt(btn.dataset.copy));
      if (item) copyText(item.text, 'Email copied!');
    });
  });

  list.querySelectorAll('[data-use]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = vault.find(i => i.id === parseInt(btn.dataset.use));
      if (item) {
        document.getElementById('emailOutput').innerText = item.text;
        document.querySelectorAll('.nav-tab')[0].click();
        showOutput('compose');
        showToast('Email loaded from Vault', 'success');
      }
    });
  });

  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.del);
      const stored2 = await chrome.storage.local.get('vault');
      const newVault = (stored2.vault || []).filter(i => i.id !== id);
      await chrome.storage.local.set({ vault: newVault });
      renderVault();
    });
  });
}

function openVaultSaveModal(text) {
  // Switch to vault tab and pre-fill the add form
  document.querySelectorAll('.nav-tab')[3].click();
  document.getElementById('vaultAddBody').classList.remove('hidden');
  document.getElementById('vaultEmailText').value = text;
  document.getElementById('vaultTitle').focus();
  showToast('Add a label and save to Vault ↓', 'success');
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function checkApiKey() {
  if (!state.keys[state.provider]) {
    showToast(`Add your ${state.provider} API key in Settings ⚙`, 'error');
    document.getElementById('settingsPanel').classList.remove('hidden');
    return false;
  }
  return true;
}

function setLoading(section, active, text = 'Working…') {
  const loadingEl = document.getElementById(`${section}Loading`);
  const outputEl = document.getElementById(`${section}Output`);
  const btn = document.querySelector(`#tab-${section === 'compose' ? 'compose' : section === 'reply' ? 'reply' : 'tools'} .btn-primary`);

  if (loadingEl) loadingEl.classList.toggle('hidden', !active);
  if (active && outputEl) outputEl.classList.add('hidden');
  if (active && text) {
    const textEl = loadingEl?.querySelector('.loading-text');
    if (textEl) textEl.textContent = text;
  }
  if (btn) btn.disabled = active;
}

function showOutput(section) {
  const outputEl = document.getElementById(`${section}Output`);
  if (outputEl) outputEl.classList.remove('hidden');
}

function showToolOutput(tool) {
  document.getElementById(`${tool}Loading`).classList.add('hidden');
  document.getElementById(`${tool}Output`).classList.remove('hidden');
}

async function copyText(text, msg = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(msg, 'success');
  } catch {
    showToast('Copy failed — try selecting manually', 'error');
  }
}

let toastTimer;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast${type ? ' ' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function insertIntoCompose(text) {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith('chrome://')) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (textToInsert) => {
          let composeBoxes = Array.from(document.querySelectorAll('div[aria-label="Message Body"], .Am.Al.editable, [role="textbox"][contenteditable="true"]'));
          let el = composeBoxes.find(b => b.offsetParent !== null);
          if (el) {
            el.focus();
            const htmlText = textToInsert.replace(/\n/g, '<br>');
            if (!document.execCommand('insertHTML', false, htmlText)) {
              if (el.isContentEditable) {
                el.innerHTML += (el.innerHTML.endsWith('<br>') ? '' : '<br>') + htmlText;
              } else {
                el.value += '\n' + textToInsert;
              }
            }
            return { success: true };
          }
          return { success: false, error: 'Could not find an open compose box.' };
        },
        args: [text]
      });

      if (results && results[0] && results[0].result && results[0].result.success) {
        showToast('Inserted into email! ↗', 'success');
      } else {
        showToast(results[0]?.result?.error || 'Open a compose box in Gmail first.', 'error');
      }
    } catch (e) {
      showToast('Cannot access page. Try refreshing Gmail.', 'error');
    }
  } else {
    showToast('Navigate to Gmail first.', 'error');
  }
}
