# Bitwix Backend (Express + MySQL)

REST API for the Bitwix Technologies website. Stores contact-form submissions
and serves the services/team content from MySQL.

## Requirements

- Node.js 18+ (uses ES modules and `node --watch`)
- A running MySQL 8+ server

## Setup

1. Install dependencies:

   ```bash
   cd Backend
   npm install
   ```

2. Configure the environment. Copy `.env.example` to `.env` and set your MySQL
   credentials:

   ```bash
   cp .env.example .env
   # edit .env -> DB_USER, DB_PASSWORD, etc.
   ```

3. Create the database, tables, and seed content:

   ```bash
   npm run db:init
   ```

   (Alternatively run the raw SQL: `mysql -u root -p < schema.sql`.)

4. Start the server:

   ```bash
   npm run dev   # auto-restarts on change
   # or
   npm start
   ```

   The API runs at `http://localhost:5000`.

## API

| Method | Endpoint        | Description                              |
| ------ | --------------- | ---------------------------------------- |
| GET    | `/api/health`   | Health check                             |
| POST   | `/api/contact`  | Submit a contact-form message            |
| GET    | `/api/contact`  | List stored messages (admin/read)        |
| GET    | `/api/services` | List active services                     |
| GET    | `/api/team`     | List active team members                 |

### POST `/api/contact`

Request body:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+91-90000 00000",
  "subject": "Website project",
  "message": "I'd like a quote for an e-commerce site."
}
```

`name`, `email`, and `message` are required. Submissions are rate-limited to
10 per IP per 15 minutes.

## Frontend integration

The React app reads the API base URL from `VITE_API_URL` (see
`Frontend/.env`). By default it points to `http://localhost:5000/api`.
