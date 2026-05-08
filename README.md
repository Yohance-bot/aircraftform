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

## WhatsApp Bot

The backend exposes a WhatsApp Cloud API webhook plus an admin-only
"bot tester" endpoint. Parents who message the camp's WhatsApp number
get an interactive menu, FAQ replies, a registration lookup, and (when
`GROQ_API_KEY` is set) a Groq-powered free-text Q&A grounded in
[backend/faq_knowledge.txt](backend/faq_knowledge.txt).

### Required env vars (added to `backend/.env`)

```
PHONE_NUMBER_ID=                 # from Meta → WhatsApp → API Setup
WHATSAPP_BUSINESS_ACCOUNT_ID=
ACCESS_TOKEN=                    # Meta access token (long-lived recommended)
WEBHOOK_VERIFY_TOKEN=letsfly     # any string; you'll paste this into Meta
GROQ_API_KEY=                    # optional; bot still works for menu/FAQ
FRONTEND_URL=http://localhost:5173
CONTACT_NUMBER=+91XXXXXXXXXX     # shown in the "Speak to Us" reply
```

### Local testing with ngrok

1. Start the backend: `uvicorn main:app --reload --port 8000`.
2. Install ngrok if you haven't: `brew install ngrok` (or download from
   <https://ngrok.com/download>).
3. In another terminal: `ngrok http 8000`. Copy the `https://...ngrok-free.app`
   URL it prints.
4. Open the Meta Developer Console → your app → **WhatsApp** →
   **Configuration** → **Webhooks**.
5. Set **Callback URL** to `<ngrok_url>/webhook/whatsapp` and
   **Verify Token** to `letsfly` (must match `WEBHOOK_VERIFY_TOKEN` in
   `.env`). Click **Verify and Save**.
6. Subscribe to the **messages** field.
7. WhatsApp **Hi** to the test number from the API Setup tab.
8. You should receive the interactive menu within a couple of seconds.

### Verifying it works

- Menu appears after sending **Hi** → list message working.
- Tap **Check My Registration** → DB query working (the bot looks the
  parent up by the last 10 digits of their phone number).
- Tap **Schedule & Timings** → FAQ reply working.
- Send a free-text question like "What will my child learn?" → Groq RAG
  working (or you'll get the canned fallback if `GROQ_API_KEY` is
  unset).
- Submit the registration form → confirmation WhatsApp arrives a few
  seconds later (it runs as a FastAPI background task so the form
  response is never delayed).

### Bot Tester (no WhatsApp required)

The Admin dashboard at `/admin` has a **Bot Tester** tab that exercises
the dispatcher locally:

- **Simulate (dry run)** — runs the same code path as the webhook but
  captures every outbound payload and shows the raw JSON in the UI.
  Useful for QA without spamming a real number.
- **Send for real** — actually POSTs the messages to the Meta Graph API
  and delivers them to the phone number you enter.

Special syntax in the message field:

- `list:schedule`, `list:check_registration`, etc. — simulate the user
  picking a row from the interactive menu.
- `button:back_to_menu` — simulate the back-to-menu button tap.
- Anything else is treated as plain text.

### Deploying to Render

When deploying via Render Blueprint, the new env vars in
[render.yaml](render.yaml) are all `sync: false` — fill them in once
on the `amc-backend` service page in the Render dashboard. The
`amc-frontend` service does not need any new vars.

---

## Project layout

```
.
├── backend/
│   ├── main.py             FastAPI routes + startup table creation
│   ├── models.py           SQLAlchemy `Registration` model
│   ├── database.py         Engine + session, SQLite fallback
│   ├── whatsapp_client.py  Single async send_whatsapp() with dry-run capture
│   ├── whatsapp_messages.py All bot copy + senders (menu, FAQ, lookup, etc.)
│   ├── webhook_router.py   /webhook/whatsapp GET (verify) + POST (dispatch)
│   ├── bot_router.py       /api/test-bot for the admin Bot Tester tab
│   ├── groq_agent.py       Groq RAG over faq_knowledge.txt with fallback
│   ├── faq_knowledge.txt   FAQ corpus used by the RAG prompt
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
