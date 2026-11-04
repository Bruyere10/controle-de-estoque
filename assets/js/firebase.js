import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

export {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// A configuração web do Firebase é pública por natureza; a segurança vem das regras e domínios autorizados.
const firebaseConfig = {
  apiKey: 'AIzaSyBeu-jtDVyFUHzY6-8oXafSX0u4dL1pRq0',
  authDomain: 'controle-estoque-4c80b.firebaseapp.com',
  projectId: 'controle-estoque-4c80b',
  storageBucket: 'controle-estoque-4c80b.firebasestorage.app',
  messagingSenderId: '842603071756',
  appId: '1:842603071756:web:6641bab799e8c71ee2a129'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'pt-BR';

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function saveSession(user, provider) {
  localStorage.setItem('ce_user', JSON.stringify({
    uid: user.uid,
    name: user.displayName || (user.email || 'Usuário').split('@')[0],
    email: user.email || user.uid,
    photo: user.photoURL || '',
    provider,
    loginAt: new Date().toISOString()
  }));
}
