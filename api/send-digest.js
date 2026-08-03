// Vercel Serverless Function — /api/send-digest
// Dipanggil oleh cron eksternal (misal cron-job.org) tiap 1 jam.
// Ambil semua chat_logs yang belum dikirim (notified=false), kelompokkan per sesi,
// kirim transkrip ke Telegram, lalu tandai sudah terkirim.

module.exports = async (req, res) => {
  const secret = req.query.secret;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!SUPABASE_URL || !SERVICE_KEY || !botToken || !chatId) {
    return res.status(500).json({ error: 'Env vars belum lengkap' });
  }

  try {
    // Ambil semua log yang belum dikirim, urut waktu
    const logsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_logs?notified=eq.false&order=created_at.asc&select=id,session_id,role,message,category,created_at`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    );

    if (!logsRes.ok) {
      const errText = await logsRes.text();
      console.error('Supabase fetch error:', errText);
      return res.status(500).json({ error: 'Gagal ambil data dari Supabase', detail: errText });
    }

    const logs = await logsRes.json();

    if (!Array.isArray(logs) || logs.length === 0) {
      return res.status(200).json({ message: 'Tidak ada chat baru' });
    }

    // Kelompokkan per session_id
    const sessions = {};
    for (const log of logs) {
      if (!sessions[log.session_id]) sessions[log.session_id] = [];
      sessions[log.session_id].push(log);
    }

    const sessionIds = Object.keys(sessions);
    let digestText = `📊 Digest chat Ajarin — ${sessionIds.length} percakapan (1 jam terakhir)\n`;
    digestText += `═══════════════════\n\n`;

    for (const sid of sessionIds) {
      const msgs = sessions[sid];
      const categories = [...new Set(msgs.map((m) => m.category).filter(Boolean))];
      digestText += `🗨️ Sesi: ${sid.slice(0, 8)}...\n`;
      if (categories.length) digestText += `Topik: ${categories.join(', ')}\n`;
      for (const m of msgs) {
        const speaker = m.role === 'user' ? '👤' : '🤖';
        digestText += `${speaker} ${m.message}\n`;
      }
      digestText += `\n───────────────────\n\n`;
    }

    // Telegram batasi ~4096 karakter, split jadi beberapa pesan kalau perlu
    const chunks = [];
    let current = '';
    for (const line of digestText.split('\n')) {
      if ((current + line + '\n').length > 3800) {
        chunks.push(current);
        current = '';
      }
      current += line + '\n';
    }
    if (current.trim()) chunks.push(current);

    // Kirim tiap chunk ke Telegram — dan CEK hasil responnya, jangan diabaikan
    for (const chunk of chunks) {
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      });
      const tgData = await tgRes.json();
      if (!tgData.ok) {
        console.error('Telegram API error:', tgData);
        return res.status(500).json({ error: 'Telegram gagal kirim', detail: tgData });
      }
    }

    // Tandai semua log yang barusan dikirim sebagai notified
    const idsToMark = logs.map((l) => l.id);
    const markRes = await fetch(`${SUPABASE_URL}/rest/v1/chat_logs?id=in.(${idsToMark.join(',')})`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ notified: true }),
    });

    if (!markRes.ok) {
      const errText = await markRes.text();
      console.error('Gagal update notified flag:', errText);
      // Telegram sudah terlanjur kekirim, tapi kasih tau supaya nggak double-check terus
      return res.status(200).json({
        sent: sessionIds.length,
        messages: logs.length,
        warning: 'Terkirim ke Telegram, tapi gagal update status notified di Supabase',
        detail: errText,
      });
    }

    return res.status(200).json({ sent: sessionIds.length, messages: logs.length });
  } catch (err) {
    console.error('Digest error:', err);
    return res.status(500).json({ error: 'Gagal kirim digest', detail: String(err) });
  }
};
