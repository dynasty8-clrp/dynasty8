DYNASTY 8 REAL ESTATE - STARTER

Current features:
- One shared Firebase email/password login
- Dashboard counts
- Houses payment plans
- Warehouses payment plans
- Automatic remaining balance / instalment calculation
- Record payments
- Automatically moves fully-paid plans into Completed
- Completed sales search/filter
- Repossessions page
- Repossession search by name, Citizen ID, property ID or reason

SETUP
1. Create / use a Firebase project.
2. Enable Authentication > Sign-in method > Email/Password.
3. Create ONE staff user in Authentication > Users.
4. Create a Firestore database.
5. Paste your Firebase config into assets/js/firebase.js.
6. Run the site through Live Server (do not open the HTML as file://).
7. Use Firestore rules appropriate for authenticated staff only.

Suggested starter Firestore rule while developing:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}

Do not leave Firestore fully public.
