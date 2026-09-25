DYNASTY 8 FULL WORKFLOW UPDATE
==============================

Replace/add the files in this package in your existing Dynasty 8 project.

REPLACE:
- houses.html
- warehouses.html
- dashboard.html
- completed.html
- repossessions.html
- assets/css/style.css
- assets/css/date-picker.css
- assets/js/plans.js
- assets/js/dashboard.js
- assets/js/completed.js
- assets/js/repossessions.js
- assets/js/ui-modal.js
- assets/js/custom-select.js

ADD:
- assets/js/toast.js

KEEP YOUR EXISTING FILES:
- assets/js/firebase.js
- assets/js/auth-guard.js
- assets/js/login.js
- login.html
- assets/images/dynasty8-logo.png

NEW FEATURES INCLUDED:
- Contact/chase notes on every plan
- Missed-payment count and overdue amount
- Payment history
- Undo/reverse a payment
- Full activity/audit log
- Copy buttons for Citizen ID, phone and property ID
- Edit plan details and future due dates
- Plan sorting (priority, most overdue, next payment, balance, A-Z)
- Archive plans entered in error
- Restore archived plans from Completed
- Restore accidental repossessions
- Priority accounts on dashboard (2+ missed or 7+ days late)
- Styled confirmation/error popups
- Small toast notifications for successful actions
- Styled custom dropdown menus
- Styled scrollbars

FIRESTORE COLLECTIONS USED:
- paymentPlans
- payments
- repossessions
- contactLogs
- activityLog

Your current Firestore rule that allows authenticated users to read/write all documents will cover these new collections:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}

After replacing the files, hard refresh the website with Ctrl + F5.
