# Palm Meadows Aeromodelling Summer Camp — Registration App

A tiny full-stack app for collecting summer camp sign-ups.

- **Backend:** FastAPI + SQLAlchemy (SQLite locally, Postgres on Render)
- **Frontend:** React + Vite + Tailwind, with a paper-plane takeoff animation
  that ramps up as the form fills
- **Deploy:** one-click via `render.yaml` (Blueprint)

---

## 1. Local development

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env              # optional; SQLite works with zero config
# Edit .env and set ADMIN_KEY to whatever you like.

uvicorn main:app --reload --port 8000
```

- Health check: <http://localhost:8000/health>
- OpenAPI docs: <http://localhost:8000/docs>
- A `registrations.db` SQLite file is created next to `main.py` on first run.

### Frontend (Vite + React)

```bash
cd frontend
npm install
npm run dev
```

- App runs at <http://localhost:5173>
- Admin dashboard at <http://localhost:5173/admin>
- In dev, Vite proxies `/api/*` to `http://localhost:8000`, so no env vars
  are needed.

---

## 2. Deploying to Render

The included `render.yaml` is a Render **Blueprint** that provisions
everything in one go: a Postgres database, the FastAPI backend, and the
static frontend.

1. **Push to GitHub.** Fork/clone this repo and push to your own GitHub
   account. Render reads directly from GitHub.

2. **Create a new Blueprint on Render.**
   - Go to <https://dashboard.render.com/blueprints> → **New Blueprint**.
   - Connect the GitHub repo.
   - Render parses `render.yaml` and shows the three resources it will
     create: `amc-db` (Postgres), `amc-backend` (web service), `amc-frontend`
     (static site). Click **Apply**.

3. **Set environment variables** when prompted:
   - `ADMIN_KEY` (on `amc-backend`) — any strong random string. This is the
     password the admin dashboard will ask for.
   - `VITE_API_URL` (on `amc-frontend`) — the public URL of the backend
     service, e.g. `https://amc-backend.onrender.com`. You'll see the URL on
     the backend service page right after it's created.
   - `DATABASE_URL` (on `amc-backend`) is **auto-linked** from the managed
     `amc-db` Postgres instance — you don't need to touch it.

4. **Trigger a redeploy of the frontend** after setting `VITE_API_URL` so the
   correct API base URL is baked into the static build. (Render has a
   "Manual Deploy → Clear build cache & deploy" button.)

5. That's it. The backend creates tables on first boot, the form is live at
   the frontend URL, and `/admin` works as soon as you know the admin key.

> Free-tier Render services spin down when idle — the first request after
> inactivity takes ~30 seconds to cold-start.

---

## 3. Viewing submissions

- **Admin dashboard:** visit `https://<your-frontend>.onrender.com/admin`,
  enter the `ADMIN_KEY` you set on Render, and you'll see a table of every
  registration with name, contact info, age group, batch, and payment
  status.
- **Export to CSV:** click **Export CSV** in the top-right of the dashboard.
  The file is generated client-side from the data already on screen, so no
  extra backend work is needed.
- **Raw API:** you can also call it directly:

  ```bash
  curl -H "X-Admin-Key: $ADMIN_KEY" \
       https://amc-backend.onrender.com/api/registrations
  ```

---

## 4. Adding Google Sheets sync (later)

A Google Sheets mirror is not wired up yet, but here's the idea when you
want it:

1. Create a Google Cloud service account, enable the Sheets API, share your
   target spreadsheet with the service account email.
2. Add `gspread` and `google-auth` to `backend/requirements.txt`.
3. In `backend/main.py`, after `db.commit()` in `POST /api/register`, append
   a row to the sheet in a background task (so the response isn't blocked
   if Google is slow).
4. Store the service account JSON in a Render secret file and reference it
   via env var (e.g. `GOOGLE_APPLICATION_CREDENTIALS`).

Until then, the **Export CSV** button on `/admin` is the recommended way to
get data into a spreadsheet.

---

## Project layout

```
.
├── backend/
│   ├── main.py             FastAPI routes + startup table creation
│   ├── models.py           SQLAlchemy `Registration` model
│   ├── database.py         Engine + session, SQLite fallback
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx                   Routes: /, /admin
│   │   ├── api.js                    fetch helpers, reads VITE_API_URL
│   │   ├── components/
│   │   │   ├── RegistrationForm.jsx  Tabs, validation, submit, success UI
│   │   │   ├── PlaneSky.jsx          Background clouds + takeoff animation
│   │   │   └── AdminDashboard.jsx    Login, table, CSV export
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vite.config.js
│   └── package.json
├── render.yaml             Blueprint: db + backend + frontend
└── README.md
```
