# One simple account for the games (decided, nothing built)

Status: **decisions of the owner, 2026-11-26** (changes against the first draft are in section 0). The family signs in through the hub (JulOS, as now); everyone else gets a **"Juloc Games" account: one name and one password, no authenticator, no mail, one account for all games** (Drift, Block world, Battleship on the owner's website). Both kinds meet in the same lobbies and boards.

## 0. Decisions of 2026-11-26 (they win over the older text below where they differ)
1. **Provider: Drift.** To the outside it is called **"Juloc Games account"**, not "Drift account".
2. **Open registration from day one** (the public start, [ROADMAP.md](ROADMAP.md)), protected: limits per address and day, a proof of work of our own (section 3), a name filter, report and block by the administrator. Invitation links stay as a way in for friends but are not the only one.
3. **A separable module.** All of it lives in its own folder and namespace, `src/Drift/GameAccounts/` / `Drift.GameAccounts`, with its own tables prefixed `games_account_`, its own door (`/games-account/api/...`) and its own cookie (`__Host-games`), and **no reference from it to Drift's game code** (Drift's code asks it through one small interface, `IGameIdentity`). The aim: it can be cut out as a service of its own later without a rewrite. Tests of the module live in their own file set and run without the game.
4. **Family stays on the hub** (JulOS), as base users; their ids and the accounts' ids are both `Guid` and never collide (random v4 / v7), so lobby, races and boards take either.
5. **Hosting:** the owner's small server through the usual deployment tool, public behind the reverse proxy; the address is the owner's.

## 1. Where the account lives: proposal A, Drift is the provider
- **A (proposed):** the accounts are a table in Drift's database; the other games ask Drift to sign people in.
- **B:** the website's server holds them. It has **no database** today (it only serves files) and is the public front of everything: a password table there changes what the most exposed program carries.
- **Why A:** Drift already has PostgreSQL, Argon2id, sessions, rate limits and a sign-in page; the games on the website stay small and stateless. The price: a game on the website needs Drift to be up *to sign someone in* (once per session); playing goes on without it. CODE-01 ("works alone") holds: every game keeps working for guests and for the hub's people when Drift is away.
- **Not in the base's accounts:** the base requires a second factor (AUTH-06, MUST) and says so in its session check; a person without one cannot be a base user. So the game accounts are a **table of their own** with their own door and cookie, exactly like the guests (`/api/guest`), not rows of `users`. Hub people stay base users (role member) as now.

