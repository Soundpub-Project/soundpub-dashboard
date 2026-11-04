# Phase 1E SECURITY DEFINER

## Status

**SECURITY DEFINER = FAIL.**

Live read-only catalog test enumerated 51 SECURITY DEFINER routines and reproduced five failures:

1. One or more routines lack a fixed safe `search_path`.
2. `scan_orphan_artist_links` remains executable by client roles without required actor authorization.
3. `cleanup_expired_tokens` remains executable by client roles.
4. Profile-name lookup remains executable by `anon` for arbitrary identity input.
5. Active copyright RPC contract remains absent.

The narrower database-boundary assertion for `user_roles` and `rate_limits` passed. The staged maintenance migration passes isolated tests but is not deployed and does not close all five failures.

No SQL migration was applied because production change sequence remains blocked at credential closure. Required acceptance remains zero failing assertions plus intended service/admin success tests.

**Gate: FAIL.**
