// Login page: password step, then the authenticator-app CODE step if the
// account has an authenticator set up (it is optional).
// Opening this page as login.html?setup=1 while signed in shows the
// authenticator SETUP view (QR code) — the landing page links here.
import {
  supabaseClient,
  getSignInState,
  hasAuthenticatorSetUp,
  signOutEverywhere,
  SIGN_IN_STATE,
} from './session.js';

const LANDING_PAGE_PATH = 'index.html';
// Supabase answers 400 for a wrong email/password; anything else (network
// down, rate limit) is a different problem and gets its real message shown.
const WRONG_CREDENTIALS_STATUS = 400;

// People sign in with a short username, but Supabase only knows email
// addresses. Each account's email is "apps-<username>@clawventures.llc" (mail
// to it lands in the clawventures.llc catch-all inbox), so the username
// "burgess" is the account apps-burgess@clawventures.llc. Typing a full email
// address still works, for accounts that were not created with that pattern.
const ACCOUNT_EMAIL_PREFIX = 'apps-';
const ACCOUNT_EMAIL_DOMAIN = 'clawventures.llc';

function emailForUsername(typedUsername) {
  const username = typedUsername.trim().toLowerCase();
  if (username.includes('@')) return username;
  return `${ACCOUNT_EMAIL_PREFIX}${username}@${ACCOUNT_EMAIL_DOMAIN}`;
}

const passwordView = document.getElementById('password-view');
const setupView = document.getElementById('authenticator-setup-view');
const codeView = document.getElementById('authenticator-code-view');
const errorMessage = document.getElementById('login-error');

// The authenticator factor being set up or verified in the current view.
let activeFactorId = null;

function showOnly(view) {
  for (const candidate of [passwordView, setupView, codeView]) {
    candidate.hidden = candidate !== view;
  }
  errorMessage.textContent = '';
  const firstInput = view.querySelector('input');
  if (firstInput) firstInput.focus();
}

function showError(text) {
  errorMessage.textContent = text;
}

// Runs one sign-in step with every button disabled, so a double click cannot
// start the same step twice (a second setup would cancel the QR code already
// on screen). Also turns a dropped connection into a visible message.
async function runStep(step) {
  const buttons = [...document.querySelectorAll('button')];
  for (const button of buttons) button.disabled = true;
  try {
    await step();
  } catch (unexpectedError) {
    showError(`Something went wrong: ${unexpectedError.message}`);
  } finally {
    for (const button of buttons) button.disabled = false;
  }
}

async function showViewForCurrentState() {
  const state = await getSignInState();
  const setupWasRequested = new URLSearchParams(window.location.search).has('setup');
  if (state === SIGN_IN_STATE.FULLY_SIGNED_IN) {
    if (setupWasRequested && !(await hasAuthenticatorSetUp())) {
      await startAuthenticatorSetupStep();
    } else {
      window.location.replace(LANDING_PAGE_PATH);
    }
  } else if (state === SIGN_IN_STATE.NEEDS_AUTHENTICATOR_CODE) {
    await startAuthenticatorCodeStep();
  } else {
    showOnly(passwordView);
  }
}

async function startAuthenticatorCodeStep() {
  const { data, error } = await supabaseClient.auth.mfa.listFactors();
  if (error || data.totp.length === 0) {
    await signOutEverywhere();
    showOnly(passwordView);
    showError('Could not load your authenticator. Please sign in again.');
    return;
  }
  activeFactorId = data.totp[0].id;
  showOnly(codeView);
}

async function startAuthenticatorSetupStep() {
  // A setup that was started but never finished leaves an unverified factor
  // behind. Remove those so they do not pile up.
  const { data: existing } = await supabaseClient.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.status === 'unverified') {
      await supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabaseClient.auth.mfa.enroll({
    factorType: 'totp',
    // Unique name: if a leftover factor could not be removed above, a fixed
    // name would clash with it and setup could never be completed.
    friendlyName: `Authenticator app ${Date.now()}`,
  });
  if (error) {
    // Setup is optional, so stay signed in; just report why it did not start.
    showOnly(setupView);
    showError(`Could not start authenticator setup: ${error.message}`);
    return;
  }
  activeFactorId = data.id;
  document.getElementById('authenticator-qr').src = data.totp.qr_code;
  document.getElementById('authenticator-secret').textContent = data.totp.secret;
  showOnly(setupView);
}

async function verifyAuthenticatorCode(code) {
  const { error } = await supabaseClient.auth.mfa.challengeAndVerify({
    factorId: activeFactorId,
    code: code.trim(),
  });
  if (error) {
    showError(`That code was not accepted (${error.message}). Check the app and try again.`);
    return;
  }
  window.location.replace(LANDING_PAGE_PATH);
}

document.getElementById('password-form').addEventListener('submit', (event) => {
  event.preventDefault();
  runStep(async () => {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: emailForUsername(document.getElementById('username').value),
      password: document.getElementById('password').value,
    });
    if (error) {
      showError(
        error.status === WRONG_CREDENTIALS_STATUS
          ? 'Username or password is not correct.'
          : `Could not sign in: ${error.message}`,
      );
      return;
    }
    await showViewForCurrentState();
  });
});

document.getElementById('setup-form').addEventListener('submit', (event) => {
  event.preventDefault();
  runStep(() => verifyAuthenticatorCode(document.getElementById('setup-code').value));
});

document.getElementById('code-form').addEventListener('submit', (event) => {
  event.preventDefault();
  runStep(() => verifyAuthenticatorCode(document.getElementById('login-code').value));
});

for (const button of document.querySelectorAll('.start-over-button')) {
  button.addEventListener('click', () =>
    runStep(async () => {
      await signOutEverywhere();
      showOnly(passwordView);
    }),
  );
}

runStep(showViewForCurrentState);
