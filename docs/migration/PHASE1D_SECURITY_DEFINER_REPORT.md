# Phase 1D SECURITY DEFINER Report

## Status

**SECURITY DEFINER = FAIL.**

Production read-only catalog assertions enumerated 51 SECURITY DEFINER routines and failed five gates:

1. One or more routines lack fixed safe `search_path`.
2. `scan_orphan_artist_links` remains executable without required actor authorization.
3. `cleanup_expired_tokens` remains executable by client roles.
4. Profile-name lookup remains executable by `anon` for arbitrary identity input.
5. Required copyright RPC contract remains absent.

No SQL migration was applied. The Phase 1C maintenance migration is only a partial candidate; it does not close all five failures. Required acceptance remains zero failing assertions plus intended admin/service success tests.
