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

  function wireEvents(supabaseClient){
    let chatHistory = [];
    let chatOpened = false;
    let userContext = null;

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
    function addBot(text){
      const el = document.createElement('div');
      el.className = 'ajarin-msg ajarin-msg-bot';
      el.textContent = text;
      body.appendChild(el);
      scrollBottom();
    }
    function addUser(text){
      const el = document.createElement('div');
      el.className = 'ajarin-msg ajarin-msg-user';
      el.textContent = text;
      body.appendChild(el);
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
      if(!chatOpened){
        chatOpened = true;
        addBot('Halo Kak! 👋 Ada yang bisa dibantu seputar Ajarin?');
      }
    });
    document.getElementById('ajarinChatClose').addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (e) => { if(e.target === overlay) overlay.classList.remove('open'); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if(!text) return;

      addUser(text);
      chatHistory.push({ role: 'user', content: text });
      input.value = '';
      showTyping();

      try{
        const res = await fetch(CHAT_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: chatHistory, context: userContext })
        });
        const data = await res.json();
        hideTyping();

        if(!res.ok || !data.reply){
          addBot('Maaf, lagi ada gangguan. Coba lagi sebentar ya.');
          return;
        }

        chatHistory.push({ role: 'assistant', content: data.reply });
        const cleanText = data.reply.replace(/<!--[\s\S]*?-->/g, '').trim();
        addBot(cleanText);
      }catch(err){
        hideTyping();
        addBot('Maaf, koneksi lagi bermasalah. Coba lagi sebentar ya.');
      }
    });
  }

  loadSupabaseSDK(init);
})();
