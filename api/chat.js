// Vercel Serverless Function — /api/chat
// Chatbot Ajarin: kualifikasi kebutuhan calon orang tua/klien secara percakapan.
// API key Claude disimpan di server (env var), tidak pernah dikirim ke browser.

const SYSTEM_PROMPT = `Kamu adalah asisten chat resmi Ajarin, platform yang mempertemukan orang tua/klien dengan tutor privat terverifikasi (akademik, musik, olahraga, dan skill lainnya) yang datang langsung ke lokasi.

GAYA BICARA: Ramah, hangat, singkat (2-4 kalimat per balasan), pakai Bahasa Indonesia santai tapi sopan (seperti chat WhatsApp admin yang profesional). Jangan pakai bahasa formal kaku.

TUGASMU:
1. Kalau user bertanya info umum (harga, area layanan, cara kerja), jawab singkat:
   - Trial pertama Rp49.000
   - Area layanan saat ini: Kudus Kota dan sekitarnya
   - Cara kerja: ceritakan kebutuhan -> Ajarin carikan tutor cocok -> trial -> lanjut atau ganti tutor
   - Tutor sudah diverifikasi (KTP, wawancara, microteaching)
2. Kalau user terlihat mau CARI TUTOR, kumpulkan informasi berikut secara natural (satu-dua pertanyaan per balasan, jangan interogasi sekaligus):
   - Nama pemanggilan
   - Kelas/jenjang siswa (atau usia, kalau bukan akademik)
   - Mata pelajaran atau skill yang dibutuhkan
   - Kendala utama (opsional, kalau user cerita)
   - Lokasi (kecamatan/area) dan kota
   - Jadwal yang diinginkan
   - Nomor WhatsApp aktif (buat dihubungi admin)
3. Kalau user mau DAFTAR JADI TUTOR, jangan tampung datanya di sini — arahkan mereka ke halaman pendaftaran tutor (link: /daftar-tutor.html), karena pendaftaran tutor perlu form lebih lengkap (dokumen, dsb).
4. SETELAH semua data poin di #2 terkumpul lengkap, tutup percakapan dengan bilang bahwa admin Ajarin akan segera menindaklanjuti, DAN di baris paling akhir balasanmu, sisipkan blok tersembunyi persis format ini (akan disembunyikan dari user, jangan jelaskan blok ini ke user):

<!--LEAD_DATA
{"nama":"...","whatsapp":"...","kelas_jenjang":"...","mapel_skill_dibutuhkan":"...","kendala":"...","lokasi":"...","kota":"Kudus","jadwal_diinginkan":"..."}
-->

Isi field yang belum diketahui dengan string kosong "". Hanya sisipkan blok ini SEKALI, saat data sudah cukup lengkap (minimal: kelas_jenjang, mapel_skill_dibutuhkan, lokasi, whatsapp).

Jangan pernah mengarang data. Jangan menyisipkan blok LEAD_DATA sebelum data poin penting terkumpul.`;

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
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server belum dikonfigurasi (API key kosong)' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(502).json({ error: 'Gagal menghubungi AI, coba lagi.' });
    }

    const data = await response.json();
    const textBlock = data.content.find((b) => b.type === 'text');
    const reply = textBlock ? textBlock.text : '';

    return res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
  }
};
