const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

// ============================================
// KONFIGIRASYON — METE KLE OU YO ICI
// ============================================
const CONFIG = {
  APP_SECRET: 'METE_APP_SECRET_OU_ICI',
  PAGE_ACCESS_TOKEN: 'METE_PAGE_ACCESS_TOKEN_OU_ICI',
  VERIFY_TOKEN: 'viral_allure_webhook_2026',
  GROQ_API_KEY: 'METE_GROQ_API_KEY_OU_ICI',
  PORT: process.env.PORT || 3000
};

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// ============================================
// WEBHOOK VERIFICATION
// ============================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === CONFIG.VERIFY_TOKEN) {
    console.log('✅ Webhook verifye avèk siksè!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============================================
// RECEVOIR KÒMANTÈ YO
// ============================================
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'page') return;

  for (const entry of body.entry) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field === 'feed' && change.value.item === 'comment') {
        const comment = change.value;
        
        // Pa reponn kòmantè nou yo menm
        if (comment.from && comment.from.id === entry.id) continue;
        
        console.log(`💬 Nouvo kòmantè: ${comment.message}`);
        
        // Jenere repons ak Groq AI
        const reply = await generateReply(comment.message);
        
        // Voye repons la
        if (reply && comment.comment_id) {
          await postReply(comment.comment_id, reply);
        }
      }
    }
  }
});

// ============================================
// GROQ AI — JENERE REPONS
// ============================================
async function generateReply(commentText) {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: `You are a warm social media manager for "Viral Allure" — a Facebook page with 211K followers creating powerful AI videos about veterans protesting war, massive crowds chanting for peace, government hearing disruptions, freedom and humanity messages, and stadium unity moments.

Reply to Facebook comments following these rules:
- Maximum 2-3 lines only
- Very warm, loving, emotional tone ❤️
- End with ONE engaging question to bring them back
- Use 1-2 emojis maximum
- Never sound robotic
- Vary your responses every time
- Match the language of the comment (French→French, English→English, Spanish→Spanish)
- Never mention you are AI`
          },
          {
            role: 'user',
            content: `Reply to this Facebook comment: "${commentText}"`
          }
        ],
        max_tokens: 150,
        temperature: 0.9
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = response.data.choices[0].message.content;
    console.log(`🤖 Repons jenere: ${reply}`);
    return reply;

  } catch (error) {
    console.error('❌ Groq Error:', error.response?.data || error.message);
    return null;
  }
}

// ============================================
// VOYE REPONS SOU FACEBOOK
// ============================================
async function postReply(commentId, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v25.0/${commentId}/comments`,
      { message },
      {
        params: { access_token: CONFIG.PAGE_ACCESS_TOKEN }
      }
    );
    console.log(`✅ Repons voye avèk siksè!`);
  } catch (error) {
    console.error('❌ Facebook Error:', error.response?.data || error.message);
  }
}

// ============================================
// STATUS CHECK
// ============================================
app.get('/', (req, res) => {
  res.json({
    status: '✅ Viral Allure Bot Aktif!',
    message: 'Bot ap reponn kòmantè otomatikman',
    timestamp: new Date().toISOString()
  });
});

app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Viral Allure Bot ap kouri sou pò ${CONFIG.PORT}`);
});

module.exports = app;
