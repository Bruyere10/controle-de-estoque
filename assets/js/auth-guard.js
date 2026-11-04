import { auth, onAuthStateChanged, signOut, saveSession } from './firebase.js';

window.ceSignOut = () => signOut(auth);

onAuthStateChanged(auth, user => {
  if (!user) {
    localStorage.removeItem('ce_user');
    location.replace('index.html');
    return;
  }
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem('ce_user')); } catch { /* sessão inválida */ }
  if (!stored || stored.uid !== user.uid) {
    saveSession(user, user.providerData[0]?.providerId || 'firebase');
    location.reload();
  }
});
