/* Forge shared session client. Canonical source: Forge2/suite-client.js. */
(() => {
  const hub = 'https://app.forgehub.dev';
  const origins = ['https://crm.forgehub.dev','https://scope.forgehub.dev',
    'https://reader.forgehub.dev','https://quote.forgehub.dev',
    'https://manufacturing.forgehub.dev','https://portal.forgehub.dev',
    'https://frame.forgehub.dev','https://todo.forgehub.dev'];
  const managed = origins.includes(location.origin);

  const SHARED_KEY = 'forge-core-auth';
  const COOKIE_DOMAIN = '.forgehub.dev';
  const CHUNK = 3500;
  function readRaw(name){
    const re = new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/+^])/g, '\\$1') + '=([^;]*)');
    const m = document.cookie.match(re);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeRaw(name, value, days){
    let expires = '';
    if (days != null) { const d = new Date(); d.setTime(d.getTime() + days*864e5); expires = '; expires=' + d.toUTCString(); }
    document.cookie = name + '=' + encodeURIComponent(value) + expires + '; domain=' + COOKIE_DOMAIN + '; path=/; secure; samesite=lax';
  }
  function clearRaw(name){
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=' + COOKIE_DOMAIN + '; path=/; secure; samesite=lax';
  }
  const cookieStorage = {
    getItem: key => {
      const nRaw = readRaw(key + '.n');
      if (nRaw === null) return readRaw(key);
      const n = parseInt(nRaw, 10) || 0;
      let out = '';
      for (let i = 0; i < n; i++) { const part = readRaw(key + '.' + i); if (part === null) return null; out += part; }
      return out;
    },
    setItem: (key, value) => {
      cookieStorage.removeItem(key);
      const chunks = [];
      for (let i = 0; i < value.length; i += CHUNK) chunks.push(value.slice(i, i + CHUNK));
      if (!chunks.length) chunks.push('');
      chunks.forEach((c, j) => writeRaw(key + '.' + j, c, 34));
      writeRaw(key + '.n', String(chunks.length), 34);
    },
    removeItem: key => {
      const nRaw = readRaw(key + '.n');
      const n = nRaw !== null ? (parseInt(nRaw, 10) || 0) : 0;
      const clearUpTo = Math.max(n, 8);
      for (let i = 0; i < clearUpTo; i++) clearRaw(key + '.' + i);
      clearRaw(key + '.n');
      clearRaw(key);
    }
  };

  let connection;
  const api = window.ForgeSuite = {
    managed,
    auth: managed
      ? { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: cookieStorage, storageKey: SHARED_KEY }
      : { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    async connect(client) {
      if (!managed) return client;
      if (connection) return connection;
      connection = (async () => {
        const existing = await client.auth.getSession();
        if (existing?.data?.session) return client;
        return new Promise((resolve, reject) => {
          const frame = document.createElement('iframe');
          frame.hidden = true;
          frame.title = 'Forge account session';
          frame.src = hub + '/session.html';
          const nonce = crypto.randomUUID();
          let initialized = false, token = '', userId = '', queue = Promise.resolve(), signoutPending;
          const localSignOut = client.auth.signOut.bind(client.auth);
          const login = () => location.replace(hub + '/account.html?returnTo=' + encodeURIComponent(location.href));
          const timer = setTimeout(() => {
            reject(new Error('Forge sign-in could not connect. Open Forge Home and try again.'));
            login();
          }, 15000);
          window.addEventListener('message', event => {
            const message = event.data;
            if (event.origin !== hub || event.source !== frame.contentWindow ||
                message?.type !== 'forge-session' || message.nonce !== nonce) return;
            queue = queue.then(async () => {
              clearTimeout(timer);
              if (message.error) { reject(new Error(message.error)); login(); return; }
              const session = message.session;
              if (!session) { await localSignOut({ scope: 'local' }); signoutPending?.({error:null}); login(); return; }
              if (userId && userId !== session.user.id) { location.reload(); return; }
              if (token !== session.access_token) {
                const { error } = await client.auth.setSession(session);
                if (error) throw error;
                token = session.access_token;
                userId = session.user.id;
              }
              if (!initialized) { initialized = true; resolve(client); }
            }).catch(error => { reject(error); login(); });
          });
          client.auth.signOut = () => new Promise(resolve => {
            const timeout=setTimeout(()=>resolve({error:new Error('Sign out could not finish. Open Forge Home and sign out there.')}),15000);
            signoutPending=result=>{clearTimeout(timeout);resolve(result);};
            frame.contentWindow.postMessage({ type:'forge-signout', nonce }, hub);
          });
          frame.addEventListener('load', () => frame.contentWindow.postMessage({type:'forge-connect',nonce},hub));
          document.body.appendChild(frame);
        });
      })();
      return connection;
    }
  };
})();
