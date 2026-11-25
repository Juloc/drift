# base/ (a copy, do not edit)

This folder is a copy of the shared base of the app family: the C# modules (`src/Base.*`), the look (`ui/`) and the rulebook (`RULES.md`).
`VERSION` says which version of the base it is, `MANIFEST` holds a checksum of every file.

Nothing in here is changed in this app. A change belongs into the base repository and comes back with its `scripts/sync-base.sh`;
`scripts/check-app.sh` shows whether this copy was edited and how far it is behind.
