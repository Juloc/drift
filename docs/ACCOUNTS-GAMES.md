# One simple account for the games (draft, nothing built)

Status: **draft 2026-11-26** for the owner's decision "both": the family signs in through the hub (JulOS, as now), friends get a **simple game account: one name and one password, no authenticator, no mail**, valid for all games (Drift, later Block world and Battleship on juloc.de). Both kinds meet in the same lobbies and boards. Short on purpose; the open points are at the end.

## 1. Where the account lives: proposal A, Drift is the provider
- **A (proposed):** the accounts are a table in Drift's database; the other games ask Drift to sign people in.
- **B:** the website's server holds them. It has **no database** today (it only serves files) and is the public front of everything: a password table there changes what the most exposed program carries.
- **Why A:** Drift already has PostgreSQL, Argon2id, sessions, rate limits and a sign-in page; the games on the website stay small and stateless. The price: a game on the website needs Drift to be up *to sign someone in* (once per session); playing goes on without it. CODE-01 ("works alone") holds: every game keeps working for guests and for the hub's people when Drift is away.
- **Not in the base's accounts:** the base requires a second factor (AUTH-06, MUST) and says so in its session check; a person without one cannot be a base user. So the game accounts are a **table of their own** with their own door and cookie, exactly like the guests (`/api/guest`), not rows of `users`. Hub people stay base users (role member) as now.

## 2. What a game account is
`game_account(id uuid, name text unique (case-insensitive), password_hash, created_at, state active|blocked, created_by, name_changed_at)`, `game_session(id, hash, account_id, created_at, last_seen, user_agent)`. The identity a game gets is only `{ id, display name, kind: account|hub }`, never the password or an address. The lobby, the races and the boards already take any `Guid` as the person (`Player`, `LobbyMember`), so an account fits where a guest and a hub person fit today; boards show the same name for both kinds (nickname, a game account's name, or the neutral name of a hub person).

## 3. Registration: invitation, not open
- **Proposal:** the administrator makes an **invitation link** (like a guest link: hours, number of uses, shown once, only a hash kept; may be for several friends). Whoever opens it chooses a name and a password and has an account. **Open registration** exists as a setting, **off** by default (rate-limited per address and with a daily cap when on).
- A guest session can be turned into an account on the same page ("keep my name") when the link allows it.

## 4. Passwords, limits, lock
- **Argon2id** with the base's own parameters (`PasswordHasher`: 64 MiB, 3 passes, a salt per password); never logged; a login for an unknown name takes as long as for a known one (dummy hash), and says nothing about which part was wrong (AUTH-08).
- Length: **at least 8** characters (the base asks 12 because a password is its only secret there with the second factor; the owner wants it simple), a short list of the most common passwords refused, no composition rules.
- Failed attempts: the base's own limiter pattern: per account and per address (the /64 for IPv6) with a wait that doubles from 30 s to 15 min; the wait is the lock, there is no permanent lock-out by strangers. The administrator can block an account.

## 5. Names
3 to 16 characters, letters, digits, space, dot, dash, underscore, starting with a letter or digit; unique ignoring case; a short list of reserved words (admin, system, the games' own names); **no real name needed**, and the sign-up page says so. Shown only as text. A person may change the name once in 30 days (boards keep up because they join on the id). A hub person's shown name stays the nickname or a neutral name.

## 6. Forgot the password
**Only the administrator resets**: they set a one-time temporary password (shown once), the person must choose a new one at the next sign-in, all their sessions end. No mail, no questions. The page for it says "ask the one who invited you".

## 7. Roles: a game account reaches games only
It has no role in the base, no access to `/api` of the base, the settings, the people or the guest links; its cookie is a different cookie on a different door. Administration stays with base admins (hub or own accounts).

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

## Open points for the owner
1. **A or B?** Proposal A (Drift provides). 2. **Registration:** invitation links only, open registration off? 3. **Password length 8** (the base asks 12). 4. **Name change** once in 30 days? 5. Which domain does the sign-in page live on (a name that people recognise as "the games' sign-in")? 6. Build order proposal: the account table and sign-in inside Drift first (also used by Drift's own lobby), the ticket flow for the website's games after the first of them needs it.