## 2. What a game account is
`game_account(id uuid, name text unique (case-insensitive), password_hash, created_at, state active|blocked, created_by, name_changed_at)`, `game_session(id, hash, account_id, created_at, last_seen, user_agent)`. The identity a game gets is only `{ id, display name, kind: account|hub }`, never the password or an address. The lobby, the races and the boards already take any `Guid` as the person (`Player`, `LobbyMember`), so an account fits where a guest and a hub person fit today; boards show the same name for both kinds (nickname, a game account's name, or the neutral name of a hub person).

## 3. Registration: open, with protection
- **Open registration** on the sign-up page: a name, a password (twice), and a small puzzle. No mail, no real name, and the page says so.
- **Limits:** per address (IPv4 itself, IPv6 the /64) at most 3 new accounts per day and 10 per week, and a global cap per hour that the administrator can change; over the limit the page says "try again tomorrow". Counted in `games_account_signup_log` (address key hashed with a server secret, so no raw addresses are kept longer than 7 days).
- **Proof of work of our own** instead of a foreign captcha: the server hands out a signed challenge `{ id, salt, difficulty, exp }` (60 s); the browser finds a nonce so that `SHA-256(salt + name + nonce)` has `difficulty` leading zero bits (Web Crypto, in a worker, about 1 s on a phone at the base difficulty); the server verifies with one hash and accepts each challenge once. The difficulty rises with recent sign-ups from the same address and with the global rate. It costs the server nothing and a script a little each time; it is **not** a guarantee against a determined attacker, and the document says so (the limits and the filter carry the rest).
- **Invitation links** (as guest links: hours, uses, hash only) remain for friends: they skip the puzzle, not the name rules.
- A guest session can be turned into an account on the same page ("keep my name").

## 4. Passwords, limits, lock
- **Argon2id** with the base's own parameters (`PasswordHasher`: 64 MiB, 3 passes, a salt per password); never logged; a login for an unknown name takes as long as for a known one (dummy hash), and says nothing about which part was wrong (AUTH-08).
- Length: **at least 8** characters (the base asks 12 because a password is its only secret there with the second factor; the owner wants it simple), a short list of the most common passwords refused, no composition rules.
- Failed attempts: the base's own limiter pattern: per account and per address (the /64 for IPv6) with a wait that doubles from 30 s to 15 min; the wait is the lock, there is no permanent lock-out by strangers. The administrator can block an account.

## 5. Names
3 to 16 characters, letters, digits, space, dot, dash, underscore, starting with a letter or digit; unique ignoring case; a short list of reserved words (admin, system, the games' own names); **no real name needed**, and the sign-up page says so. A **name filter** (a plain word list in a file the administrator can edit; letters folded: case, accents, lookalikes such as 0/o, 1/l/i, $/s, repeated letters) refuses insults, slurs and impersonation of the owner or the games; a refusal says only "this name is not allowed". Shown only as text. A person may change the name once in 30 days (boards keep up because they join on the id). A hub person's shown name stays the nickname or a neutral name.

## 6. Forgot the password
**Only the administrator resets**: they set a one-time temporary password (shown once), the person must choose a new one at the next sign-in, all their sessions end. No mail, no questions. The page for it says "ask the one who invited you".

## 7. Roles: a game account reaches games only
It has no role in the base, no access to `/api` of the base, the settings, the people or the guest links; its cookie is a different cookie on a different door. Administration stays with base admins (hub or own accounts): the list of game accounts, **reports** (a player can report another from the lobby, with a fixed reason; reports are rows, not text), **block** an account (sessions end at once), **ban an address range** for a time, reset a password, delete an account.

**No free text anywhere:** a person's name is the only text; the rest of communication is a fixed set of emotes.

## 8. Guest links
Stay as they are: a name, no account, times shown but not kept, for a few hours. They remain the "try it" door; an invitation link is the "stay" door. Both are made in the same card in the settings.

## 9. Deleting an account
The person deletes their own (password asked): the account, its sessions, its best times, stats and garage rows go (cascade); the name is free again after 30 days; a race in progress ends for them as a leave. The administrator can block or delete any game account. Hub accounts are deleted through the hub/people list as now.

## 10. Safety of the sign-in across two domains
Cookies do not travel between two domains, and the base's cookie is host-only (`__Host-`) on purpose. So a game on another domain **never sees Drift's cookie**; it gets a **short signed ticket** and makes its own host-only session:
1. the game redirects the browser to Drift's sign-in page with its own origin, a random `state` (also kept by the game in a cookie) and a PKCE-style challenge;
2. Drift signs the person in (own cookie, own page) and redirects back to a **registered** redirect address (an allowlist of game origins the administrator keeps) with a one-time **code**;
3. the game's server exchanges the code at Drift **server to server** (HTTPS, with the verifier) for `{ id, name, kind }` signed by Drift (ES256, 60 s, audience = the game's origin, a `jti` used once); the game checks the signature against Drift's public key (fetched and cached);
4. the game sets its own session cookie. Sign-out is per game, and Drift can tell the games (back channel, as the hub does) that an account was blocked or deleted, so their sessions end.
This is the same code flow the base already implements as a *client* of the hub; Drift would be the *provider* for a very small set of fixed clients (not a general OpenID provider). The password is only ever typed on Drift's own page.

## Open points (after the decisions)
1. The sign-in page's domain (a name people recognise as "the games' sign-in"); the owner settles the address.
2. The exact limits (3 a day, 10 a week) are a first guess; tune them with the load test and the first week.
3. Texts for privacy and imprint are the owner's; the sign-up page links them and cannot go live without them.
4. The ticket flow for the website's games (section 10) is built when the first website game needs it, not in 0.2.
