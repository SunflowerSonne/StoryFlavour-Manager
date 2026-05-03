# StoryFlavour Manager

SillyTavern extension for managing StoryFlavour profiles — quickly switch between combinations of **Accents, Genre, Tone, and WriteStyle** with one click instead of toggling each entry manually.

## Installation

1. Copy the `StoryFlavour-Manager` folder to `public/scripts/extensions/third-party/`
2. Restart SillyTavern
3. Find **StoryFlavour Manager** in Extensions settings

## Requirements

- SillyTavern 1.12+
- Four lorebooks with these exact names: `SF_Accents`, `SF_Genre`, `SF_Tone`, `SF_WriteStyle`
- Entries in each lorebook must have the `outletName` field set (`Accent`, `Genre`, `Tone`, `WriteStyle`)

## How It Works

- **Profiles** are global — one shared library usable in any chat
- **Active profile selection** is per-chat (stored in chat metadata)
- When you switch profiles, the extension runs `/wi-set-entry-field` commands to toggle each World Info entry
- **Auto-switch** re-applies the last active profile when you open a chat

## Features

- Create, edit, delete profiles
- One-click profile switching (radio buttons)
- Auto-apply on chat switch
- Export/import profiles as JSON

## License

AGPLv3
