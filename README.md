# Pocketplan

A personal HKD budget dashboard with Firebase Authentication and Firestore sync. Payslip files are parsed in the browser and are never uploaded to Firebase.

## Firebase setup

1. Create a Firebase project and register a Web app in the Firebase console.
2. In Authentication, enable the Email/Password provider.
3. Create a Cloud Firestore database. Choose its region carefully because the database location cannot be changed later.
4. Publish the contents of `firestore.rules` in Firestore Rules.
5. Copy `.env.example` to `.env.local` and fill in the Firebase Web app values for API key, Auth domain, Project ID, and App ID.
6. Restart the Vite development server with `npm run dev`.

The Firebase web config is client-side configuration, not a service-account credential. Access control is enforced by `firestore.rules`, which scopes reads and writes to the signed-in user's UID. Do not add a Firebase Admin key or service-account JSON to this app.

## Data and payslips

Paychecks, expenses, savings goals, and budget percentages are stored in user-scoped Firestore documents. They sync between devices after you sign in.

PDF text extraction and image OCR happen in the browser. The app displays extracted amounts for review before saving them. The original file is not uploaded or retained. Image OCR downloads the English recognition model from the Tesseract.js CDN the first time it is used; the document itself stays in the browser. You can also enter paycheck values manually.

An optional source note, such as `On my phone in Files`, can be saved with an imported paycheck. It is only a reminder; the app cannot open the original file from that note.

## Development

```sh
npm install
npm run dev
npm run lint
npm run build
```
