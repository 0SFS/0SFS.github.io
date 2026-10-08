# Fork.20 SDK-only rollback declaration

These declarations were captured immediately before fork.21 adoption on 2026-10-08.
The native/SDK source is ea6956b4e9f9bddc04ef22863190ab1a8101e0f8 and the existing
immutable deps/felipegalind0-jsbsim-1.2.4-fork.20.tgz is retained.

Fork.21 did not change aircraft XML, manifest, state schema or controller equations.
To roll back, restore the fork.20 dependency/integrity and accepted/default SDK
identity from these files, install the existing tarball, and verify it with
`npm run verify:jsbsim`. Preserve unrelated current package scripts/dependencies
and concurrent edits: these package snapshots include the then-current working
tree and are declarations, not instructions to replace entire files blindly.
The identity snapshot came from the preadoption app HEAD. No data migration
or aircraft XML restoration is required. The frozen-flow and reporting defects
return under fork.20; see the powered-lift record for the scope of the correction.
