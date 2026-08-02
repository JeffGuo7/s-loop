# Voice and Soul Capability

## Capability

S-Loop exposes all 53 speaker identities bundled with `kokoro-multi-lang-v1_0`, grouped by voice origin and gender. Chinese voices remain the recommended default, while IDs 0–44 are available as English or experimental-accent choices.

Every text-to-speech entry point uses one speakable-text policy. Visual emoji, flags, skin-tone sequences, ZWJ sequences, Markdown images, code, and raw URLs never reach Kokoro.

Each agent has a durable profile made from `IDENTITY.md`, `SOUL.md`, `RULES.md`, and `MEMORY.md`. `USER.md` is shared across agents. Conversation mode changes expression but never changes safety, permissions, or factual standards.

## Constraints

- Keep the installed `kokoro-multi-lang-v1_0` model and default speaker ID 47.
- The current sherpa-onnx frontend supports Chinese and English text. Other labels describe voice origin/accent identity, not full language support.
- Soul must identify itself as AI and must not invent a human biography, consciousness, or relationship history.
- Long-term memory is human-reviewed. Secrets, credentials, raw tool output, and untrusted web content are not automatic memory.
- Text may display emoji; the spoken channel removes them deterministically.

## Implementation Contract

Voice catalog:

- IDs 0–19: American, IDs 20–27: British.
- IDs 28–44: Spanish, French, Hindi, Italian, Japanese, and Portuguese voice identities.
- IDs 45–52: recommended Chinese voices.
- The selector provides recommended, American, British, other, and all filters, plus gender and search filters.

Prompt assembly order:

1. Runtime and safety contract.
2. `RULES.md`.
3. `IDENTITY.md`.
4. `SOUL.md`.
5. shared `USER.md`.
6. reviewed `MEMORY.md`.
7. work, natural, or companion mode overlay.
8. optional voice-channel overlay.

The assembled profile is sent once as the system prompt. Agent instructions are never duplicated inside the user message. Chat and headless runtime use the same assembler.

## Non-goals

- Replacing Kokoro, voice cloning, or adding automatic emotion/prosody synthesis.
- Claiming nine-language text support.
- Automatic long-term memory collection.
- Giving the visual pet a second personality that conflicts with the active agent.

## Acceptance Criteria

- Every integer speaker ID from 0 through 52 is selectable, persisted, and accepted by Rust; all other values fall back or are rejected at the appropriate boundary.
- Chinese speaker names remain localized and ID 47 remains the default.
- Automatic conversation and manual read-aloud produce the same cleaned speech text.
- Combined emoji sequences are removed without removing semantic values such as `25℃` and `80%`.
- Identity, soul, user profile, reviewed memory, and mode are observable in the assembled system prompt.
- Voice mode requests short plain speech without relying on the model to enforce emoji removal.

