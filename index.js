const express = require('express');
const app = express();
app.use(express.json());

const CONFIG = {
  APP_SECRET: process.env.APP_SECRET || 'your_app_secret',
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN || 'your_page_token',
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || 'viralallure2026',
  GROQ_API_KEY: process.env.GROQ_API_KEY || 'your_groq_key',
  PAGE_ID: process.env.PAGE_ID || 'your_page_id',
};

const SYSTEM_PROMPT = `You are a warm, loving social media manager for "Viral Allure" - a Facebook page with 211K followers creating AI-generated emotional videos about veterans protesting war, massive crowds chanting for peace, government hearing disruptions, freedom and humanity messages, stadium unity moments.

Rules for responding to comments:
- Maximum 2-3 lines only
- Very warm, loving, emotional tone
- Use 1-2 emojis maximum  
- End EVERY response with ONE engaging question to bring them back
- Never sound robotic or copy-paste
- Vary your responses every time
- Write in the same language as the comment (English, French, Spanish, Haitian Creole, etc.)
- Never mention AI or that you are a bot`;

// =============================================
// GROQ AI - Jenere Repons
// =============================================
async function generateReply(commentText) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Comment to respond to: "${commentText}"` }
        ],
        max_tokens: 150,
        temperature: 0.9
      })
    });
    const data = await response.json();
    return data.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Groq error:', error);
    return null;
  }
}

// =============================================
// FACEBOOK API - Voye Repons
// =============================================
async function replyToComment(commentId, message) {
  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${commentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        access_token: CONFIG.PAGE_ACCESS_TOKEN
      })
    });
    const data = await response.json();
    if (data.error) {
      console.error('Facebook error:', data.error);
      return false;
    }
    console.log(`✅ Replied to comment ${commentId}`);
    return true;
  } catch (error) {
    console.error('Reply error:', error);
    return false;
  }
}

// =============================================
// SCANNER - Jwenn tout video sou paj la
// =============================================
async function getAllVideos() {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v25.0/${CONFIG.PAGE_ID}/videos?fields=id,title,created_time&limit=50&access_token=${CONFIG.PAGE_ACCESS_TOKEN}`
    );
    const data = await response.json();
    if (data.error) {
      console.error('Videos error:', data.error);
      return [];
    }
    return data.data || [];
  } catch (error) {
    console.error('Get videos error:', error);
    return [];
  }
}

// =============================================
// SCANNER - Jwenn kòmantè ki poko reponn
// =============================================
async function getUnansweredComments(videoId) {
  try {
    // Jwenn tout kòmantè videyo a
    const response = await fetch(
      `https://graph.facebook.com/v25.0/${videoId}/comments?fields=id,message,from,comments{id,from}&limit=100&access_token=${CONFIG.PAGE_ACCESS_TOKEN}`
    );
    const data = await response.json();
    if (data.error || !data.data) return [];

    const unanswered = [];
    
    for (const comment of data.data) {
      // Tcheke si paj la deja reponn
      const hasPageReply = comment.comments?.data?.some(
        reply => reply.from?.id === CONFIG.PAGE_ID
      );
      
      // Si pa gen repons ak si kòmantè a gen tèks
      if (!hasPageReply && comment.message && comment.from?.id !== CONFIG.PAGE_ID) {
        unanswered.push({
          id: comment.id,
          message: comment.message,
          from: comment.from?.name || 'Unknown'
        });
      }
    }
    
    return unanswered;
  } catch (error) {
    console.error('Get comments error:', error);
    return [];
  }
}

// =============================================
// SCANNER PRENSIPAL - Reponn tout kòmantè vye
// =============================================
async function scanAndReplyAll() {
  console.log('🔍 Scanning all videos for unanswered comments...');
  
  const videos = await getAllVideos();
  console.log(`📹 Found ${videos.length} videos`);
  
  let totalReplied = 0;
  let totalSkipped = 0;

  for (const video of videos) {
    console.log(`\n📹 Scanning video: ${video.id}`);
    
    const unanswered = await getUnansweredComments(video.id);
    console.log(`💬 Found ${unanswered.length} unanswered comments`);

    for (const comment of unanswered) {
      // Delay 3 segonn ant chak repons pou evite spam
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log(`\n💬 Comment from ${comment.from}: "${comment.message}"`);
      
      const reply = await generateReply(comment.message);
      if (!reply) {
        console.log('❌ Could not generate reply');
        totalSkipped++;
        continue;
      }
      
      console.log(`📝 Reply: ${reply}`);
      
      const success = await replyToComment(comment.id, reply);
      if (success) {
        totalReplied++;
      } else {
        totalSkipped++;
      }

      // Pause 10 repons — rete 1 minit pou evite rate limit
      if (totalReplied % 10 === 0 && totalReplied > 0) {
        console.log('⏸️ Pausing 60 seconds to avoid rate limit...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  }

  console.log(`\n✅ Scan complete! Replied: ${totalReplied} | Skipped: ${totalSkipped}`);
  return { totalReplied, totalSkipped };
}

// =============================================
// WEBHOOK - Kòmantè Nouvo Otomatik
// =============================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === CONFIG.VERIFY_TOKEN) {
    console.log('✅ Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  
  const body = req.body;
  if (body.object !== 'page') return;

  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      if (change.field === 'feed' && change.value.item === 'comment') {
        const comment = change.value;
        
        // Sèlman reponn kòmantè nouvo — pa repons paj la
        if (comment.verb === 'add' && comment.from?.id !== CONFIG.PAGE_ID) {
          console.log(`\n🔔 New comment: "${comment.message}"`);
          
          // Ti delay natirèl 5-15 segonn
          const delay = Math.floor(Math.random() * 10000) + 5000;
          await new Promise(resolve => setTimeout(resolve, delay));
          
          const reply = await generateReply(comment.message);
          if (reply) {
            await replyToComment(comment.comment_id, reply);
          }
        }
      }
    }
  }
});

// =============================================
// ROUTES
// =============================================

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: '🔥 ViralAllureBot is running!', 
    time: new Date().toISOString(),
    features: [
      '✅ Auto-reply new comments (webhook)',
      '✅ Scan & reply old unanswered comments'
    ]
  });
});

// Declenche scan manyèlman
app.get('/scan', async (req, res) => {
  // Sekirite — verifye token
  const token = req.query.token;
  if (token !== CONFIG.VERIFY_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  res.json({ message: '🔍 Scan started! Check server logs.' });
  
  // Kòmanse scan nan background
  scanAndReplyAll().catch(console.error);
});

// Wè status
app.get('/status', (req, res) => {
  res.json({
    bot: 'ViralAllureBot',
    page: CONFIG.PAGE_ID,
    webhook: 'active',
    scanner: 'ready',
    time: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🔥 ViralAllureBot Started!
📡 Port: ${PORT}
✅ Webhook: Ready for new comments
🔍 Scanner: Ready (call /scan?token=viralallure2026)
  `);
});
