# Deploying ApplyEngine

Same pattern as `personal-portfolio` (the RAG Agent): **backend → Render**, **frontend → Vercel**,
custom subdomains under `ajayshekhawat.uk`.

| Piece | Host | URL |
|---|---|---|
| Frontend (Next.js) | Vercel | `https://applyengine.ajayshekhawat.uk` |
| Backend (FastAPI) | Render | `https://applyengine-api.ajayshekhawat.uk` (or the free `*.onrender.com` URL) |

---

## 1. Push to GitHub

```bash
cd ~/Downloads/Github-Personal/applyengine
git add . && git commit -m "ApplyEngine: initial deploy"
gh repo create applyengine --public --source=. --push   # or create manually and: git push -u origin main
```

## 2. Backend on Render

1. New → **Blueprint** → point at this repo (it reads `render.yaml`).
2. Set the secret env vars (Dashboard → Environment):
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY` (optional)
3. Deploy. Health check: `https://<service>.onrender.com/api/health`.
4. (Optional custom domain) Settings → Custom Domains → add `applyengine-api.ajayshekhawat.uk`,
   then add the shown **CNAME** record at your DNS provider.

## 3. Frontend on Vercel

1. New Project → import this repo → **Root Directory = `frontend`**.
2. Environment Variables:
   - `NEXT_PUBLIC_API_URL = https://applyengine-api.ajayshekhawat.uk`
     (or the Render `*.onrender.com` URL if you skip the custom API domain)
3. Deploy.
4. Project → Settings → **Domains** → add `applyengine.ajayshekhawat.uk`.

## 4. DNS (at the `ajayshekhawat.uk` registrar)

| Type | Name | Value |
|---|---|---|
| CNAME | `applyengine` | `cname.vercel-dns.com` (value shown by Vercel) |
| CNAME | `applyengine-api` | value shown by Render (only if using a custom API domain) |

## 5. Lock CORS

`render.yaml` already sets `CORS_ORIGINS=https://applyengine.ajayshekhawat.uk`.
Update it if you add more origins, then redeploy.

---

### Notes
- Render free tier sleeps on idle and the SQLite disk is small — fine for a demo/portfolio.
  For durability, provision a Render Postgres and set `DATABASE_URL` to it.
- `autoDeploy: true` means every push to the default branch redeploys the backend.
