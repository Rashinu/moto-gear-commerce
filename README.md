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

### Render.com free tier caveat

Render's free tier has an **ephemeral filesystem** — the service "sleeps" after 15
minutes of inactivity, and on wake-up, any changes made from the admin panel (new
products, deleted categories, uploaded images) reset to whatever is committed in this
repo. Free tier is fine for demos, not for real inventory management. For persistence,
use a paid plan + Persistent Disk (see render.com/docs/disks) — this repo's `server.js`
already supports a `DATA_DIR` environment variable to point at a mounted disk.

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
