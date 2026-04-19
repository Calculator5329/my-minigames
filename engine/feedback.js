/* Feedback service — writes anonymous text feedback to Firestore.
   Uses the Firebase compat SDK (loaded lazily from gstatic) so the rest of
   the no-build codebase doesn't need to ship the SDK on every page load.

   Public API:
     NDP.Engine.Feedback.submit(gameId, gameTitle, text) -> Promise<void>
       Resolves on success, rejects with an Error on failure.

   Storage shape (collection: feedback):
     {
       gameId:    string,    // e.g. 'reactor'
       gameTitle: string,    // human-readable, e.g. 'Reactor'
       text:      string,    // 1..2000 chars, trimmed
       createdAt: Timestamp, // server-assigned
       userAgent: string,    // truncated, for triage
       siteUrl:   string     // window.location.origin, for triage
     }

   Reads/updates/deletes are blocked by Firestore Rules — feedback is
   write-only from the client. Owner reads via the Firebase Console.
*/
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Engine = NDP.Engine || {};

  const SDK_VERSION = '10.14.1';
  const MAX_LEN = 2000;
  const MIN_LEN = 1;
  // Throttle: at most one submission every N ms per browser tab.
  const THROTTLE_MS = 5000;

  let sdkPromise = null;
  let appPromise = null;
  let lastSubmitAt = 0;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    const base = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION;
    sdkPromise = loadScript(base + '/firebase-app-compat.js')
      .then(() => loadScript(base + '/firebase-firestore-compat.js'))
      .catch((err) => { sdkPromise = null; throw err; });
    return sdkPromise;
  }

  function ensureApp() {
    if (appPromise) return appPromise;
    appPromise = loadSdk().then(() => {
      const cfg = NDP.Engine.FirebaseConfig;
      if (!cfg) throw new Error('Firebase config missing (engine/firebase-config.js not loaded)');
      const fb = window.firebase;
      if (!fb) throw new Error('Firebase SDK failed to attach to window');
      const app = fb.apps && fb.apps.length ? fb.app() : fb.initializeApp(cfg);
      const db = fb.firestore(app);
      return { fb, db };
    }).catch((err) => { appPromise = null; throw err; });
    return appPromise;
  }

  /** Begin loading the SDK in the background. Safe to call multiple times. */
  function preload() {
    ensureApp().catch(() => { /* swallow; submit() will surface the error */ });
  }

  /**
   * Submit a single feedback document.
   * @param {string} gameId
   * @param {string} gameTitle
   * @param {string} text
   * @returns {Promise<void>}
   */
  async function submit(gameId, gameTitle, text) {
    const trimmed = (text || '').trim();
    if (trimmed.length < MIN_LEN) throw new Error('Please write something first.');
    if (trimmed.length > MAX_LEN) throw new Error('Feedback is too long (max ' + MAX_LEN + ' characters).');
    if (typeof gameId !== 'string' || gameId.length === 0 || gameId.length > 50) {
      throw new Error('Invalid game id.');
    }

    const now = Date.now();
    if (now - lastSubmitAt < THROTTLE_MS) {
      const remaining = Math.ceil((THROTTLE_MS - (now - lastSubmitAt)) / 1000);
      throw new Error('Slow down — please wait ' + remaining + 's before sending another.');
    }

    const { fb, db } = await ensureApp();

    const doc = {
      gameId:    gameId,
      gameTitle: String(gameTitle || gameId).slice(0, 100),
      text:      trimmed,
      createdAt: fb.firestore.FieldValue.serverTimestamp(),
      userAgent: (navigator.userAgent || '').slice(0, 240),
      siteUrl:   (window.location && window.location.origin) || ''
    };

    await db.collection('feedback').add(doc);
    lastSubmitAt = Date.now();
  }

  NDP.Engine.Feedback = { submit, preload, MAX_LEN };
})();
