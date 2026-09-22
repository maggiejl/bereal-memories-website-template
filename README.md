# BeReal Memories Website Template

Received your BeReal data export but don't know how to view all of them in an easy way? Transform your BeReal memories into website format! This template makes it easy to view your memories, comments, Realmojis, chats, friends, and profile, all in one place.

This website can deploy locally, which means your data is safe and not uploaded anywhere.

## Example Website

An example of what the website would look like:
[BeReal Website example](https://maggiejl.github.io/bereal-memories-website-demo/).

## Instructions

1. **Request your data** from BeReal by going to Settings --> Help --> Contact Us --> Report a Problem --> Other --> Still need help? Select a topic --> I'd like to request a copy of my data --> fill in required fields --> Send.
2. Clone this repo.
3. After a few days, you should receive a message with two links. Download these files and unzip the folder.
4. Either drop the unzipped folder into `./data/`, or pass its path to setup (run the below command in Terminal but replace the "/path/to/your-unzipped-export" with the path to your unzipped folder):

```bash
python3 setup.py /path/to/your-unzipped-export
```

5. Serve locally:

```bash
python3 -m http.server 8000
```

6. You should be good to go! View your website at: http://localhost:8000

## Website Features

- **Memories** — front/back photos, captions, late vs on-time, search & year filters, ability to rotate the front photo
- **Comments** — grouped by post. BeReal's data export currently does not allow you to see what post the comments are under.
- **Realmojis** — yours + your reactions to other people's BeReals
- **Chats** — your chats included in the export
- **Profile** — account information and list of friends, which you can sort by chronological order

## Optional: Publishing your memories as a website

These instructions below make your BeReal photos, chats, and profile publicly reachable at a URL. Anyone with the link can view or download the files.

By default, `config.js` and your export (`data/`) are gitignored so they stay local.
To publish, you must commit them on purpose:

1) Run:

```bash
git add -f config.js data/
git commit -m "Publish BeReal export for GitHub Pages"
git push
```

2) In your GitHub repository, go to Settings --> Pages
3) Under "Source", choose "Deploy from a branch". Then, set "Branch" to "main" and folder to "/(root)".
4) Hit "Save"
5) Your website will be at https://<username>.github.io/<repo-name>/ after it deploys (usually takes a minute or two)! (You have to replace the <username> part with your GitHub username and <repo-name> with your GitHub repository name)

## Repo layout

| Path | Purpose |
|------|---------|
| `index.html` / `styles.css` / `app.js` | The viewer |
| `setup.py` | Detects your export → writes `config.js` |
| `config.example.js` | Shape of the generated config |
| `data/` | Suggested place to put your unzipped export (gitignored) |

## Privacy

This template is a local viewer for a BeReal data export you already downloaded. It runs in your browser from files on your computer. It does not collect any information or upload your data to any server.

This project is not affiliated with BeReal. BeReal’s own privacy policy still applies to how they handle your account and data export.
