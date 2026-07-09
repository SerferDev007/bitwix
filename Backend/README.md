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

### Project Management module (Operations Research)

Implements the CPM / PERT / EVM framework from the research paper.

| Method | Endpoint                               | Description                                        |
| ------ | -------------------------------------- | -------------------------------------------------- |
| GET    | `/api/projects`                        | List projects                                      |
| POST   | `/api/projects`                        | Create a project                                   |
| GET    | `/api/projects/:id`                    | Project with activities + EVM snapshots            |
| PUT    | `/api/projects/:id`                    | Update a project                                   |
| DELETE | `/api/projects/:id`                    | Delete a project                                   |
| POST   | `/api/projects/:id/activities`         | Add an activity (three-point estimates + preds)    |
| PUT    | `/api/projects/:id/activities/:aid`    | Update an activity                                 |
| DELETE | `/api/projects/:id/activities/:aid`    | Delete an activity                                 |
| GET    | `/api/projects/:id/schedule`           | **CPM**: critical path, floats, ES/EF/LS/LF        |
| GET    | `/api/projects/:id/pert?target=27`     | **PERT**: expected duration, variance, P(≤ target) |
| GET    | `/api/projects/:id/evm`                | **EVM**: CPI/SPI/EAC per snapshot                  |
| POST   | `/api/projects/:id/evm`                | Add an EVM status snapshot                          |
| DELETE | `/api/projects/:id/evm/:sid`           | Delete an EVM snapshot                              |

The OR calculation engine lives in [`src/or/`](src/or/) (`cpm.js`, `pert.js`,
`evm.js`) and is independent of the database, so it is unit-testable in
isolation. Run the checks — which reproduce the paper's worked examples
(25-day critical path, ~88% PERT confidence, $237,500 EAC) — with:

```bash
npm test        # OR engine + API integration checks
```

The admin UI for this module is served by the frontend at `/admin/projects`.

### Employee Management module (Operations Research)

Implements the assignment problem (Hungarian method) and Markov attrition model
from the paper (Sections 3.2 and 3.3).

| Method | Endpoint                                  | Description                                          |
| ------ | ----------------------------------------- | ---------------------------------------------------- |
| GET    | `/api/employees`                          | Roster + engagement-state summary                    |
| POST   | `/api/employees`                          | Add an employee                                      |
| PUT    | `/api/employees/:id`                      | Update an employee                                   |
| DELETE | `/api/employees/:id`                      | Delete an employee                                   |
| GET    | `/api/employees/assignments`              | List saved assignment scenarios                      |
| POST   | `/api/employees/assignments`              | Save an assignment scenario                          |
| POST   | `/api/employees/assignments/solve`        | **Hungarian**: solve an ad-hoc cost matrix           |
| GET    | `/api/employees/assignments/:id`          | Solve a saved scenario (optimal + greedy baseline)   |
| DELETE | `/api/employees/assignments/:id`          | Delete a scenario                                    |
| GET    | `/api/employees/retention`                | List saved retention scenarios                       |
| POST   | `/api/employees/retention`                | Save a retention scenario                            |
| GET    | `/api/employees/retention/:id`            | **Markov**: project workforce; `?horizon=`, `?fromRoster=1` |
| DELETE | `/api/employees/retention/:id`            | Delete a scenario                                    |

Engine: [`src/or/assignment.js`](src/or/assignment.js) (Kuhn–Munkres, rectangular-safe)
and [`src/or/markov.js`](src/or/markov.js) (multi-period projection + intervention
comparison). Admin UI at `/admin/employees`.

### Financial Management module (Operations Research)

LP capacity allocation (simplex + shadow prices), NPV project ranking, and
cost-volume-profit break-even (paper Sections 4.2–4.4).

| Method | Endpoint                             | Description                                       |
| ------ | ------------------------------------ | ------------------------------------------------- |
| GET    | `/api/financial/lp`                  | List LP scenarios                                 |
| POST   | `/api/financial/lp`                  | Save an LP scenario                               |
| POST   | `/api/financial/lp/solve`            | **Simplex**: solve an ad-hoc LP + shadow prices   |
| GET    | `/api/financial/lp/:id`              | Solve a saved LP scenario                         |
| GET    | `/api/financial/investments`         | **NPV**: list + rank candidates                   |
| POST   | `/api/financial/investments`         | Add an investment candidate                       |
| GET    | `/api/financial/service-lines`       | **Break-even** per service line                   |
| POST   | `/api/financial/service-lines`       | Add a service line                                |
| POST   | `/api/financial/break-even`          | Ad-hoc CVP break-even                             |
| POST   | `/api/financial/loaded-rate`         | Fully-loaded engineer rate                        |

Engine: [`src/or/lp.js`](src/or/lp.js), [`src/or/finance.js`](src/or/finance.js).
Admin UI at `/admin/financial`.

### Client Management module (Operations Research)

M/M/c support-desk staffing (Erlang C) and customer-lifetime-value portfolio
segmentation (paper Sections 5.1–5.3).

| Method | Endpoint                          | Description                                          |
| ------ | --------------------------------- | ---------------------------------------------------- |
| GET    | `/api/clients`                    | **CLV** portfolio, ranked + tiered                   |
| POST   | `/api/clients`                    | Add a client                                         |
| PUT    | `/api/clients/:id`                | Update a client                                      |
| DELETE | `/api/clients/:id`                | Delete a client                                      |
| POST   | `/api/clients/clv`                | Ad-hoc CLV calculation                               |
| GET    | `/api/clients/queues`             | List support-desk scenarios                          |
| POST   | `/api/clients/queues`             | Save a scenario                                      |
| POST   | `/api/clients/queues/analyze`     | **M/M/c**: ad-hoc staffing analysis + recommendation |
| GET    | `/api/clients/queues/:id`         | Analyze a saved scenario across staffing levels      |

Engine: [`src/or/queue.js`](src/or/queue.js), [`src/or/clv.js`](src/or/clv.js).
Admin UI at `/admin/clients`.

All four OR domains are complete; `npm test` runs 71 checks (engine math +
HTTP integration) reproducing every worked example in the research paper.

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
