const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

axios.defaults.timeout = 10000;

const CONFIG = {
  APP_SECRET: process.env.APP_SECRET,
  PAGE_ACCESS_TOKEN: (process.env.PAGE_ACCESS_TOKEN || '').trim(),
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "viral_allure_webhook_2026",
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  PAGE_ID: process.env.PAGE_ID,
  PORT: process.env.PORT || 3000,
};

const SYSTEM_PROMPT = `
You are a warm, loving social media manager for "Viral Allure".

Rules:
- 2–3 lines max
- emotional tone
- 1–2 emojis max
- ALWAYS end with a question
- same language as comment
- never say you're AI
`;

async function generateReply(commentText) {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: commentText }
        ],
        max_tokens: 120,
        temperature: 0.9
      },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("Groq error:", err.message);
    return null;
  }
}

/* ---------------- FACEBOOK FUNCTIONS ---------------- */

async function replyToComment(commentId, message) {
  try {
    if (!CONFIG.PAGE_ACCESS_TOKEN) {
      console.error("❌ Missing PAGE_ACCESS_TOKEN");
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

    console.log(`✅ Replied: ${commentId}`);
    return true;

  } catch (err) {
    console.error("Reply error:", err.response?.data || err.message);
    return false;
  }
}

async function getAllVideos() {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/v25.0/${CONFIG.PAGE_ID}/videos`,
      {
        params: {
          fields: 'id',
          limit: 10,
          access_token: CONFIG.PAGE_ACCESS_TOKEN
        }
      }
    );

    return res.data?.data || [];
  } catch (err) {
    console.error("Get videos error:", err.response?.data || err.message);
    return [];
  }
}

async function getUnansweredComments(videoId) {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/v25.0/${videoId}/comments`,
      {
        params: {
          fields: 'id,message,from',
          limit: 25,
          access_token: CONFIG.PAGE_ACCESS_TOKEN
        }
      }
    );

    const comments = res.data?.data || [];

    return comments.filter(c =>
      c.message &&
      c.from?.id !== CONFIG.PAGE_ID
    );

  } catch (err) {
    console.error("Get comments error:", err.response?.data || err.message);
    return [];
  }
}

/* ---------------- SCANNER ---------------- */

async function scanAndReplyAll() {
  console.log("🚀 Starting scan...");

  const token = CONFIG.PAGE_ACCESS_TOKEN;
  if (!token) {
    console.error("❌ No PAGE_ACCESS_TOKEN found");
    return;
  }

  const videos = await getAllVideos();
  console.log(`📹 Videos found: ${videos.length}`);

  let replied = 0;
  let skipped = 0;

  for (const video of videos) {
    try {
      const comments = await getUnansweredComments(video.id);
      console.log(`💬 Video ${video.id}: ${comments.length}`);

      for (const c of comments) {
        await new Promise(r => setTimeout(r, 2000));

        const reply = await generateReply(c.message);
        if (!reply) {
          skipped++;
          continue;
        }

        const ok = await replyToComment(c.id, reply);
        ok ? replied++ : skipped++;

        if (replied > 0 && replied % 8 === 0) {
          console.log("⏸ cooling down...");
          await new Promise(r => setTimeout(r, 50000));
        }
      }

    } catch (e) {
      console.error("Video error:", e.message);
    }
  }

  console.log(`✅ DONE | Replied: ${replied} | Skipped: ${skipped}`);
  return { replied, skipped };
}

/* ---------------- WEBHOOK ---------------- */

app.get('/webhook', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === CONFIG.VERIFY_TOKEN
  ) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
});

/* ---------------- ROUTES ---------------- */

app.get('/', (req, res) => {
  res.json({
    status: "ViralAllureBot running",
    page: CONFIG.PAGE_ID
  });
});

app.get('/scan', async (req, res) => {
  if (req.query.token !== CONFIG.VERIFY_TOKEN) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  res.json({ status: "scan started" });

  scanAndReplyAll().catch(console.error);
});

app.get('/status', (req, res) => {
  res.json({
    page: CONFIG.PAGE_ID,
    token_ok: !!CONFIG.PAGE_ACCESS_TOKEN,
    groq_ok: !!CONFIG.GROQ_API_KEY
  });
});

/* ---------------- START SERVER ---------------- */

app.listen(CONFIG.PORT, () => {
  console.log(`🔥 Bot running on port ${CONFIG.PORT}`);
});
