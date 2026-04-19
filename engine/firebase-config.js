/* Firebase Web SDK config for the public NotDop site.
   These values are NOT secrets — they identify the public Firebase project to
   the browser SDK. Real security is enforced by Firestore Rules in the
   Firebase Console (see firestore.rules in the repo root).

   Project: ethan-488900  |  Web App: notdop-minigames  |  DB: (default) nam5
*/
(function () {
  const NDP = (window.NDP = window.NDP || {});
  NDP.Engine = NDP.Engine || {};

  NDP.Engine.FirebaseConfig = {
    apiKey:            'AIzaSyAjqKuEWI3xzYaHN594Evod45gsSYALfLc',
    authDomain:        'ethan-488900.firebaseapp.com',
    projectId:         'ethan-488900',
    storageBucket:     'ethan-488900.firebasestorage.app',
    messagingSenderId: '108003293186',
    appId:             '1:108003293186:web:3ec0dab1f9f93408164f1b'
  };
})();
