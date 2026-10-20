# Quiet Create Coin drafts

Create Coin keeps the existing wallet authentication, local artwork preview, delayed Pinata preparation, transaction simulation and explicit wallet approval. Optional Developer Buy still defaults off and is capped at 350 basis points. Demo deployments cannot create coins or execute financial transactions.

## Background saving

Authenticated editors debounce valid, nonempty text changes for 900 ms. Pair/allocation defaults alone do not create a draft. Typing stays enabled during requests. A serialized writer is shared by autosave and explicit Create Coin preparation, so both use the latest confirmed server version.

A lost create response reuses the original payload and idempotency key before applying newer fields. A lost update is recovered only when a backend read proves the saved fields match. Foreign-wallet responses and responses from disposed editors are rejected. Concurrent edits from another tab are not silently overwritten: reopen My Drafts and confirm discarding unsaved changes before resuming the server version.

“Saved” appears only for the exact fields confirmed by the backend. Network failures show “Couldn't save — Retry.” Invalid fields remain editable but are not automatically persisted. Wallet changes cancel the old editor and clear its fields and draft list.

## Restoration and artwork

A stored launch-attempt hint restores the existing fee review/status component before editing or autosave can change its draft version. It reuses the existing idempotency/recovery mechanism and never signs or submits automatically.

A wallet/API-scoped browser pointer identifies the last saved backend draft; it contains no session token. Refresh restores server-owned text fields and already-uploaded artwork. A selected file stays local and is never uploaded by autosave. A browser marker records when a local image must be selected again after refresh; it does not retain or fabricate the file. Without browser storage, the most recently updated returned draft is used as a fallback.

The backend's storage capability determines the durability notice. PostgreSQL drafts persist; memory-demo drafts may disappear after a server restart. Background saves never generate IPFS metadata.

## Secondary controls

My Drafts is a compact, keyboard-accessible modal listing names, tickers, existing artwork and update times. Users can resume, start another token or delete a specific draft after confirmation. Switching editors first saves valid fields, or requires confirmation before discarding unsaved/invalid edits or local files. No drafts are deleted by the interface migration.

The header wallet control opens account details, authenticated status, switching guidance and sign out/disconnect. Addresses remain intentionally copyable. Full creator addresses and technical draft-management controls are removed from the creation form.

## Verification coverage

The draft writer has deterministic tests for serialized edits, uncertain writes, idempotency, conflicts, owner isolation and disposal. Browser coverage includes delayed responses while typing, retry, refresh, local-image loss, explicit deletion confirmation, wallet switching, demo restrictions and responsive layouts. Existing Create Coin, Developer Buy and recovery tests remain applicable. Browser wallet signers and Pinata fixtures do not replace physical Phantom acceptance.

Validation applies to the complete commit series. Intermediate UI/test commits may temporarily disagree until the accompanying browser expectations are committed.
