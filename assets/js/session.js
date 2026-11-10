// Sign-in state shared by every page on the site.
//
// "Fully signed in" means password AND authenticator-app code (Supabase calls
// this assurance level "aal2"). The database rules for the to-do list require
// aal2 too, so this check is a convenience for redirecting — the real
// enforcement is in the database, not here.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// window.supabase is defined by assets/js/vendor/supabase-js-*.umd.js, which
// each page loads with a plain <script> tag before its module script.
export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const SIGN_IN_STATE = Object.freeze({
  SIGNED_OUT: 'signed_out',
  NEEDS_AUTHENTICATOR_SETUP: 'needs_authenticator_setup',
  NEEDS_AUTHENTICATOR_CODE: 'needs_authenticator_code',
  FULLY_SIGNED_IN: 'fully_signed_in',
});

export async function getSignInState() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData.session) return SIGN_IN_STATE.SIGNED_OUT;

  const { data: levels, error } =
    await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return SIGN_IN_STATE.SIGNED_OUT;

  if (levels.currentLevel === 'aal2') return SIGN_IN_STATE.FULLY_SIGNED_IN;
  // nextLevel is 'aal2' only when a verified authenticator already exists.
  if (levels.nextLevel === 'aal2') return SIGN_IN_STATE.NEEDS_AUTHENTICATOR_CODE;
  return SIGN_IN_STATE.NEEDS_AUTHENTICATOR_SETUP;
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
