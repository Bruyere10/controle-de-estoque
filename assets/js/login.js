import {
  auth, googleProvider, saveSession, onAuthStateChanged, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile
} from './firebase.js';

const form = document.getElementById('loginForm');
const F = form.elements;
const note = document.getElementById('authNote');
const loginBtn = document.getElementById('loginBtn');
const googleBtn = document.getElementById('googleBtn');
let signUp = false;
let busy = false;

const ERRORS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não existe conta com esse e-mail. Clique em "Criar conta".',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/email-already-in-use': 'Esse e-mail já tem conta. Faça login ou use "Esqueci a senha".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Permita pop-ups para este site.',
  'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase (Authentication → Settings → Authorized domains).',
  'auth/operation-not-allowed': 'Este método de login não está ativado no Firebase (Authentication → Sign-in method).',
  'auth/operation-not-supported-in-this-environment': 'Abra o site pelo Live Server (http://), não direto pelo arquivo.'
};

function showNote(msg, type = 'info') {
  note.hidden = false;
  note.className = `auth-note highlight ${type}`;
  note.textContent = msg;
}

function setBusy(on, btn) {
  busy = on;
  loginBtn.disabled = on;
  googleBtn.disabled = on;
  if (on) {
    btn.dataset.html = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Aguarde...';
  } else if (btn.dataset.html) {
    btn.innerHTML = btn.dataset.html;
  }
}

function handleError(err, btn) {
  setBusy(false, btn);
  if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err.code)) return;
  showNote(ERRORS[err.code] || `Não foi possível entrar (${err.code || err.message}).`, 'error');
}

function enter(user, provider) {
  saveSession(user, provider);
  location.replace('app.html');
}

// Já logado: vai direto para o sistema
onAuthStateChanged(auth, user => {
  if (user && !busy) enter(user, user.providerData[0]?.providerId || 'firebase');
});

googleBtn.addEventListener('click', async () => {
  setBusy(true, googleBtn);
  try {
    const { user } = await signInWithPopup(auth, googleProvider);
    enter(user, 'google');
  } catch (err) {
    handleError(err, googleBtn);
  }
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  const email = F.email.value.trim();
  const password = F.password.value;
  setBusy(true, loginBtn);
  try {
    if (signUp) {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      const name = F.name.value.trim();
      if (name) await updateProfile(user, { displayName: name });
      enter(user, 'password');
    } else {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      enter(user, 'password');
    }
  } catch (err) {
    handleError(err, loginBtn);
  }
});

document.getElementById('switchMode').addEventListener('click', e => {
  e.preventDefault();
  signUp = !signUp;
  document.getElementById('nameField').hidden = !signUp;
  document.getElementById('forgotRow').hidden = signUp;
  document.getElementById('switchText').textContent = signUp ? 'Já tem conta?' : 'Não tem conta?';
  e.currentTarget.textContent = signUp ? 'Entrar' : 'Criar conta';
  form.querySelector('h2').textContent = signUp ? 'Criar sua conta' : 'Bem-vindo de volta';
  form.querySelector('h2 + .muted').textContent = signUp ? 'Leva menos de um minuto' : 'Entre na sua conta para continuar';
  loginBtn.innerHTML = signUp ? 'Criar conta <i class="fa-solid fa-user-plus"></i>' : 'Entrar <i class="fa-solid fa-arrow-right"></i>';
  F.password.autocomplete = signUp ? 'new-password' : 'current-password';
  note.hidden = true;
});

document.getElementById('forgot').addEventListener('click', async e => {
  e.preventDefault();
  const email = F.email.value.trim();
  if (!email) return showNote('Digite seu e-mail no campo acima e clique novamente em "Esqueci a senha".');
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') return showNote(ERRORS[err.code] || 'Não foi possível enviar o e-mail.', 'error');
  }
  // Mesma mensagem para qualquer e-mail, para não revelar quais contas existem
  showNote(`Se existir uma conta para ${email}, enviamos um link para redefinir a senha. Confira também o spam.`, 'success');
});

document.getElementById('togglePass').addEventListener('click', e => {
  const show = F.password.type === 'password';
  F.password.type = show ? 'text' : 'password';
  e.currentTarget.innerHTML = `<i class="fa-regular fa-eye${show ? '-slash' : ''}"></i>`;
});
