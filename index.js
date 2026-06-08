const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const CONFIG = {
  PAGE_ACCESS_TOKEN: (process.env.PAGE_ACCESS_TOKEN || '').trim(),
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "viral_allure_webhook_2026",
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  PAGE_ID: process.env.PAGE_ID,
  PORT: process.env.PORT || 3000,
};

/* ---------------- AI ---------------- */

const SYSTEM_PROMPT = `
You are a warm social media manager for Viral Allure.
Rules:
- 2-3 lines max
- emotional tone
- 1-2 emojis max
- always end with a question
- same language as user
- never say AI or bot
`;

async function generateReply(text) {
  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text }
        ],
        temperature: 0.9,
        max_tokens: 120
      },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("Groq error:", err.message);
    return null;
  }
}

/* ---------------- FACEBOOK REPLY ---------------- */

async function replyToComment(commentId, message) {
  try {
    if (!CONFIG.PAGE_ACCESS_TOKEN) {
      console.error("Missing PAGE_ACCESS_TOKEN");
      return false;
    }

    await axios.post(
      `https://graph.facebook.com/v25.0/${commentId}/comments`,
      null,
      {
        params: {
          message,
          access_token: CONFIG.PAGE_ACCESS_TOKEN
        }
      }
    );

    console.log("✅ Replied:", commentId);
    return true;

  } catch (err) {
    console.error("Reply error:", err.response?.data || err.message);
    return false;
  }
}

/* ---------------- WEBHOOK VERIFY ---------------- */

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === CONFIG.VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/* ---------------- WEBHOOK MAIN ---------------- */

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;

  if (!body.object || body.object !== 'page') return;

  for (const entry of body.entry) {
    for (const change of entry.changes || []) {

      if (change.field === 'feed') {
        const value = change.value;

        // ONLY NEW COMMENTS
        if (value.item === 'comment' && value.verb === 'add') {

          const commentText = value.message;
          const commentId = value.comment_id;

          if (!commentText || !commentId) return;

          // avoid self reply
          if (value.from?.id === CONFIG.PAGE_ID) return;

          console.log("💬 New comment:", commentText);

          try {
            const reply = await generateReply(commentText);

            if (!reply) return;

            await new Promise(r => setTimeout(r, 4000)); // small delay

            await replyToComment(commentId, reply);

          } catch (e) {
            console.error("Webhook handling error:", e.message);
          }
        }
      }
    }
  }
});

/* ---------------- STATUS ---------------- */

app.get('/', (req, res) => {
  res.json({
    status: "Webhook Only Bot Running",
    mode: "REAL-TIME",
    time: new Date().toISOString()
  });
});

/* ---------------- START ---------------- */

app.listen(CONFIG.PORT, () => {
  console.log("🔥 Webhook-only bot running on port", CONFIG.PORT);
});
