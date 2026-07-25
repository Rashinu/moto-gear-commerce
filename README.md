# Moto Gear Commerce

A full-stack e-commerce storefront with an admin dashboard, built with Node.js/Express.
Products, categories, and homepage banner/settings are all managed from the admin panel —
changes go live on the storefront immediately.

## Requirements

**Node.js** (v18+) must be installed. If not: download the "LTS" version from
https://nodejs.org

## Running locally

**Windows:** double-click `start.bat`. It installs dependencies automatically, starts the
server, and opens the site in your browser.

**Mac / Linux:** in this folder, run `./start.sh`.

**Manual:**
```bash
npm install
npm start
```

Then in your browser:
- Storefront: http://localhost:3000
- Admin panel: http://localhost:3000/admin.html

## First login

On first run, the server console prints something like:

```
First run: an admin password was generated automatically.
Default password: alanya2026
```

Log in with that password, then go to **"Change Password"** and set your own.

## What you can do from the admin panel

- **Products**: add, edit, delete, drag-and-drop reorder (this order drives the
  storefront's default listing order). Upload a product image from your own computer.
- **Categories**: create, rename, delete, drag-and-drop reorder. Deleting a category
  that still has products in it reassigns those products to "Uncategorized" (products
  are never deleted).
- **Site Settings / Banner**: homepage banner title, subtitle, banner image, phone,
  WhatsApp number, email, and address.
- **Change Password**: update your admin login password.

All changes are stored in `data/db.json` — don't delete this file, and keep backups.

## Current limitations

- **No payment gateway.** The "Complete Order" button currently sends an order summary
  to WhatsApp; it does not process card payments. For real online payments you'd need
  to integrate:
  - **iyzico** or **PayTR** (popular in Turkey, instant card processing)
  - Or a **Shopier API** integration if syncing with an existing Shopier store
- **Legal pages are empty.** The footer links ("Shopping Safety", "Pre-Info Form",
  "Distance Sales Agreement", "Personal Data Protection") are placeholders (`#`) —
  required by law for e-commerce in Turkey, need real content.
- **Single admin user.** No username, just one shared password. Add multi-user support
  if you need it.
- **Local file storage.** Product images are saved to `public/uploads`. When moving to
  a host, make sure this folder is included/backed up (some free hosts don't persist
  the filesystem — in that case you'd need S3/Cloudinary instead).

## Deploying

This app has a backend (Node.js server), so static-only hosts (like GitHub Pages) won't
work. Use one of:

- **Render.com** or **Railway.app**: host Node.js apps for free/low cost, connect your
  GitHub repo for auto-deploy.
- **VPS** (DigitalOcean, Hetzner, etc.): run `npm install && npm start`, point a domain
  at it (usually kept alive with a process manager like `pm2`).

### Render.com free tier caveat — and how this repo avoids it for free

Render's free tier has an **ephemeral filesystem** — the service "sleeps" after 15
minutes of inactivity, and on wake-up, any changes made from the admin panel (new
products, deleted categories, uploaded images) reset to whatever is committed in this
repo, if data is stored on the local disk (the default).

This repo avoids both problems **without paying anything**:

1. **Sleep**: set up a free uptime monitor (e.g. [UptimeRobot](https://uptimerobot.com),
   free plan, 5-minute interval) pinging `https://YOUR-APP.onrender.com/api/storefront`.
   This keeps the service from ever going idle long enough to spin down.
2. **Data reset**: connect a free, permanent Postgres database (e.g.
   [Neon.tech](https://neon.tech) — unlike Render's own free Postgres, which expires
   after 30 days, Neon's free tier does not expire) and a free image host (e.g.
   [Cloudinary](https://cloudinary.com)) instead of relying on local disk storage.

#### Setting up free persistence (Neon + Cloudinary)

1. **Create a free Neon.tech account** at https://neon.tech, create a project, and
   copy its connection string (looks like
   `postgres://user:password@ep-xxxx.neon.tech/dbname?sslmode=require`).
2. **Create a free Cloudinary account** at https://cloudinary.com. On your dashboard
   home page you'll find your **Cloud Name**, **API Key**, and **API Secret**.
3. In your Render service, go to **Environment** and add these variables (paste the
   values you just copied — Render's environment page is the right place to store
   secrets, never commit them to the repo):
   - `DATABASE_URL` = your Neon connection string
   - `CLOUDINARY_CLOUD_NAME` = your Cloudinary cloud name
   - `CLOUDINARY_API_KEY` = your Cloudinary API key
   - `CLOUDINARY_API_SECRET` = your Cloudinary API secret
4. Save — Render will redeploy automatically. On first boot, the app detects these
   variables, creates the necessary tables in Neon, and seeds them from the bundled
   `data/db.json`. From then on, every admin panel change (products, categories,
   settings, uploaded images) is stored in Neon/Cloudinary and survives restarts,
   redeploys, and sleep/wake cycles — permanently, for free.

If you don't set these variables, the app works exactly as before (local JSON file +
local disk) — useful for quick local testing without creating any accounts.

## Project structure

```
├── server.js              → Express server + all API routes
├── package.json
├── data/
│   ├── db.json             → products, categories, settings (source of truth)
│   └── auth.json           → admin password hash (auto-generated)
├── public/
│   ├── index.html          → storefront
│   ├── admin.html          → admin dashboard
│   ├── css/, js/            → styles and client logic
│   └── uploads/             → uploaded product/banner images
├── start.bat / start.sh     → one-click startup
```
