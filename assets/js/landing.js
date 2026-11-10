// Landing page: only shows the app boxes to a fully signed-in visitor.
import { requireFullySignedIn, hasAuthenticatorSetUp, signOutAndGoToLogin } from './session.js';

const LOGIN_PAGE_PATH = 'login.html';

if (await requireFullySignedIn(LOGIN_PAGE_PATH)) {
  document.getElementById('page-content').hidden = false;
  document
    .getElementById('sign-out-button')
    .addEventListener('click', () => signOutAndGoToLogin(LOGIN_PAGE_PATH));
  document.getElementById('authenticator-prompt').hidden = await hasAuthenticatorSetUp();
}
