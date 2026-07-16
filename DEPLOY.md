# Bitwix — End-to-End Deployment Runbook

Everything needed to deploy **bitwix.co.in**, from a routine code change to rebuilding the
whole stack from an empty AWS account.

| | |
|---|---|
| **Live site** | https://www.bitwix.co.in |
| **Deploy trigger** | `deploy.bat` → push to `main` → GitHub Actions |
| **AWS region** | `ap-south-1` (Mumbai) — *except ACM, which must be `us-east-1`* |
| **AWS account** | `214745598689` |
| **Repo** | `github.com/SerferDev007/bitwix` |

**Contents**
1. [Architecture](#1-architecture)
2. [Everyday deploy](#2-everyday-deploy-the-90-case)
3. [What the pipelines do](#3-what-the-pipelines-do)
4. [GitHub CI setup](#4-github-ci-setup-one-time)
5. [Environment variables](#5-environment-variables)
6. [Database lifecycle](#6-database-lifecycle)
7. [Changing an App Runner env var](#7-changing-an-app-runner-env-var)
8. [Verification & logins](#8-verification--logins)
9. [Rollback](#9-rollback)
10. [Troubleshooting](#10-troubleshooting)
11. [First-time provisioning from scratch](#11-first-time-provisioning-from-scratch)
12. [Security hardening](#12-security-hardening)
13. [Cost](#13-cost)

---

## 1. Architecture

```
                                   ┌────────────────────────────────────────┐
   bitwix.co.in      (Route 53)    │              CloudFront                │
   www.bitwix.co.in  ───────────►  │  default  /*     → S3 (SPA)            │
                                   │  behavior /api/* → App Runner (API)    │
                                   └───────────┬───────────────┬────────────┘
                                               │               │
                                    ┌──────────▼─────┐   ┌─────▼──────────────┐
                                    │  S3 (private)  │   │  App Runner        │
                                    │  React build   │   │  Express container │
                                    └────────────────┘   └─────┬──────────────┘
                                                               │ VPC connector
                                                         ┌─────▼───────────────┐
                                                         │ RDS MySQL (private) │
                                                         └─────────────────────┘
```

`/api/*` is served through the **same** CloudFront domain, so the frontend uses the relative
`/api` base — no CORS, no hardcoded backend host.

**Boot order** (`Backend/src/server.js`) — deliberately fail-soft:
1. **Binds the port first** (so the health check passes even if the DB is slow/down).
2. Connects to MySQL with retries (`DB_CONNECT_RETRIES`).
3. Applies **idempotent schema migrations** (unless `RUN_DB_INIT=true` did a full init).
4. Runs any one-off flags (`SEED_HR_DEMO`, `PURGE_HR_DEMO`).
5. Starts the ledger reconcile scheduler.

---

## 2. Everyday deploy (the 90% case)

From the project root:

```bat
deploy.bat "short message describing the change"
```

That's it. `deploy.bat` stages everything, commits, and pushes to `origin/main`. GitHub Actions
then deploys **only what changed**:

| Changed path | Workflow | Result |
|---|---|---|
| `Frontend/**` | `deploy-frontend.yml` | build → S3 sync → CloudFront invalidation |
| `Backend/**` | `deploy-backend.yml` | Docker build → ECR push → App Runner deploy |

Watch progress: **https://github.com/SerferDev007/bitwix/actions**

- Frontend deploys take ~1–2 min. Backend ~4–8 min (image build + App Runner rollout).
- Nothing is built locally — **you do not need Docker installed.**
- Both workflows can also be run manually (`workflow_dispatch`) from the Actions tab, which is
  how you redeploy without a code change.

> Deploys go through `main`. There is no staging environment — `main` is production.

---

## 3. What the pipelines do

### 3.1 Frontend — `.github/workflows/deploy-frontend.yml`
Triggers on push to `main` touching `Frontend/**`, or manual dispatch. Concurrency group
`deploy-frontend` (in-progress runs are cancelled — latest wins).

1. Checkout.
2. pnpm 9 + Node 22 (pnpm cache keyed on `Frontend/pnpm-lock.yaml`).
3. `pnpm install --frozen-lockfile`.
4. `pnpm build` with **`VITE_API_URL=/api`** (same-origin API).
5. Configure AWS creds (`ap-south-1`).
6. **`aws s3 sync dist s3://$S3_BUCKET --delete`**.
7. CloudFront invalidation of `/*` (skipped if `CLOUDFRONT_DISTRIBUTION_ID` var is unset).

> ⚠️ The sync uses `--delete`. **Never** store uploads or anything else in the website bucket —
> it is wiped to match `dist/` on every deploy. User uploads go to the separate media bucket
> ([§11.9](#119-media-bucket-team-photo-uploads--optional)).
>
> Static files in `Frontend/public/` (e.g. `public/team/*.jpg`) are copied into `dist/` by Vite
> and therefore served from the site root — that is the supported way to add static assets.

### 3.2 Backend — `.github/workflows/deploy-backend.yml`
Triggers on push to `main` touching `Backend/**`, or manual dispatch. Concurrency group
`deploy-backend` with **`cancel-in-progress: false`** — a deploy is never killed mid-flight.

1. Checkout.
2. Configure AWS creds; log in to ECR.
3. **Build** `docker build --platform linux/amd64` (App Runner is x86_64) and tag both
   `:latest` and `:<git-sha>`.
4. **Push** both tags to ECR repo `bitwix-backend`.
5. **Deploy**: look up the App Runner service ARN by name (`bitwix-backend`), call
   **`start-deployment`**, then poll `list-operations` every 15 s (up to 40 tries ≈ 10 min).
   Fails the job on `FAILED` / any `ROLLBACK_*`.
6. Invalidate CloudFront `/api/*`.
7. Smoke test `https://www.bitwix.co.in/api/health`.

> **Why `start-deployment`?** The service has **AutoDeployments OFF**, so pushing a new `:latest`
> to ECR does *not* redeploy by itself, and `update-service` with an unchanged config is a no-op.
> `start-deployment` is the only thing that re-pulls `:latest`.

---

## 4. GitHub CI setup (one-time)

**Settings → Secrets and variables → Actions**

| Type | Name | Value |
|---|---|---|
| Secret | `AWS_ACCESS_KEY_ID` | IAM user access key |
| Secret | `AWS_SECRET_ACCESS_KEY` | IAM user secret |
| Variable | `S3_BUCKET` | website bucket (e.g. `website-bitwix.co.in`) |
| Variable | `CLOUDFRONT_DISTRIBUTION_ID` | e.g. `ERN797ECCH3LY` |

The IAM user needs: ECR (auth/push), App Runner (`ListServices`, `StartDeployment`,
`ListOperations`), S3 (`ListBucket`, `PutObject`, `DeleteObject` on the website bucket), and
`cloudfront:CreateInvalidation`.

---

## 5. Environment variables

Set on the **App Runner service** (Configuration → Environment variables). The image contains no
`.env` — everything is injected. Full annotated list: `Backend/.env.example`.

### Core
| Key | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` (must match the App Runner port setting) |
| `DB_HOST` | RDS endpoint |
| `DB_PORT` | `3306` |
| `DB_USER` | `admin` |
| `DB_PASSWORD` | *(secret)* |
| `DB_NAME` | `bitwix` |
| `DB_SSL` | `true` |
| `DB_SSL_REJECT_UNAUTHORIZED` | `false` (`true` requires bundling the RDS CA) |
| `DB_CONNECT_RETRIES` | `10` |
| `CORS_ORIGIN` | `https://bitwix.co.in,https://www.bitwix.co.in` |
| `DEFAULT_CURRENCY` | `INR` |
| `RECONCILE_INTERVAL_SEC` | `600` (ledger reconcile sweep; `0` disables) |

### Auth — one distinct random secret per plane
| Key | Notes |
|---|---|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | OR/Finance admin console login |
| `AUTH_SECRET` | admin plane token signing |
| `HR_AUTH_SECRET` | HR plane — **falls back to `AUTH_SECRET` if unset** |
| `CRM_AUTH_SECRET` | CRM plane — same fallback |
| `HR_BOOTSTRAP_EMAIL` / `HR_BOOTSTRAP_PASSWORD` | seeds the HR Super Admin |
| `CRM_BOOTSTRAP_EMAIL` / `CRM_BOOTSTRAP_PASSWORD` | seeds the CRM internal admin |

Generate secrets: `openssl rand -hex 32` (one per plane — never reuse).

### Media (optional)
`MEDIA_BUCKET`, `MEDIA_REGION`, `MEDIA_PUBLIC_BASE_URL` — see [§11.9](#119-media-bucket-team-photo-uploads--optional).
Leave `MEDIA_BUCKET` empty to disable uploads.

### One-off flags — set → deploy → **set back to false**
| Flag | Effect |
|---|---|
| `RUN_DB_INIT` | Create + seed the full schema on boot. **First deploy only.** |
| `RUN_DB_RESET` | ⚠️ **DESTRUCTIVE.** With `RUN_DB_INIT=true`, `DROP DATABASE` first. Pre-production only. |
| `PURGE_DEMO_EMPLOYEES` | With `RUN_DB_INIT=true`, delete legacy OR demo employees. |
| `SEED_HR_DEMO` | Create dummy HR accounts (one per role, known passwords) and print them to the log. |
| `PURGE_HR_DEMO` | Remove those dummy HR accounts. |

---

## 6. Database lifecycle

The RDS instance is **private** — not reachable from your laptop or CloudShell. Anything that
must touch the DB runs **inside the App Runner container**, which is why DB tasks are env-flag
driven.

### Routine schema changes — automatic
On every boot (when `RUN_DB_INIT !== 'true'`), the server runs `migrateSchema()`: idempotent
`CREATE TABLE IF NOT EXISTS` / `addColumnIfMissing` / `INSERT IGNORE` across the HR, CRM and FMS
schemas. **Adding a column or table needs no flag and no manual step** — just deploy.

This exists because new code reading a column that the live DB lacked used to 500
(`Unknown column …`). Migrations self-heal on deploy instead.

### First-time init
`RUN_DB_INIT=true` → deploy → creates all tables, seeds roles/permissions, leave types, the
website team rows, and the HR/CRM bootstrap admins → **set back to `false`**.

Seeds are guarded (`INSERT IGNORE` / existence checks), so re-running is safe but wasteful.

### Clean reset (pre-production only)
`RUN_DB_INIT=true` **and** `RUN_DB_RESET=true` → deploy → drops and rebuilds the database with
only required data. **This destroys all data.** Set both back to `false` afterwards.

### Dummy HR test users
`SEED_HR_DEMO=true` → deploy → creates one `@bitwix.test` account per role (HR_ADMIN, HR_EXEC,
MANAGER, EMPLOYEE) and **prints each login and password to the App Runner application logs** on
boot. The dummy employee reports to the dummy manager, so leave approval is testable end to end.

The account list is defined in `Backend/src/scripts/seedHrDemoUsers.js` (which also exposes a CLI
`--purge` mode for anywhere the DB *is* reachable). Remove them with `PURGE_HR_DEMO=true`.

> These are test accounts with hardcoded passwords — **purge them before real traffic**, and
> treat any environment where they are seeded as untrusted.

---

## 7. Changing an App Runner env var

Console: **App Runner → bitwix-backend → Configuration → Edit → Environment variables → Deploy.**

Or scripted (this preserves the rest of the config, which a naive `update-service` would drop):

```python
python3 - <<'PY'
import json, subprocess
R="ap-south-1"
ARN="arn:aws:apprunner:ap-south-1:214745598689:service/bitwix-backend/4b8414d7df4e41d1909d0102b808fed9"
KEY, VALUE = "SEED_HR_DEMO", "true"     # <-- edit these

d=json.loads(subprocess.check_output(["aws","apprunner","describe-service","--region",R,"--service-arn",ARN]))
src=d["Service"]["SourceConfiguration"]; img=src["ImageRepository"]; cfg=img.setdefault("ImageConfiguration",{})
cfg.setdefault("RuntimeEnvironmentVariables",{})[KEY]=VALUE
p={"ImageRepository":{"ImageIdentifier":img["ImageIdentifier"],"ImageRepositoryType":"ECR","ImageConfiguration":cfg},
   "AutoDeploymentsEnabled":src.get("AutoDeploymentsEnabled",False)}
if src.get("AuthenticationConfiguration"): p["AuthenticationConfiguration"]=src["AuthenticationConfiguration"]
open("/tmp/src.json","w").write(json.dumps(p))
subprocess.check_call(["aws","apprunner","update-service","--region",R,"--service-arn",ARN,
                       "--source-configuration","file:///tmp/src.json"])
print(f">>> {KEY}={VALUE}; redeploying — watch the application logs.")
PY
```

Changing an env var triggers a redeploy that re-pulls the current `:latest`. If you set a flag
that a *newly written* code path reads, make sure the backend Actions run that shipped that code
has finished first — otherwise you redeploy an image that ignores the flag.

---

## 8. Verification & logins

```bash
curl -I https://www.bitwix.co.in                 # 200 from CloudFront
curl    https://www.bitwix.co.in/api/health      # {"success":true,...}
curl    https://www.bitwix.co.in/api/settings    # INR default
```

- Marketing site loads; Services/Team render from the API.
- Deep link (e.g. `https://www.bitwix.co.in/admin/projects`) hard-refreshes fine → SPA fallback OK.
- **Always test logins on `www.`** — see [§10](#10-troubleshooting).

| Console | URL | Credentials |
|---|---|---|
| Admin (OR + Finance) | `/admin/login` | `ADMIN_USERNAME` / `ADMIN_PASSWORD` |
| HR / People | `/hr/login` | `HR_BOOTSTRAP_EMAIL` / `HR_BOOTSTRAP_PASSWORD` |
| CRM (staff) | `/crm/login` | `CRM_BOOTSTRAP_EMAIL` / `CRM_BOOTSTRAP_PASSWORD` |
| Client portal | `/portal/login` | client accounts provisioned from CRM |

App Runner **application logs** are the source of truth on boot problems (schema migration,
seeds, DB connection). CloudWatch → App Runner → `bitwix-backend` → Application logs.

---

## 9. Rollback

**Backend** — every build is tagged with its git SHA, so roll back by pointing the service at the
previous image:

1. Find the last-good SHA tag in ECR (`bitwix-backend:<sha>`).
2. App Runner → Configuration → edit the image URI to that tag → Deploy.
3. Once healthy, revert the bad commit on `main` so CI doesn't re-push it as `:latest`.

**Frontend** — re-run the frontend workflow from the last-good commit
(Actions → Deploy frontend to S3 → Run workflow → pick the ref), or `git revert` and push.

**Database** — RDS automated backups run with a 7-day retention: RDS → Snapshots /
point-in-time restore. Note this restores to a *new* instance; you must repoint `DB_HOST`.

---

## 10. Troubleshooting

**Login/API works on `www` but fails on the apex.**
`bitwix.co.in` resolves to a GET-only redirect; **POST is not forwarded**. Always use
`https://www.bitwix.co.in`. Symptom: "Unexpected server response." (the SPA's HTML came back
instead of JSON).

**Login returns HTML / "Unexpected server response."**
The CloudFront `/api/*` behavior is missing POST. It must allow **GET, HEAD, OPTIONS, PUT, POST,
PATCH, DELETE**, use **CachingDisabled**, and origin request policy **AllViewer** (forwards the
`Authorization` header and body).

**Pushed a new image but the change isn't live.**
AutoDeployments are OFF; `update-service` with an unchanged config is a no-op. Use
`aws apprunner start-deployment` (the CI does this).

**App Runner keeps failing health checks / rolling back.**
Check application logs. The server binds the port *before* connecting to the DB and never
`process.exit`s on DB failure, so a health-check failure usually means a crash at import time
(syntax error, bad env). Health check is **TCP on 8080**.

**500 `Unknown column …` after a deploy.**
Schema drift — fixed automatically by the boot migration. If it persists, the migration threw:
look for `⚠️ Schema migration failed` in the logs.

**`ER_PARSE_ERROR` on a new table/column.**
MySQL 8 reserved words (`rank`, `system`, `groups`, …) must be backticked. Local MariaDB/XAMPP
is more permissive, so these only surface on RDS.

**Can't reach RDS from CloudShell/laptop.**
By design — it's private. Use the env-flag-on-boot mechanism ([§6](#6-database-lifecycle)).

**409 on `POST /api/hr/payroll/runs`.**
Not a bug — one payroll run per period. Use the existing run for that month, or pick a different
period in the UI.

---

## 11. First-time provisioning from scratch

Only needed to rebuild the stack in a fresh account. Everything below already exists in
production.

### 11.0 Prerequisites
- AWS CLI v2 (`aws configure`), Docker (only for the very first manual image push).
- Main region `ap-south-1`. **ACM must be `us-east-1`** for CloudFront.

```bash
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export REGION=ap-south-1
export APP=bitwix
export DB_PASSWORD='<choose-a-strong-password>'   # RDS forbids / @ " and space
export AUTH_SECRET=$(openssl rand -hex 32)
```

> 🔐 **Never commit real secrets to this file.** Set them only in your shell, App Runner env, or
> Secrets Manager.

### 11.1 RDS MySQL (private)
```bash
export VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text --region $REGION)

aws ec2 create-security-group --group-name $APP-rds-sg \
  --description "Bitwix RDS" --vpc-id $VPC_ID --region $REGION
export RDS_SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=$APP-rds-sg \
  --query 'SecurityGroups[0].GroupId' --output text --region $REGION)

aws rds create-db-instance \
  --db-instance-identifier $APP-db \
  --engine mysql --engine-version 8.0 \
  --db-instance-class db.t3.micro --allocated-storage 20 \
  --master-username admin --master-user-password "$DB_PASSWORD" \
  --vpc-security-group-ids $RDS_SG \
  --no-publicly-accessible --backup-retention-period 7 \
  --region $REGION

aws rds wait db-instance-available --db-instance-identifier $APP-db --region $REGION
export DB_HOST=$(aws rds describe-db-instances --db-instance-identifier $APP-db \
  --query 'DBInstances[0].Endpoint.Address' --output text --region $REGION)
echo "RDS endpoint: $DB_HOST"
```

### 11.2 ECR + first image
```bash
aws ecr create-repository --repository-name $APP-backend --region $REGION
aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com

cd Backend
docker build --platform linux/amd64 -t $APP-backend .
docker tag $APP-backend:latest $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$APP-backend:latest
docker push $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$APP-backend:latest
cd ..
```
After this, CI owns image builds — you never need Docker locally again.

### 11.3 App Runner + VPC connector
Console (VPC connector wiring is fiddly on the CLI):
1. **Create service** → Container registry → ECR → `bitwix-backend:latest` → deployment trigger **Manual**.
2. **Port `8080`**, health check **TCP** on 8080, 0.25 vCPU / 0.5 GB.
3. **Environment variables** — see [§5](#5-environment-variables); set `RUN_DB_INIT=true` for this first boot only.
4. **Networking → Outgoing traffic → Custom VPC** → create a VPC connector in the same VPC/subnets as RDS. Note its security group (`APPRUNNER_SG`).
5. Create; copy the service URL.

Allow App Runner → RDS:
```bash
aws ec2 authorize-security-group-ingress --group-id $RDS_SG \
  --protocol tcp --port 3306 --source-group <APPRUNNER_SG> --region $REGION
```
Watch logs for the schema init, then **set `RUN_DB_INIT=false`** and redeploy.

### 11.4 ACM certificate (us-east-1)
```bash
aws acm request-certificate --region us-east-1 \
  --domain-name bitwix.co.in --subject-alternative-names www.bitwix.co.in \
  --validation-method DNS --query CertificateArn --output text
```
Add the validation CNAME(s); wait for `ISSUED`.

### 11.5 S3 website bucket (private)
```bash
aws s3api create-bucket --bucket <website-bucket> --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION
aws s3api put-public-access-block --bucket <website-bucket> \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```
Keep it **private** — CloudFront reads it via Origin Access Control.

### 11.6 CloudFront
1. **Origin 1 — S3**: the website bucket, origin access **OAC** (copy the generated bucket policy into S3).
2. **Default behavior**: Redirect HTTP→HTTPS, cache policy **CachingOptimized**.
3. **Origin 2 — App Runner**: origin domain = the App Runner host, **HTTPS only**.
4. **Behavior `/api/*`** → App Runner origin, Redirect HTTP→HTTPS, allowed methods **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**, cache **CachingDisabled**, origin request policy **AllViewer**.
5. **Custom error responses** (SPA fallback): **403 → `/index.html` (200)** and **404 → `/index.html` (200)**.
6. **Settings**: alternate domain names `bitwix.co.in` + `www.bitwix.co.in`, the us-east-1 ACM cert, default root object `index.html`.

### 11.7 Route 53
```bash
aws route53 create-hosted-zone --name bitwix.co.in \
  --caller-reference $(date +%s) --query 'DelegationSet.NameServers'
```
1. Recreate existing records so **email keeps working** (MX, `email` CNAME, DKIM `_domainkey` CNAMEs, ACM validation).
2. `bitwix.co.in` → **A–Alias** → CloudFront; `www.bitwix.co.in` → **A–Alias** → CloudFront.
3. At GoDaddy: Nameservers → Custom → the 4 Route 53 nameservers.

### 11.8 Point CI at the new infra
Update the GitHub variables (`S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`) — [§4](#4-github-ci-setup-one-time).

### 11.9 Media bucket (team photo uploads) — optional
Admin → Employee Management → **Website Team** can upload photos to S3; the DB stores the URL.

```bash
export ACC=214745598689 REGION=ap-south-1
export MEDIA_BUCKET=bitwix-media-$ACC

aws s3api create-bucket --bucket $MEDIA_BUCKET --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION
aws s3api put-public-access-block --bucket $MEDIA_BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket $MEDIA_BUCKET --policy "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{\"Sid\":\"PublicReadTeam\",\"Effect\":\"Allow\",\"Principal\":\"*\",
    \"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$MEDIA_BUCKET/team/*\"}]
}"

cat > /tmp/trust.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"tasks.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
aws iam create-role --role-name bitwix-apprunner-instance \
  --assume-role-policy-document file:///tmp/trust.json
aws iam put-role-policy --role-name bitwix-apprunner-instance --policy-name media-write \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",
    \"Action\":[\"s3:PutObject\",\"s3:DeleteObject\"],\"Resource\":\"arn:aws:s3:::$MEDIA_BUCKET/*\"}]}"
```
Then App Runner → **Security → Instance role** → `bitwix-apprunner-instance`; add env
`MEDIA_BUCKET` + `MEDIA_REGION`; deploy. With `MEDIA_BUCKET` unset, uploads are disabled and
members show initials avatars.

---

## 12. Security hardening

Do these before real traffic:

- [ ] **Rotate every default credential**: `ADMIN_PASSWORD`, `HR_BOOTSTRAP_PASSWORD`,
      `CRM_BOOTSTRAP_PASSWORD`. The defaults in `.env.example` are public knowledge.
- [ ] **Distinct secrets per plane**: `AUTH_SECRET`, `HR_AUTH_SECRET`, `CRM_AUTH_SECRET` — if the
      HR/CRM ones are unset they silently fall back to `AUTH_SECRET`, so every plane signs with
      one key. Rotating a secret force-logs-out that plane.
- [ ] Move `DB_PASSWORD` / `ADMIN_PASSWORD` / `*_AUTH_SECRET` into **Secrets Manager** and
      reference them instead of plaintext env vars.
- [ ] **Purge dummy HR users** (`PURGE_HR_DEMO=true`) — public passwords.
- [ ] Keep the **GitHub repo private** (it contains infrastructure detail).
- [ ] Keep RDS **not publicly accessible**; only the App Runner connector SG reaches 3306.
- [ ] Consider **AWS WAF** on CloudFront; tighten login rate limits.
- [ ] `DB_SSL_REJECT_UNAUTHORIZED=true` + bundle the RDS CA for full cert verification.
- [ ] Rotate the CI IAM user's keys periodically; scope its policy to the minimum in [§4](#4-github-ci-setup-one-time).

## 13. Cost

Light traffic, ballpark **$25–40/month**:

| Item | ~Monthly |
|---|---|
| RDS `db.t3.micro` | ~$15 |
| App Runner 0.25 vCPU | ~$5–15 (idle → light) |
| S3 + CloudFront | cents–$1 |
| Route 53 hosted zone | $0.50 |

Stop/downsize RDS and App Runner when idle to reduce it.
