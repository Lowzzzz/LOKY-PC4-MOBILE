# iOS 0.3.0 — Gemini Live Native Candidate

Scope: Mobile only.

- Frozen Sphere Core 15K remains hash-protected.
- Conversation uses Gemini Live client-to-server WebSocket with ephemeral tokens.
- Standard Gemini API keys never enter GitHub Pages or the browser.
- Token provisioning runs in the private Supabase Edge Function `loky-pc4-mobile-token`.
- Owner device activation uses a capability stored only on the physical device; the raw capability is not committed to GitHub.
- Native input: PCM16 mono 16 kHz.
- Native output: PCM16 mono 24 kHz.
- Automatic VAD and barge-in enabled.
- Session resumption handle captured for reconnect.
- No local/Qwen/speechSynthesis fallback is allowed in this candidate.
- LOKY PC4 Desktop remains completely out of scope.

Promotion gate: automated validation must pass, then real iPhone test of connect, natural voice, interruption, and 20-turn stability.
