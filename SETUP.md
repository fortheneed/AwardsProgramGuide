# Awards Program Guide — setup and how editing works

The site is plain files in `public/`. Netlify publishes `public/` from the **Main** branch.
Editing happens on the live site (Edit button). Nothing secret is stored in this repository.

## How edits travel
1. Someone clicks **Edit**, enters the editing password, changes text/pictures, and clicks **Save**.
2. Save writes one commit to a holding branch called **`edits`**. Netlify does not deploy that branch, so saving costs no deploys.
3. The edits go live in one of two ways:
   - automatically at **6:00 am Pacific Daylight Time** (a GitHub Action merges `edits` into `Main`; if nothing changed, nothing deploys), or
   - when someone clicks **Publish now** (asks for confirmation first, because it uses a Netlify deploy).
4. Only the person editing sees their saved-but-unpublished changes. Everyone else sees the last published version.

## One-time setup in Netlify
Project configuration → **Environment variables** → add both:

| Name | Value |
|---|---|
| `EDIT_PASSWORD` | the shared editing password |
| `GITHUB_TOKEN` | a GitHub *fine-grained* token (below) |

Mark them as secret/sensitive if Netlify offers it. After adding or changing a variable, run **Deploys → Trigger deploy** so the site picks it up.
Changing `EDIT_PASSWORD` signs everyone out of editing immediately.

Also check Project configuration → **Build & deploy → Branches and deploy contexts**: set **Branch deploys** to *None* (or production branch only), so the `edits` branch never triggers a deploy.

## Creating the GitHub token
GitHub → profile photo → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
- Resource owner: **fortheneed**
- Repository access: **Only select repositories → AwardsProgramGuide**
- Repository permissions: **Contents: Read and write** (Metadata: read is added automatically)
- Expiration: pick a date and put a reminder in your calendar. When a token expires, saving shows "GitHub refused the saved key" and you just make a new one.
(If the organization requires approval for tokens, an organization owner approves it once.)

## Things to know
- `public/awards.json` is the content. Edit it on the site, not by hand and not by regenerating it, or the two copies can conflict.
- Images are saved in `public/images/`, resized automatically (charm art max 700px, photos max 1400px).
- If the live branch and the edits both changed `awards.json`, Publish now will say it can't merge. That should only happen if the file was edited outside the site.
- Run the tests: `node --test tests/` (uses a simulated GitHub, not the real one).
