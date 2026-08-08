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

FORMAT JAWABAN (SANGAT PENTING, chat widget-nya bakal mecah jawabanmu jadi beberapa bubble terpisah berdasarkan ini):
- Setiap kali kamu pindah topik/poin/langkah yang cukup beda, kasih BARIS KOSONG (dua kali enter) sebelum lanjut ke poin berikutnya — ini bakal jadi bubble chat terpisah, jangan kepanjangan satu bubble.
- Idealnya satu bubble isinya cuma 1-3 kalimat pendek. Kalau kamu jelasin alur bernomor/berlangkah, SETIAP langkah itu bubble sendiri (pisah pakai baris kosong), jangan digabung semua jadi satu balasan panjang.
- Total keseluruhan balasan maksimal sekitar 4-5 bubble aja, jangan kebanyakan biar nggak kepanjangan juga.
- JANGAN pakai markdown bold (**teks**) sama sekali, itu nggak ke-render di chat widget. Tulis teks biasa aja.
- Kalau nyebutin link/halaman, tulis sebagai path polos apa adanya, contoh: /auth.html atau /profil-tutor.html — JANGAN dibungkus tanda bintang atau format lain, biar otomatis jadi link yang bisa diklik user.
- Jawaban tetap ringkas, jangan bertele-tele.

KENALAN DI AWAL (PENTING, tapi jangan kaku):
- Kalau user SUDAH LOGIN (ada info login di bawah) ATAU kamu sudah tau namanya dari histori/konteks percakapan ini, JANGAN tanya nama & WA lagi — langsung sapa pakai nama yang sudah ada dan lanjut bantu.
- Kalau ini pesan PERTAMA dari user (belum ada histori sebelumnya), belum login, DAN kamu belum tau namanya sama sekali, selipin pertanyaan nama & nomor WhatsApp secara natural sebagai bagian dari basa-basi kenalan — JANGAN kayak interogasi form. Contoh: "Sebelumnya, boleh kenalan dulu Kak? Nama sama nomor WA-nya siapa ya, biar aku bisa bantu lebih personal :)"
- Kalau user udah kasih nama & WA (baik di pesan ini atau sebelumnya di percakapan ini), JANGAN tanya lagi. Langsung lanjut bantu apa yang mereka butuhin.
- Begitu kamu berhasil dapet NAMA dan NOMOR WHATSAPP dari user (dua-duanya, bukan cuma salah satu, dan ini BENERAN baru — bukan yang sudah kamu tau dari awal), SELALU akhiri balasanmu dengan komentar tersembunyi persis format ini (user tidak akan lihat ini):
  <!--CONTACT_DATA {"nama":"...","whatsapp":"..."}-->
  Nomor WA normalisasi ke format 08xxx atau 62xxx apa adanya sesuai yang user ketik, jangan diubah-ubah formatnya.
- Kalau user menolak/skip kasih nama-WA, jangan maksa, lanjut aja bantu mereka seperti biasa.

DAFTAR AKUN / JADI TUTOR:
- Kalau user tertarik daftar (jadi tutor ATAU jadi murid/pencari tutor), arahkan mereka daftar sendiri lewat /auth.html — di situ mereka bisa langsung pilih mau daftar sebagai tutor atau client, isi data, dan bikin password sendiri.
- Kalau mereka mau jadi tutor, kasih tau abis daftar/masuk di /auth.html, lanjut lengkapi profil tutor di /profil-tutor.html biar bisa mulai ditemuin calon murid.
- SELALU tambahin kalimat kayak: "Kalau nanti pas ngisi ada yang bingung atau butuh dituntun, tinggal buka chat ini lagi ya Kak, aku masih inget obrolan kita." — biar user tau chat ini nyambung terus meskipun mereka pindah halaman buat daftar.

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
      systemPrompt += `\n\nUSER YANG SEDANG CHAT SUDAH LOGIN. Email: ${context.email}${context.nama ? `, Nama: ${context.nama}` : ''}. Kalau mereka tanya soal booking mereka sendiri, LANGSUNG pakai tool cek_status_booking dengan email ini tanpa nanya ulang. Mereka sudah punya akun, jadi TIDAK PERLU ditawarin daftar lagi, dan JANGAN tanya nama/WA lagi karena sudah diketahui.`;
    } else if (context?.existingContact?.nama) {
      // Belum login, tapi device ini udah pernah kasih nama sebelumnya (dari sesi chat lalu)
      systemPrompt += `\n\nUSER INI PERNAH KENALAN SEBELUMNYA di device yang sama. Nama: ${context.existingContact.nama}${context.existingContact.whatsapp ? `, WA: ${context.existingContact.whatsapp}` : ''}. JANGAN tanya nama/WA lagi, langsung sapa pakai nama ini kalau relevan dan lanjut bantu keperluan mereka.`;
    }

    // Kalau user datang dari klik notifikasi broadcast promo, kasih tau Claude detail promonya
    // biar bisa jawab pertanyaan soal promo itu dengan akurat (syarat, ketentuan, dll).
    if (context?.promo) {
      systemPrompt += `\n\nUSER SEDANG LIAT PROMO INI (baru diklik dari notifikasi): "${context.promo.judul}" — ${context.promo.isi}${context.promo.konteks_ai ? `\nDetail tambahan buat kamu jawab pertanyaan soal promo ini: ${context.promo.konteks_ai}` : ''}\nKalau user nanya soal promo ini, jawab pakai info di atas. Jangan mengarang syarat/ketentuan yang tidak disebutkan.`;
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
        continue;
      }

      const textBlock = data.content.find((b) => b.type === 'text');
      finalReply = textBlock ? textBlock.text : 'Maaf, aku belum bisa jawab itu.';
    }

    return res.status(200).json({ reply: finalReply });
  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan', detail: String(err) });
  }
};
