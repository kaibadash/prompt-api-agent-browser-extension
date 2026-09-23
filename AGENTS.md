# AGENTS.md

Guidance for coding agents working in this repository.

## Project

Chrome extension (WXT, React, Manifest V3) that talks to the browser Prompt API. Chrome is the primary target; Firefox scripts exist but are secondary.

```bash
pnpm dev       # Chrome dev build with reload
pnpm compile   # Typecheck
pnpm build     # Production Chrome build
```

## Language

Create resources in English by default. This project supports multiple languages.

English (`en`) is the source locale. Every user-facing string — UI copy, the extension name and description, and errors shown to the user — is authored in English first, then translated. Do not add a string that exists only in another language.

### Where strings live

```
public/_locales/en/messages.json          # required source of truth
public/_locales/<locale>/messages.json    # translations, same keys (for example ja)
```

Message shape:

```json
{
  "promptApiAvailable": {
    "message": "Prompt API is available in this browser.",
    "description": "Shown in the side panel when LanguageModel exists."
  }
}
```

- Set `manifest.default_locale` to `"en"`.
- Reference manifest strings as `__MSG_<key>__`.
- Read strings in code with `browser.i18n.getMessage("<key>")`.
- Keep keys identical across locales. Add the English entry before any translation.
- When a locale is missing a key, the English message is the fallback. Still add the key to existing locale files in the same change when a translation is known.
- Leave identifiers, comments, and commit messages in English. Do not hardcode user-visible copy in components or scripts.
