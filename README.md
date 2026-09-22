# BeReal Memories

Turn your official BeReal data export into a private, browsable website — memories grid, comments, Realmojis, chats, and profile.

Static HTML/CSS/JS. No accounts, no backend, no upload to a third party.

## Quick start

1. **Request your data** from BeReal (Settings → download / privacy export) and unzip it.
2. Clone this repo.
3. Either drop the unzipped folder into `./data/`, or pass its path to setup:

```bash
python3 setup.py /path/to/your-unzipped-export
# optional soft gate:
python3 setup.py /path/to/your-unzipped-export --password 'your-secret'
```

4. Serve locally (browsers block `fetch` of local JSON via `file://`):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

`setup.py` writes `config.js` (gitignored) with your export path, user id, and conversation ids.

## What you get

- **Memories** — front/back photos, captions, late vs on-time, search & year filters
- **Comments** — grouped by post
- **Realmojis** — yours + reactions
- **Chats** — threads from the export
- **Profile** — account snapshot from `user.json`

## Hosting your own site

Anything that serves static files works (a USB stick, a home NAS, Netlify, Cloudflare Pages, an S3 bucket, etc.).

**Do not commit your export.** Photos and chats are personal. Keep `config.js` and the export folder out of git (already covered by `.gitignore`).

The password gate is a soft UI lock only. Anyone who can download the static files can still read them.

## Repo layout

| Path | Purpose |
|------|---------|
| `index.html` / `styles.css` / `app.js` | The viewer |
| `setup.py` | Detects your export → writes `config.js` |
| `config.example.js` | Shape of the generated config |
| `data/` | Suggested place to put your unzipped export (gitignored) |

## Privacy

This project only reads files you already downloaded from BeReal. It is not affiliated with BeReal / Voodoo.

## License

MIT — use it, fork it, make it yours.
