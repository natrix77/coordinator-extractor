# Deploy: Git + Netlify

## A) Upload the revised version to Git

### 1. Open a terminal in the project folder
```bash
cd c:\NewAI\coordinator-extractor
```

### 2. See what changed
```bash
git status
```

### 3. Stage all changes
```bash
git add .
```
(To stage only specific files, use `git add path/to/file` instead.)

### 4. Commit with a message
```bash
git commit -m "Remove local extraction button; fix OpenRouter fallback; ready for deploy"
```

### 5. Push to GitHub
**If this repo already has a remote (e.g. origin):**
```bash
git push origin main
```
(Use `master` instead of `main` if your default branch is `master`.)

**If you haven’t connected this folder to GitHub yet:**
1. Create a new repository on [github.com](https://github.com/new) (do **not** add a README or .gitignore).
2. Then run:
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```
Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and repo name.

---

## B) Deploy to Netlify

### 1. Build the app locally (optional check)
```bash
npm run build
```
You should see a `build` folder. Netlify will run this for you; this step is just to confirm the build works.

### 2. Sign in to Netlify
- Go to [netlify.com](https://www.netlify.com) and sign in (or create an account).
- Use “Add new site” → “Import an existing project”.

### 3. Connect to Git
- Choose **GitHub** (or GitLab/Bitbucket if you use that).
- Authorize Netlify to access your GitHub if asked.
- Select the repository that contains this project (e.g. `coordinator-extractor` or the name you gave it).

### 4. Configure build settings
Netlify usually detects Create React App. Use:

| Setting        | Value           |
|----------------|-----------------|
| **Build command**  | `npm run build`   |
| **Publish directory** | `build`        |
| **Base directory**  | (leave empty)   |

Click **Deploy site**.

### 5. Add environment variables (API keys)
After the first deploy (or from **Site settings** → **Environment variables**):

1. Open your site in Netlify → **Site configuration** → **Environment variables** (or **Site settings** → **Environment variables**).
2. Click **Add a variable** or **Add environment variables**.
3. Add the same keys you use in `.env`, for example:
   - **Key:** `REACT_APP_OPENROUTER_API_KEY` → **Value:** your OpenRouter key  
   - **Key:** `REACT_APP_GEMINI_API_KEY` → **Value:** your Gemini key  
   - **Key:** `REACT_APP_OPENAI_API_KEY` → **Value:** your OpenAI key (if you use it)
4. Save. Then trigger a **new deploy**: **Deploys** → **Trigger deploy** → **Deploy site** (so the new variables are used).

### 6. Optional: custom domain
In **Domain management** you can add your own domain or use the default `something.netlify.app` URL.

---

**Important:** Never commit `.env` to Git. Netlify uses the environment variables you set in the Netlify dashboard, not a file from the repo.
