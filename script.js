document.addEventListener("DOMContentLoaded", () => {
  const CSV_FILENAME = "Devay Chatbot 1 QA.csv"; // place in same folder
  let qaData = [];

  const chatIcon = document.getElementById("chat-icon");
  const chatContainer = document.getElementById("devbay-chat");
  const closeBtn = document.getElementById("close-chat");
  const chatBox = document.getElementById("chat-box");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");

  const normalize = s => (s || "").toLowerCase().trim();

  // OPEN / CLOSE CHAT with slide + pop animation
  const openChat = () => {
    chatContainer.classList.add("chat-visible");
    chatContainer.style.transform = "translateY(20px) scale(1.05)";
    setTimeout(() => { chatContainer.style.transform = "translateY(0) scale(1)"; }, 50);
    userInput.focus();
    if (chatBox.children.length === 0)
      showBotMessage("👋 Hi — I'm the Devbay Assistant. Ask me anything about Devbay!");
  };

  const closeChat = () => chatContainer.classList.remove("chat-visible");
  chatIcon.addEventListener("click", openChat);
  closeBtn.addEventListener("click", closeChat);

  // Load CSV
  async function loadCsv() {
    try {
      const res = await fetch(CSV_FILENAME, { cache: "no-store" });
      if (!res.ok) throw new Error("CSV not found");
      const text = await res.text();
      parseCSV(text);
    } catch (e) {
      console.error("Failed to load CSV:", e);
      showBotMessage("⚠️ Failed to load Q&A data from CSV.");
    }
  }

  // Robust CSV parser
  function parseCSV(text) {
    const rows = [];
    let cur = "", col = [], inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { col.push(cur); cur = ""; continue; }
      if ((ch === '\n' || ch === '\r') && !inQuotes) {
        col.push(cur); rows.push(col); col = []; cur = "";
        if (ch === '\r' && text[i + 1] === '\n') i++; continue;
      }
      cur += ch;
    }
    if (cur || col.length) { col.push(cur); rows.push(col); }

    if (rows.length < 2) return;
    const header = rows[0].map(h => (h || "").toLowerCase());
    const qIdx = header.findIndex(h => h.includes("question")) || 0;
    const aIdx = header.findIndex(h => h.includes("answer")) || 1;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      qaData.push({ question: normalize(r[qIdx]), answer: r[aIdx] || "" });
    }
  }

  // ---------- 🔍 Fuzzy Matching Logic (Hybrid + Suggestions) ----------
  function levenshtein(a, b) {
    const dp = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + cost  // substitution
        );
      }
    }
    return dp[a.length][b.length];
  }

  function fuzzyScore(q, text) {
    const levDist = levenshtein(q, text);
    const maxLen = Math.max(q.length, text.length);
    const levScore = 1 - levDist / maxLen;

    const wordsA = q.split(/\s+/);
    const wordsB = text.split(/\s+/);
    const overlap = wordsA.filter(w => wordsB.includes(w)).length / wordsA.length;

    return (levScore * 0.6) + (overlap * 0.4);
  }

  function findAnswer(userQ) {
    const q = normalize(userQ);
    const scored = qaData.map(item => ({
      ...item,
      score: fuzzyScore(q, normalize(item.question))
    }));

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3); // top 3 matches

    const best = top[0];
    if (!best || best.score < 0.45)
      return { answer: "🤖 Sorry, I couldn't find a matching answer.", suggestions: [] };

    const suggestions = top
      .filter(x => x.score > 0.35 && x !== best)
      .map(x => x.question);

    return { answer: best.answer, suggestions };
  }
  // -------------------------------------------------------------------

  // Typing indicator
  function showTyping() {
    const t = document.createElement("div");
    t.className = "typing";
    t.id = "__typing";
    t.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    chatBox.appendChild(t);
    chatBox.scrollTop = chatBox.scrollHeight;
    return t;
  }

  function hideTyping() {
    const t = document.getElementById("__typing");
    if (t) t.remove();
  }

  // Character-by-character typing
  async function typeBotCharByChar(text) {
    const msg = document.createElement("div");
    msg.className = "message bot";
    chatBox.appendChild(msg);

    for (let char of text) {
      msg.innerHTML += char;
      chatBox.scrollTop = chatBox.scrollHeight;
      await new Promise(r => setTimeout(r, 30)); // 30ms per character
    }
  }

  // Show bot message with typing indicator
  async function showBotMessage(text) {
    const typingEl = showTyping();
    await new Promise(r => setTimeout(r, 500)); // thinking delay
    hideTyping();
    await typeBotCharByChar(text);
  }

  // 💡 Show suggestion buttons
  function showSuggestions(suggestions) {
    if (!suggestions || suggestions.length === 0) return;
    const wrap = document.createElement("div");
    wrap.className = "message bot";
    wrap.innerHTML = "<b>💡 Did you mean:</b><br>";

    suggestions.forEach(s => {
      const btn = document.createElement("button");
      btn.textContent = s;
      btn.style.margin = "4px 4px 0 0";
      btn.style.padding = "6px 10px";
      btn.style.border = "1px solid #0b74ff";
      btn.style.borderRadius = "8px";
      btn.style.background = "#eef2ff";
      btn.style.cursor = "pointer";
      btn.style.color = "#0b74ff";
      btn.onclick = () => {
        userInput.value = s;
        handleSend();
      };
      wrap.appendChild(btn);
    });
    chatBox.appendChild(wrap);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Handle user input
  async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    const userMsg = document.createElement("div");
    userMsg.className = "message user";
    userMsg.textContent = text;
    chatBox.appendChild(userMsg);
    chatBox.scrollTop = chatBox.scrollHeight;

    userInput.value = "";
    const { answer, suggestions } = findAnswer(text);
    await showBotMessage(answer);
    showSuggestions(suggestions);
  }

  sendBtn.addEventListener("click", handleSend);
  userInput.addEventListener("keydown", e => { if (e.key === "Enter") handleSend(); });

  loadCsv();
});
