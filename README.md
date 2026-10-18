# The Van Radio — App

## Πώς να το κάνεις live (δωρεάν)

### 1. Ανέβασέ το στο GitHub
1. Πήγαινε στο [github.com](https://github.com) και κάνε δωρεάν λογαριασμό (αν δεν έχεις ήδη).
2. Δημιούργησε ένα νέο **repository** (π.χ. `thevan-radio-app`) — μπορεί να είναι **private** ή **public**.
3. Ανέβασε όλα τα αρχεία αυτού του φακέλου εκεί (μέσω "Upload files" στο GitHub website, ή μέσω `git`).

### 2. Deploy στο Vercel
1. Πήγαινε στο [vercel.com](https://vercel.com) και κάνε "Sign up with GitHub".
2. Πάτα **"Add New Project"** → επίλεξε το repository `thevan-radio-app`.
3. Το Vercel αναγνωρίζει αυτόματα ότι είναι Vite project — άσε τις ρυθμίσεις όπως είναι.
4. Πάτα **Deploy**.
5. Σε ~1 λεπτό θα έχεις ένα live link τύπου `thevan-radio-app.vercel.app`.

### 3. Ενημερώσεις στο μέλλον
- Η λίστα επεισοδίων (`src/App.jsx`) τραβάει τα δεδομένα **ζωντανά** από το Google Sheet
  (`TVR_App_Database`, tab "Journey"). Όποτε προσθέτεις/αλλάζεις μια σειρά εκεί, θα εμφανιστεί
  αυτόματα στην εφαρμογή — **δεν χρειάζεται νέο deploy** για αλλαγές στα επεισόδια.
- Αν αλλάξεις τον ίδιο τον κώδικα (`src/App.jsx` ή οτιδήποτε άλλο αρχείο) και το ανεβάσεις στο
  GitHub, το Vercel κάνει αυτόματα νέο deploy μέσα σε δευτερόλεπτα.

## Τοπική δοκιμή (προαιρετικό, αν έχεις Node.js εγκατεστημένο)
```bash
npm install
npm run dev
```
