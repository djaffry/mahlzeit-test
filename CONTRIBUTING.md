# Contributing to Forkcast

Thanks for your interest in contributing! Here's how to get involved.

## Reporting Bugs & Suggesting Features

Use the [issue templates](https://github.com/djaffry/mahlzeit-test/issues/new/choose), they'll guide you through what to include.

## Ways to Contribute Directly

### Add a Restaurant

See the detailed step-by-step guide in the [README: Adding a New Restaurant](README.md#adding-a-new-restaurant) section.

### Fix a Broken Scraper

Restaurant websites change frequently. If a scraper stops working:

1. Check what changed on the restaurant's website
2. Update the adapter in `scraper/src/restaurants/adapters/` to match the new structure
3. Run `cd scraper && npm run build && npm run scrape` to verify it works

### Improve the UI

The frontend is vanilla TypeScript in the `ui/` directory. No framework, just DOM APIs, CSS, and Vite.

### Add Translations

Translation files live in `ui/i18n/`. Add missing keys or improve existing translations.

## Code Style

- TypeScript strict mode throughout
- No frameworks on the frontend, keep it vanilla
- Use the existing color and style tokens (CSS variables) for any styling
- Write tests for logic (filters, tags, date handling, etc.)

## Pull Requests

- Keep PRs focused, one feature or fix per PR
- Reference the related issue
- Make sure `npm run typecheck` and `npm test` pass
- Add tests for new logic where applicable
- Review your own changes at least once before submitting

## Getting Started

1. Read the README.md in its entirety to get familiar with the project and the processes. 
2. [Open an issue](https://github.com/djaffry/mahlzeit-test/issues/new) describing what you'd like to work on
3. Fork the repository and create a branch from `main`. **If you're testing voting**, change the `appId` in `rooms/config/app.json` first so your test events don't end up in the default voting channel.
4. Make your changes
5. Run tests, checks and verify before submitting
6. Open a pull request and reference the issue
