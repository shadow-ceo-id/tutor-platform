// ============================================================
// AJARIN CHAT WIDGET — sisipkan ke halaman manapun dengan:
// <script src="chat-widget.js"></script>
// sebelum tag </body> penutup.
// Otomatis inject HTML, CSS, dan logic chatbot + koneksi Supabase.
// ============================================================

(function(){
  const SUPABASE_URL = 'https://yxaqvywhhbsyjqfgtebn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_DMOft_KQMR41TnigUV1Oxw_TVeHd3Bx';
  const CHAT_API = '/api/chat';

  // ---- Pastikan Supabase JS SDK ke-load (kalau halaman belum punya) ----
  function loadSupabaseSDK(callback){
    if(window.supabase){ callback(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = callback;
    document.head.appendChild(script);
  }

  function init(){
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    injectStyles();
    injectMarkup();
    wireEvents(supabaseClient);

    // Register service worker dari awal, JANGAN nunggu klik chat.
    // Ini penting buat iOS Safari: kalau register-nya baru dipanggil
    // pas klik chat, jeda waktu sampai subscribe() bisa bikin iOS
    // nganggep user-gesture-nya udah "kadaluarsa" dan diam-diam nolak.
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('/service-worker.js').catch(err => {
        console.error('SW register awal gagal:', err);
      });
    }
  }

  function injectStyles(){
    const style = document.createElement('style');
    style.textContent = `
      #ajarinChatFab{
        position:fixed;bottom:22px;right:22px;z-index:9999;
        width:56px;height:56px;border-radius:50%;
        background:#F2A63D;color:#0F2A26;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 12px 28px -8px rgba(217,138,34,0.6);
        border:none;cursor:pointer;font-family:sans-serif;
      }
      #ajarinChatFab svg{width:24px;height:24px;}
      #ajarinChatOverlay{
        position:fixed;inset:0;background:rgba(15,42,38,0.4);
        display:none;align-items:flex-end;justify-content:flex-end;padding:0;z-index:10000;
      }
      #ajarinChatOverlay.open{display:flex;}
      @media(min-width:640px){#ajarinChatOverlay{padding:24px;}}
      #ajarinChatPanel{
        background:#FFFFFF;width:100%;max-width:420px;height:100%;
        display:flex;flex-direction:column;border-radius:0;
        box-shadow:0 30px 80px -20px rgba(15,42,38,0.5);
        font-family:'Inter',sans-serif;
      }
      @media(min-width:640px){#ajarinChatPanel{height:min(640px,90vh);border-radius:20px;overflow:hidden;}}
      #ajarinChatHeader{background:#0F2A26;color:#FAF8F2;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
      #ajarinChatHeader .title{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:1.1rem;}
      #ajarinChatHeader .sub{font-size:0.78rem;color:rgba(250,248,242,0.65);margin-top:2px;}
      #ajarinChatClose{background:rgba(250,248,242,0.14);border:none;color:#FAF8F2;cursor:pointer;padding:9px;border-radius:50%;display:flex;align-items:center;justify-content:center;width:38px;height:38px;flex-shrink:0;}
      #ajarinChatClose svg{width:20px;height:20px;}
      #ajarinChatBody{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:12px;background:#FAF8F2;overscroll-behavior:contain;}
      .ajarin-msg{max-width:82%;padding:11px 15px;border-radius:16px;font-size:0.92rem;line-height:1.45;}
      .ajarin-msg-bot{background:#FFFFFF;border:1px solid #E4DFD1;align-self:flex-start;border-bottom-left-radius:4px;color:#0F2A26;}
      .ajarin-msg-user{background:#0F2A26;color:#FAF8F2;align-self:flex-end;border-bottom-right-radius:4px;}
      .ajarin-typing{align-self:flex-start;display:flex;gap:4px;padding:14px 16px;}
      .ajarin-typing span{width:6px;height:6px;border-radius:50%;background:#5B6B66;opacity:0.5;animation:ajarinBlink 1.2s infinite;}
      .ajarin-typing span:nth-child(2){animation-delay:0.2s;}
      .ajarin-typing span:nth-child(3){animation-delay:0.4s;}
      @keyframes ajarinBlink{0%,80%,100%{opacity:0.3;}40%{opacity:1;}}
      #ajarinChatForm{display:flex;gap:10px;padding:14px;border-top:1px solid #E4DFD1;background:#FFFFFF;flex-shrink:0;}
      #ajarinChatInput{flex:1;border:1px solid #E4DFD1;border-radius:999px;padding:11px 16px;font-family:inherit;font-size:0.92rem;background:#FAF8F2;color:#0F2A26;}
      #ajarinChatSend{background:#F2A63D;border:none;color:#0F2A26;width:42px;height:42px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;cursor:pointer;}
      #ajarinChatSend svg{width:18px;height:18px;}
    `;
    document.head.appendChild(style);
  }

  function injectMarkup(){
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <button id="ajarinChatFab" aria-label="Chat dengan Ajarin">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 01-8.5 8.5c-1.35 0-2.6-.32-3.7-.9L3 21l1.9-5.7A8.4 8.4 0 013.5 11.5 8.5 8.5 0 0112 3a8.5 8.5 0 019 8.5z"/></svg>
      </button>
      <div id="ajarinChatOverlay">
        <div id="ajarinChatPanel">
          <div id="ajarinChatHeader">
            <div>
              <div class="title">Ajarin</div>
              <div class="sub">Biasanya balas dalam hitungan detik</div>
            </div>
            <button id="ajarinChatClose">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div id="ajarinChatBody"></div>
          <form id="ajarinChatForm">
            <input type="text" id="ajarinChatInput" placeholder="Tulis pesan..." autocomplete="off" required>
            <button type="submit" id="ajarinChatSend">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);
  }

  // Ubah URL/path polos jadi <a> bisa diklik, escape teks lain, \n jadi <br>
  function linkifyEscaped(text){
    let escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    escaped = escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#1F8A76;text-decoration:underline;font-weight:600;">$1</a>');
    escaped = escaped.replace(/(^|[\s(])(\/[a-zA-Z0-9_-]+\.html(?:\?[^\s)]*)?)/g, '$1<a href="$2" style="color:#1F8A76;text-decoration:underline;font-weight:600;">$2</a>');
    return escaped.replace(/\n/g, '<br>');
  }

  function wireEvents(supabaseClient){
    let chatHistory = [];
    let chatOpened = false;
    let userContext = null;
    let displayLog = [];
    let chatBodyRendered = false;
    let existingContact = null;

    async function loadExistingContact(){
      if(userContext?.nama || existingContact) return; // udah login atau udah pernah dicek
      try{
        const endpoint = await getExistingSubscriptionEndpoint();
        if(endpoint){
          const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&nama=not.is.null&select=nama,whatsapp&limit=1`, {
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
          });
          const rows = await res.json();
          if(Array.isArray(rows) && rows.length > 0){ existingContact = rows[0]; return; }
        }
        const anonId = getAnonId();
        const res2 = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?anon_id=eq.${anonId}&nama=not.is.null&select=nama,whatsapp&limit=1`, {
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
        });
        const rows2 = await res2.json();
        if(Array.isArray(rows2) && rows2.length > 0) existingContact = rows2[0];
      }catch(e){
        console.error('Gagal cek kontak lama:', e);
      }
    }

    const STORAGE_KEY = 'ajarin_chat_state'; // key global, SAMA kayak index.html biar chat nyambung lintas halaman
    try{
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if(saved){
        const state = JSON.parse(saved);
        chatHistory = state.chatHistory || [];
        chatOpened = !!state.chatOpened;
        displayLog = state.displayLog || [];
      }
    }catch(e){ /* abaikan kalau corrupt */ }

    function persistState(){
      try{
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ chatHistory, chatOpened, displayLog }));
      }catch(e){ /* storage penuh/disabled, abaikan */ }
    }

    // Cek kalau ada yang login, biar chatbot bisa auto-lookup data mereka
    supabaseClient.auth.getSession().then(async ({ data: { session } }) => {
      if(session){
        const { data: profile } = await supabaseClient.from('users').select('nama, email').eq('id', session.user.id).single();
        userContext = { email: profile?.email || session.user.email, nama: profile?.nama };
      }
    });

    const fab = document.getElementById('ajarinChatFab');
    const overlay = document.getElementById('ajarinChatOverlay');
    const body = document.getElementById('ajarinChatBody');
    const form = document.getElementById('ajarinChatForm');
    const input = document.getElementById('ajarinChatInput');

    function scrollBottom(){ body.scrollTop = body.scrollHeight; }
    function addBotBubble(text){
      const el = document.createElement('div');
      el.className = 'ajarin-msg ajarin-msg-bot';
      const html = linkifyEscaped(text);
      el.innerHTML = html;
      body.appendChild(el);
      scrollBottom();
      displayLog.push({ type: 'bot', html });
      persistState();
    }
    // Pecah jawaban panjang jadi beberapa bubble terpisah (per paragraf), beruntun dengan
    // jeda + indikator "sedang mengetik" biar kerasa natural, kasih waktu user baca dulu.
    const BUBBLE_GAP_MS = 3200;
    const TYPING_DURATION_MS = 1100;
    function addBot(text){
      const chunks = text.split(/\n\s*\n+/).map(c => c.trim()).filter(c => c.length > 0);
      if(chunks.length === 0) chunks.push(text);
      chunks.forEach((chunk, i) => {
        const showAt = i * BUBBLE_GAP_MS;
        if(i > 0){
          setTimeout(() => showTyping(), Math.max(0, showAt - TYPING_DURATION_MS));
        }
        setTimeout(() => {
          if(i > 0) hideTyping();
          addBotBubble(chunk);
        }, showAt);
      });
    }
    function addUser(text){
      const el = document.createElement('div');
      el.className = 'ajarin-msg ajarin-msg-user';
      el.textContent = text;
      body.appendChild(el);
      scrollBottom();
      displayLog.push({ type: 'user', html: el.innerHTML });
      persistState();
    }
    function renderDisplayLogOnce(){
      if(chatBodyRendered || displayLog.length === 0) return;
      displayLog.forEach(item => {
        const el = document.createElement('div');
        el.className = item.type === 'bot' ? 'ajarin-msg ajarin-msg-bot' : 'ajarin-msg ajarin-msg-user';
        el.innerHTML = item.html;
        body.appendChild(el);
      });
      chatBodyRendered = true;
      scrollBottom();
    }
    function showTyping(){
      const el = document.createElement('div');
      el.className = 'ajarin-typing';
      el.id = 'ajarinTyping';
      el.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(el);
      scrollBottom();
    }
    function hideTyping(){
      const el = document.getElementById('ajarinTyping');
      if(el) el.remove();
    }

    fab.addEventListener('click', () => {
      overlay.classList.add('open');
      if(chatOpened){
        renderDisplayLogOnce();
        loadExistingContact();
        setupPushNotification(supabaseClient, userContext);
      }else{
        chatOpened = true;
        loadExistingContact().then(() => {
          const sapaan = userContext?.nama ? `, Kak ${userContext.nama.split(' ')[0]}` : (existingContact?.nama ? `, Kak ${existingContact.nama.split(' ')[0]}` : ' Kak');
          addBot(`Halo${sapaan}! 👋 Ada yang bisa dibantu seputar Ajarin?`);
          persistState();
        });
        // Panggil langsung (bukan dibungkus proses lain) biar user-gesture dari klik ini
        // masih "hidup" sampai ke pushManager.subscribe().
        setupPushNotification(supabaseClient, userContext);
      }
    });
    document.getElementById('ajarinChatClose').addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (e) => { if(e.target === overlay) overlay.classList.remove('open'); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if(!text) return;

      chatHistory.push({ role: 'user', content: text });
      addUser(text);
      input.value = '';
      showTyping();

      try{
        const res = await fetch(CHAT_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatHistory,
            context: { ...(userContext || {}), existingContact: existingContact || undefined }
          })
        });
        const data = await res.json();
        hideTyping();

        if(!res.ok || !data.reply){
          addBot('Maaf, lagi ada gangguan. Coba lagi sebentar ya.');
          return;
        }

        chatHistory.push({ role: 'assistant', content: data.reply });
        persistState();

        const contactMatch = data.reply.match(/<!--CONTACT_DATA\s*([\s\S]*?)-->/);
        if(contactMatch){
          try{
            const contact = JSON.parse(contactMatch[1].trim());
            saveContactData(supabaseClient, contact);
          }catch(e){ /* abaikan kalau JSON-nya rusak */ }
        }

        const cleanText = data.reply.replace(/<!--[\s\S]*?-->/g, '').trim();
        addBot(cleanText);
      }catch(err){
        hideTyping();
        addBot('Maaf, koneksi lagi bermasalah. Coba lagi sebentar ya.');
      }
    });
  }

  const VAPID_PUBLIC_KEY = 'BHWOx-ZeGpKnnmR9JcCqaTecHMXPdOBBGQefwwZJyQ1t2bV5c_c390quNJHJ6JRSd9KzcbXw6_e3sBMl2v-Q_3c';

  function urlBase64ToUint8Array(base64String){
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  function getAnonId(){
    let id = localStorage.getItem('ajarin_anon_id');
    if(!id){
      id = 'anon_' + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem('ajarin_anon_id', id);
    }
    return id;
  }

  // Ambil endpoint push subscription yang UDAH ada, tanpa minta izin baru.
  // Lebih awet dibanding anon_id di localStorage buat identifikasi device balik lagi.
  async function getExistingSubscriptionEndpoint(){
    try{
      if(!('serviceWorker' in navigator)) return null;
      const registration = await navigator.serviceWorker.getRegistration();
      if(!registration) return null;
      const subscription = await registration.pushManager.getSubscription();
      return subscription?.endpoint || null;
    }catch(e){
      return null;
    }
  }

  // DEBUG_MODE: sementara true biar error keliatan lewat alert().
  // Matikan (set false) lagi setelah masalah subscribe ketemu & fix.
  const DEBUG_MODE = false;

  async function saveContactData(supabaseClient, contact){
    if(!contact || !contact.nama) return;
    localStorage.setItem('ajarin_pending_nama', contact.nama);
    if(contact.whatsapp) localStorage.setItem('ajarin_pending_wa', contact.whatsapp);

    try{
      const { data: { session } } = await supabaseClient.auth.getSession();
      let filter;
      if(session){
        filter = `user_id=eq.${session.user.id}`;
      }else{
        const anonId = getAnonId();
        const endpoint = await getExistingSubscriptionEndpoint();
        filter = endpoint
          ? `or=(endpoint.eq.${encodeURIComponent(endpoint)},anon_id.eq.${anonId})`
          : `anon_id=eq.${anonId}`;
      }
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?${filter}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        },
        body: JSON.stringify({ nama: contact.nama, whatsapp: contact.whatsapp || null })
      });
    }catch(e){
      console.error('Gagal simpan kontak ke subscription:', e);
    }
  }

  async function setupPushNotification(supabaseClient, userContext){
    if(!('serviceWorker' in navigator) || !('PushManager' in window)){
      if(DEBUG_MODE) alert('Browser ini tidak mendukung Push Notification (serviceWorker/PushManager tidak ada).');
      return;
    }
    if(Notification.permission === 'denied'){
      if(DEBUG_MODE) alert('Izin notifikasi berstatus "denied". Cek Settings HP untuk situs ini.');
      return;
    }
    if(localStorage.getItem('ajarin_push_subscribed') === 'true') return; // udah pernah, gak usah ulang

    try{
      const permission = await Notification.requestPermission();
      if(permission !== 'granted'){
        if(DEBUG_MODE) alert('Permission hasil: ' + permission + ' (bukan granted).');
        return;
      }

      // Pakai registration yang udah didaftarkan dari awal load halaman.
      // Kalau belum siap (race condition), baru register di sini sebagai fallback.
      let registration = await navigator.serviceWorker.getRegistration();
      if(!registration){
        registration = await navigator.serviceWorker.register('/service-worker.js');
      }
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if(!subscription){
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }

      const subJson = subscription.toJSON();

      const insertRes = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Prefer': 'resolution=ignore-duplicates'
        },
        body: JSON.stringify({
          user_id: null,
          anon_id: getAnonId(),
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth_key: subJson.keys.auth,
          nama: localStorage.getItem('ajarin_pending_nama') || null,
          whatsapp: localStorage.getItem('ajarin_pending_wa') || null
        })
      });

      if(!insertRes.ok && DEBUG_MODE){
        const errText = await insertRes.text();
        alert('Gagal simpan subscription ke database: ' + insertRes.status + ' ' + errText);
      }

      // Kalau user login, update row itu biar ke-link ke akunnya (bukan cuma anon_id)
      if(userContext?.email){
        const { data: { session } } = await supabaseClient.auth.getSession();
        if(session){
          await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?endpoint=eq.' + encodeURIComponent(subJson.endpoint), {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_KEY,
              'Authorization': 'Bearer ' + SUPABASE_KEY
            },
            body: JSON.stringify({ user_id: session.user.id })
          });
        }
      }

      localStorage.setItem('ajarin_push_subscribed', 'true');
      if(DEBUG_MODE) alert('Push notification berhasil di-subscribe! ✅');
    }catch(err){
      console.error('Push subscription gagal:', err);
      if(DEBUG_MODE) alert('Push subscribe error: ' + (err.name || '') + ' - ' + (err.message || err));
    }
  }

  loadSupabaseSDK(init);
})();
