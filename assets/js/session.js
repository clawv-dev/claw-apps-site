// Sign-in state shared by every page on the site.
//
// The authenticator app is OPTIONAL. "Fully signed in" means: password, plus
// the authenticator code IF an authenticator has been set up for the account.
// (Supabase calls password-only "aal1" and password+code "aal2".) The database
// rules for the to-do list apply the same test, so this check is a convenience
// for redirecting — the real enforcement is in the database, not here.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// window.supabase is defined by assets/js/vendor/supabase-js-*.umd.js, which
// each page loads with a plain <script> tag before its module script.
export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const SIGN_IN_STATE = Object.freeze({
  SIGNED_OUT: 'signed_out',
  NEEDS_AUTHENTICATOR_CODE: 'needs_authenticator_code',
  FULLY_SIGNED_IN: 'fully_signed_in',
});

export async function getSignInState() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData.session) return SIGN_IN_STATE.SIGNED_OUT;

  const { data: levels, error } =
    await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return SIGN_IN_STATE.SIGNED_OUT;

  // nextLevel is 'aal2' only when a verified authenticator exists. If one does
  // and this session has not passed the code step yet, the code is still owed.
  const codeStillOwed = levels.nextLevel === 'aal2' && levels.currentLevel !== 'aal2';
  return codeStillOwed ? SIGN_IN_STATE.NEEDS_AUTHENTICATOR_CODE : SIGN_IN_STATE.FULLY_SIGNED_IN;
}

// True when the signed-in account has a working authenticator app set up.
export async function hasAuthenticatorSetUp() {
  const { data, error } = await supabaseClient.auth.mfa.listFactors();
  return !error && data.totp.length > 0;
}

// Call at the top of every protected page. Resolves to true when the visitor
// is fully signed in; otherwise sends them to the login page and resolves false.
export async function requireFullySignedIn(loginPagePath) {
  const state = await getSignInState();
  if (state === SIGN_IN_STATE.FULLY_SIGNED_IN) return true;
  window.location.replace(loginPagePath);
  return false;
}

// Signs out on the server and in this browser. If the server cannot be reached
// (offline), the normal sign-out leaves the saved sign-in in place, so fall
// back to clearing it from this browser only.
export async function signOutEverywhere() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) await supabaseClient.auth.signOut({ scope: 'local' });
}

export async function signOutAndGoToLogin(loginPagePath) {
  await signOutEverywhere();
  window.location.replace(loginPagePath);
}
