# Batticaloa Early Years School — Management Portal

A complete, client-side web application for managing student registration, QR code IDs, daily attendance tracking, and monthly fee payments. Built with **HTML, CSS, and vanilla JavaScript** — no backend or database required.

## Features

- **Student Registration** — Register students with name, age, parent details, address, registration date, and **profile photo** (upload or webcam capture)
- **Profile Photos** — Upload from device or snap via webcam; auto-compressed before saving to localStorage
- **QR Code ID Cards** — Auto-generated unique QR codes; view, print, or download ID cards
- **Attendance Scanner** — Scan student QR codes via device camera to log daily attendance
- **Fee Management** — Track monthly payment status (Paid/Unpaid) with visual badges
- **School Settings** — Customize school name and logo (stored locally); logo auto-resized to 128×128 px
- **Local Persistence** — All data saved in browser `localStorage`

## How to Run Locally

### Option 1: Open directly in browser (simplest)

1. Navigate to the project folder: `D:\Beys_attendance_app`
2. Double-click `index.html` to open it in your default web browser
3. The app loads immediately — no installation needed

### Option 2: Use a local dev server (recommended for camera/QR scanning)

Some browsers restrict camera access on `file://` URLs. For full QR scanner functionality, use a local server:

**Using Python (if installed):**
```bash
cd D:\Beys_attendance_app
python -m http.server 8080
```
Then open [http://localhost:8080](http://localhost:8080) in your browser.

**Using Node.js (if installed):**
```bash
cd D:\Beys_attendance_app
npx serve .
```

**Using VS Code / Cursor:**
Install the "Live Server" extension, right-click `index.html`, and select "Open with Live Server".

## Project Structure

```
Beys_attendance_app/
├── assets/
│   └── logo.png        # School logo
├── index.html          # Main HTML (all views)
├── css/
│   └── styles.css      # Custom styles
├── js/
│   └── app.js          # Application logic + localStorage
└── README.md           # This file
```

## Usage Guide

### Register a Student
1. Click **Register Student** in the sidebar
2. Fill in all required fields and click **Register Student**
3. An ID card with QR code is shown automatically — print or download it

### Scan Attendance
1. Go to **Attendance Scanner**
2. Click **Start Scanner** and allow camera access when prompted
3. Point the camera at a student's QR code
4. Attendance is logged instantly with a success notification

### Manage Fees
1. Go to **Fee Management**
2. Use the month picker (or **This Month** button) to select the billing month
3. Click **Mark Paid** or **Mark Unpaid** for each student — payment date is saved automatically
4. Use **Mark All Paid** / **Mark All Unpaid** for bulk updates at month start or after collection
5. Each month is tracked separately — new months default to Unpaid until updated
6. View full monthly payment history in each student's profile

### Customize School Name & Logo
1. Go to **School Settings** in the sidebar
2. Edit the **School Name** and click **Save Settings**
3. Click **Change Logo** to upload a new image — it is cropped and compressed to 128×128 px
4. Click **Reset to Default** to restore the original logo

Settings are saved in `beys_school_settings` in localStorage.

### View / Search Students
1. Go to **All Students**
2. Use the search bar to filter by name, parent, or mobile number
3. Click **ID** to view/print the ID card, or **View** for full profile

## Browser Compatibility

- Chrome / Edge (recommended for QR scanning)
- Firefox
- Safari (macOS/iOS)

**Note:** Camera-based QR scanning requires HTTPS or `localhost`. Use a local dev server for best results.

## Profile Photo Handling

Photos are optional during registration. Teachers can **upload an image** or **capture via webcam**.

### Compression Pipeline
1. Image is drawn onto an off-screen `<canvas>` element
2. Resized to a maximum of **200×200 px** (maintaining aspect ratio)
3. Exported as **JPEG** starting at 75% quality
4. Quality is stepped down (to 35%) until the Base64 string is under **~80 KB**

This keeps each photo small enough for `localStorage` (typically 5–10 MB per origin).

### Storage
- Photos are stored as `student.photo` — a compact Base64 Data URL (`data:image/jpeg;base64,...`)
- Saved alongside all other student fields in the `beys_school_data` localStorage key
- If storage quota is exceeded, the app shows an error and rolls back the registration

### Where Photos Appear
- Registration form live preview thumbnail
- Student list/table avatars
- Student profile modal
- Printable/downloadable ID card (left side, next to QR code)
- Instant visual confirmation when QR code is scanned for attendance

## Data Storage

All data is stored in your browser's `localStorage` under the key `beys_school_data`. Data persists across page refreshes but is tied to the specific browser and device. To back up data, export from browser DevTools → Application → Local Storage.

## Technologies Used

- [Tailwind CSS](https://tailwindcss.com/) (CDN) — UI styling
- [QRCode.js](https://github.com/davidshimjs/qrcodejs) — QR code generation
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) — Camera QR scanning
- [html2canvas](https://html2canvas.hertzen.com/) — ID card PNG download
