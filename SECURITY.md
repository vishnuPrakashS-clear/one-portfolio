# Security

One Portfolio holds people's investment records, so security problems matter more than most bugs.

## Reporting

Please report privately through **GitHub → Security → Report a vulnerability** on this repository, not in a public issue. Include what you found and how to reproduce it. You'll get a reply within a week.

## How the app protects data

- **Each person sees only their own row.** Row-level security in Postgres allows a signed-in person to read, change or delete only the `public.portfolio` row whose `user_id` is theirs. The publishable key in the page can read nothing on its own.
- **Statements are read in the browser.** PDF and Excel files are opened on the device. A CAS password is used only to open the file there and is never saved or sent.
- **Optional PIN lock.** The PIN is stored as a PBKDF2 hash; the app locks itself after 10 minutes idle.
- **Server functions check the caller.** `refresh-prices` refreshes only the caller's row, or every row when called with the job key that only the database schedule holds. `ai` is off until the owner adds a key, and is rate-limited per person.
- **History.** Every change keeps the previous version (newest 30), so a bad upload can be rolled back.

## What never goes in this repository

Real statements, screenshots of real accounts, PAN, addresses, client IDs, folio or account numbers, email addresses, passwords or keys other than the publishable one. Tests use synthetic data only.
