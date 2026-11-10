# claw-apps-site

Private landing page for Adam's apps at **https://apps.clawventures.llc** — one box per app, behind a login that needs a password and an authenticator-app code.

Plain HTML, CSS and JavaScript. No build step, no framework. Hosted on GitHub Pages from the `main` branch.

## Layout

```
index.html                 Landing page — the app boxes
login.html                 Sign-in (password, then authenticator app)
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
(`supabase/migrations/005_todo_tasks.sql` in that repo).

Security is enforced in the database: a row is only readable or writable by its owner, and only
in a session that passed the authenticator-app step. The checks in `session.js` just redirect
people to the login page; they are not the protection.

This repo is public. Never commit a secret here — the anon key in `config.js` is public by design.

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
