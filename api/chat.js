// Vercel Serverless Function — /api/chat
// Chatbot Ajarin dengan kemampuan CEK DATA REAL dari Supabase via tool-calling,
// plus paham alur lengkap platform buat bimbing user.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `Kamu adalah NIX— asisten customer service Ajarin, platform marketplace tutor terpercaya di Kudus.

PERAN KAMU:
1. Bantu calon murid menemukan tutor yang cocok (tanya kebutuhan: mapel/skill, jenjang, lokasi, jadwal)
2. Jawab pertanyaan seputar cara pakai platform
3. Kalau user komplain atau tanya status booking mereka, GUNAKAN tool cek_status_booking untuk mengecek data ASLI — jangan pernah mengarang status booking.
4. Kalau masalah user tidak bisa kamu selesaikan (butuh keputusan admin, dispute serius, dll), arahkan mereka pakai tombol "Laporkan Masalah" di halaman detail booking mereka.

ALUR PLATFORM YANG PERLU KAMU PAHAMI (buat membimbing user):
- Cari tutor: buka /cari-tutor.html, bisa filter kategori
- Booking: pilih tutor → pilih jadwal kosong → isi alamat → bayar → tutor terima/tolak
- Setelah tutor terima: nomor kontak tutor muncul di halaman booking, bisa chat juga di situ
- Setelah sesi belajar SELESAI secara fisik: murid kasih 4 digit PIN (ada di halaman booking mereka) ke tutor, tutor input PIN itu di halaman booking mereka sendiri, baru dana cair ke tutor
- Kalau ada masalah: tombol "Laporkan Masalah" ada di halaman detail booking (booking-detail.html), status jadi "Dalam Peninjauan Admin"
- Cek semua booking: /pesanan.html
- Daftar/masuk: /auth.html
- Jadi tutor: isi profil di /profil-tutor.html setelah daftar

CARA PAKAI TOOL cek_status_booking:
- Kalau user tanya soal booking mereka TAPI belum kasih email, TANYA DULU email mereka (buat verifikasi identitas) sebelum pakai tool ini.
- Kalau context user sudah tersedia (mereka login), langsung pakai email itu tanpa nanya ulang.
- Setelah dapat hasil dari tool, jelaskan statusnya dengan bahasa yang jelas dan ramah, sesuai label status: menunggu_pembayaran, dibayar (menunggu respon tutor), diterima, selesai, ditolak_tutor, dibatalkan_client, disengketakan.

GAYA BICARA: santai tapi sopan, pakai "Kak", bahasa Indonesia natural, jangan kaku. Jawaban ringkas, tidak bertele-tele.`;

const TOOLS = [
  {
    name: 'cek_status_booking',
    description: 'Cek daftar booking milik user tertentu berdasarkan email, untuk menjawab pertanyaan soal status booking mereka.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email akun user yang mau dicek bookingnya' }
      },
      required: ['email']
    }
  }
];

async function cekStatusBooking(email) {
  const userRes = await fetch(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id,nama`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const users = await userRes.json();

  if (!users || users.length === 0) {
    return { found: false, message: 'Tidak ada akun Ajarin dengan email tersebut.' };
  }

  const user = users[0];

  const bookingsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?or=(client_id.eq.${user.id},tutor_id.eq.${user.id})&order=created_at.desc&limit=10&select=id,status,kategori,harga_disepakati,created_at,availability_slots(tanggal,jam_mulai,jam_selesai)`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const bookings = await bookingsRes.json();

  return {
    found: true,
    nama: user.nama,
    total_booking: bookings.length,
    bookings: bookings.map((b) => ({
      id: b.id,
      status: b.status,
      kategori: b.kategori,
      harga: b.harga_disepakati,
      jadwal: b.availability_slots
        ? `${b.availability_slots.tanggal} ${b.availability_slots.jam_mulai}`
        : null,
      link: `/booking-detail.html?id=${b.id}`
    }))
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, context } = req.body;

    // Kalau user sudah login, kasih tau Claude identitasnya biar gak perlu nanya ulang
    let systemPrompt = SYSTEM_PROMPT;
    if (context?.email) {
      systemPrompt += `\n\nUSER YANG SEDANG CHAT SUDAH LOGIN. Email: ${context.email}${context.nama ? `, Nama: ${context.nama}` : ''}. Kalau mereka tanya soal booking mereka sendiri, LANGSUNG pakai tool cek_status_booking dengan email ini tanpa nanya ulang.`;
    }

    let conversationMessages = [...messages];
    let finalReply = null;
    let loopGuard = 0;

    while (finalReply === null && loopGuard < 4) {
      loopGuard++;

      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1024,
          system: systemPrompt,
          messages: conversationMessages,
          tools: TOOLS
        })
      });

      const data = await apiRes.json();

      if (!apiRes.ok) {
        console.error('Anthropic API error:', data);
        return res.status(500).json({ error: 'Gagal menghubungi AI', detail: data });
      }

      const toolUseBlock = data.content.find((b) => b.type === 'tool_use');

      if (toolUseBlock && toolUseBlock.name === 'cek_status_booking') {
        const toolResult = await cekStatusBooking(toolUseBlock.input.email);

        conversationMessages.push({ role: 'assistant', content: data.content });
        conversationMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: JSON.stringify(toolResult)
            }
          ]
        });
        // Loop lagi, kirim ulang ke Claude dengan hasil tool supaya dia rangkai jawaban final
        continue;
      }

      // Tidak ada tool_use -> ini jawaban final
      const textBlock = data.content.find((b) => b.type === 'text');
      finalReply = textBlock ? textBlock.text : 'Maaf, aku belum bisa jawab itu.';
    }

    return res.status(200).json({ reply: finalReply });
  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan', detail: String(err) });
  }
};
