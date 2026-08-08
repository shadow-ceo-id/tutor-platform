// Vercel Serverless Function — /api/send-push
// Dipanggil cron eksternal tiap beberapa menit (sama pola kayak send-digest).
// Kirim Web Push buat: (1) notifikasi baru yang belum di-push, (2) broadcast promo dari admin.

const webpush = require('web-push');

module.exports = async (req, res) => {
  const secret = req.query.secret;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Env vars belum lengkap' });
  }

  webpush.setVapidDetails('mailto:admin@ajarin.id', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  async function sbFetch(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.status === 204 ? null : res.json();
  }

  async function sendToSubscription(sub, payload) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        },
        JSON.stringify(payload)
      );
      return true;
    } catch (err) {
      // Subscription expired/invalid -> hapus dari database
      if (err.statusCode === 404 || err.statusCode === 410) {
        await sbFetch(`push_subscriptions?id=eq.${sub.id}`, { method: 'DELETE' });
      }
      console.error('Gagal kirim push ke', sub.id, err.message);
      return false;
    }
  }

  let totalNotifSent = 0;
  let totalBroadcastSent = 0;

  try {
    // ---- 1. Kirim notifikasi baru (booking, dispute, dll) yang belum di-push ----
    const pendingNotifs = await sbFetch('notifications?push_sent=eq.false&order=created_at.asc&limit=50');

    for (const notif of pendingNotifs) {
      const subs = await sbFetch(`push_subscriptions?user_id=eq.${notif.user_id}`);
      for (const sub of subs) {
        const ok = await sendToSubscription(sub, {
          title: notif.judul,
          body: notif.isi,
          url: notif.booking_id ? `/booking-detail.html?id=${notif.booking_id}` : '/dashboard.html',
        });
        if (ok) totalNotifSent++;
      }
      await sbFetch(`notifications?id=eq.${notif.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ push_sent: true }),
      });
    }

    // ---- 2. Kirim broadcast promo yang masih menunggu ----
    const pendingBroadcasts = await sbFetch('push_broadcasts?status=eq.menunggu&order=created_at.asc&limit=5');

    for (const bc of pendingBroadcasts) {
      let subs;
      if (bc.target_role === 'semua') {
        subs = await sbFetch('push_subscriptions?select=*');
      } else {
        // Filter berdasar role tutor/client, join manual via users
        const users = await sbFetch(`users?roles=cs.{${bc.target_role}}&select=id`);
        const userIds = users.map((u) => u.id);
        if (userIds.length === 0) {
          subs = [];
        } else {
          subs = await sbFetch(`push_subscriptions?user_id=in.(${userIds.join(',')})`);
        }
      }

      let sentCount = 0;
      for (const sub of subs) {
        const ok = await sendToSubscription(sub, {
          title: bc.judul,
          body: bc.isi,
          url: `/index.html?chat=1&promo=${bc.id}`,
          image: bc.gambar_url || undefined,
        });
        if (ok) { sentCount++; totalBroadcastSent++; }
      }

      await sbFetch(`push_broadcasts?id=eq.${bc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'terkirim', total_terkirim: sentCount, sent_at: new Date().toISOString() }),
      });
    }

    return res.status(200).json({
      notifikasi_terkirim: totalNotifSent,
      broadcast_terkirim: totalBroadcastSent,
    });
  } catch (err) {
    console.error('Send push error:', err);
    return res.status(500).json({ error: 'Gagal kirim push', detail: String(err) });
  }
};
