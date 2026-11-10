# claw-apps-site

Private landing page for Adam's apps at **https://apps.clawventures.llc** — one box per app, behind a password login. An authenticator app (second step) is optional and can be switched on from the landing page; once set up, it is required at every sign-in.

Plain HTML, CSS and JavaScript. No build step, no framework. Hosted on GitHub Pages from the `main` branch.

## Layout

```
index.html                 Landing page — the app boxes
login.html                 Sign-in (password, then authenticator code if set up); ?setup=1 = authenticator setup
todo/index.html            To-Do List app
assets/style.css           One stylesheet for every page
assets/js/config.js        Supabase project URL + public anon key
assets/js/session.js       Shared sign-in check used by every page
assets/js/login.js         Login page behaviour
assets/js/landing.js       Landing page behaviour
assets/js/todo.js          To-Do List behaviour
assets/js/vendor/          Supabase's official browser library, copied in (not loaded from a CDN)
CNAME                      Tells GitHub Pages the custom domain
```

## Backend

All boxes share one Supabase project: the **TradeRanker** project (`wudphhhkegjwlxuhkfht`).
Database migrations for it live in the `clawv-dev/trade-ranker` repo, not here — that repo owns
the project's migration history. The to-do table is `public.todo_tasks`
(`supabase/migrations/005_todo_tasks.sql` in that repo). Deleting a task only sets its
`deleted_at` column (`006_todo_tasks_deleted_at.sql`); it then shows in the page's "Deleted"
section, tagged Finished or Not finished, where it can be restored or deleted forever.

Security is enforced in the database: a row is only readable or writable by its owner, and — if
the owner has set up an authenticator app — only in a session that passed the authenticator step. The checks in `session.js` just redirect
people to the login page; they are not the protection.

This repo is public. Never commit a secret here — the anon key in `config.js` is public by design.

## Accounts and usernames

People sign in with a username. Supabase only knows emails, so `login.js` turns the username
`name` into `apps-name@clawventures.llc`. To add an account: in the Supabase dashboard create a
user with that email (public sign-up is off). The family account is username `burgess`
(`apps-burgess@clawventures.llc`); it owns the to-do list and nothing else.

## Adding an app box

1. Give the app its own folder (like `todo/`) and its own table-name prefix in the database (like `todo_`).
2. Start its page script with `requireFullySignedIn(...)` from `assets/js/session.js`.
3. Add a box for it in `index.html`.

Keeping each app in its own folder and table prefix is what lets it be split off into its own
project later: move the folder and those tables.

## Running locally

```
python -m http.server 8090
```

Then open http://localhost:8090/ .

## Updating the Supabase library

Copy `node_modules/@supabase/supabase-js/dist/umd/supabase.js` from a project that has the wanted
version installed into `assets/js/vendor/`, with the version in the file name, and update the
three `<script src=...>` tags.
