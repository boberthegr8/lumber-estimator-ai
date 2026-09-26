/* Forge shared session client. Canonical source: Forge2/suite-client.js. */
(() => {
  const hub = 'https://app.forgehub.dev';
  const origins = ['https://crm.forgehub.dev','https://scope.forgehub.dev',
    'https://reader.forgehub.dev','https://quote.forgehub.dev',
    'https://manufacturing.forgehub.dev','https://portal.forgehub.dev'];
  const managed = origins.includes(location.origin);
  let connection;
  const api = window.ForgeSuite = {
    managed,
    auth: { persistSession: !managed, autoRefreshToken: !managed, detectSessionInUrl: !managed },
    async connect(client) {
      if (!managed) return client;
      if (connection) return connection;
      connection = new Promise((resolve, reject) => {
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
      return connection;
    }
  };
})();
