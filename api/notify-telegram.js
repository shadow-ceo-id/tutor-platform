// Vercel Serverless Function — /api/notify-telegram
// Mengirim transkrip percakapan chatbot ke Telegram admin.
// Dipanggil saat: (1) lead baru tertangkap, (2) chat ditutup/ditinggalkan user.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId, messages, lead, trigger } = req.body;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Telegram env vars belum diset');
      return res.status(200).json({ skipped: true }); // jangan bikin chatbot error di sisi user
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(200).json({ skipped: true });
    }

    const headerLabel =
      trigger === 'lead_captured' ? '🟢 LEAD BARU MASUK' : '💬 Chat selesai';

    let text = `${headerLabel}\nSession: ${sessionId || '-'}\n\n`;

    for (const m of messages) {
      const speaker = m.role === 'user' ? '👤 User' : '🤖 Ajarin';
      // Buang blok tersembunyi (LEAD_DATA / META) dari transkrip yang dikirim ke Telegram
      const cleanContent = String(m.content)
        .replace(/<!--LEAD_DATA[\s\S]*?-->/g, '')
        .replace(/<!--META[\s\S]*?-->/g, '')
        .trim();
      if (cleanContent) {
        text += `${speaker}: ${cleanContent}\n\n`;
      }
    }

    if (lead) {
      text += `\n📋 Data terkumpul:\n`;
      text += `Nama: ${lead.nama || '-'}\n`;
      text += `WhatsApp: ${lead.whatsapp || '-'}\n`;
      text += `Kelas/Jenjang: ${lead.kelas_jenjang || '-'}\n`;
      text += `Mapel/Skill: ${lead.mapel_skill_dibutuhkan || '-'}\n`;
      text += `Lokasi: ${lead.lokasi || '-'}\n`;
      text += `Jadwal: ${lead.jadwal_diinginkan || '-'}\n`;
    }

    // Telegram batasi ~4096 karakter per pesan, potong kalau kepanjangan
    if (text.length > 3900) {
      text = text.slice(0, 3900) + '\n\n...(dipotong, transkrip lengkap ada di Supabase)';
    }

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('Gagal kirim ke Telegram:', err);
    // Tetap balikin 200 supaya tidak mengganggu pengalaman user di chatbot
    return res.status(200).json({ sent: false });
  }
};
