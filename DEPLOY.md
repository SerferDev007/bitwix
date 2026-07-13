# Deploying Bitwix to AWS

Target architecture for **bitwix.co.in**:

```
                                   ┌────────────────────────────────────────┐
   bitwix.co.in (Route 53 ALIAS)   │              CloudFront                │
   www.bitwix.co.in  ───────────►  │  default behavior  /*   → S3 (SPA)     │
                                    │  behavior          /api/* → App Runner │
                                    └───────────┬───────────────┬───────────┘
                                                │               │
                                     ┌──────────▼─────┐   ┌─────▼──────────────┐
                                     │  S3 (private)  │   │  App Runner (API)  │
                                     │  React build   │   │  Express container │
                                     └────────────────┘   └─────┬──────────────┘
                                                                 │ VPC connector
                                                           ┌─────▼──────────────┐
                                                           │  RDS MySQL (private)│
                                                           └─────────────────────┘
```

Because `/api/*` is served through the **same** CloudFront domain, the frontend keeps using the
relative `/api` base — no CORS, no hardcoded backend URL.

---

## 0. Prerequisites

- AWS account + AWS CLI v2 configured (`aws configure`)
- Docker installed (to build the backend image)
- Choose a main region for RDS + App Runner. This guide uses **`ap-south-1`** (Mumbai).
  > ⚠️ The ACM certificate for CloudFront **must** be created in **`us-east-1`** regardless of the main region.

Set these shell variables (bash) and reuse them throughout:

```bash
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export REGION=ap-south-1
export APP=bitwix
export DB_PASSWORD='Karizma0626'   # RDS forbids / @ " and space
export ADMIN_PASSWORD='Karizma0626'
export AUTH_SECRET=$(openssl rand -hex 32)
echo "Account=$AWS_ACCOUNT  Auth secret=$AUTH_SECRET"
```

> ⚠️ Never commit real passwords into this file — set them only in your shell / App Runner env.
> RDS master passwords may **not** contain `/`, `@`, `"`, or spaces.

---

## 1. RDS MySQL (private)

Create a MySQL instance. Keep it **not publicly accessible**; App Runner reaches it through a VPC connector.

```bash
# Security group for the database
export VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text --region $REGION)

aws ec2 create-security-group --group-name $APP-rds-sg \
  --description "Bitwix RDS" --vpc-id $VPC_ID --region $REGION
export RDS_SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=$APP-rds-sg \
  --query 'SecurityGroups[0].GroupId' --output text --region $REGION)

aws rds create-db-instance \
  --db-instance-identifier $APP-db \
  --engine mysql --engine-version 8.0 \
  --db-instance-class db.t3.micro \
  --allocated-storage 20 \
  --master-username admin \
  --master-user-password "$DB_PASSWORD" \
  --vpc-security-group-ids $RDS_SG \
  --no-publicly-accessible \
  --backup-retention-period 7 \
  --region $REGION

# Wait, then capture the endpoint
aws rds wait db-instance-available --db-instance-identifier $APP-db --region $REGION
export DB_HOST=$(aws rds describe-db-instances --db-instance-identifier $APP-db \
  --query 'DBInstances[0].Endpoint.Address' --output text --region $REGION)
echo "RDS endpoint: $DB_HOST"
```

We'll open the DB security group to App Runner in step 3 (after the connector exists).

---

## 2. Build & push the backend image to ECR

```bash
aws ecr create-repository --repository-name $APP-backend --region $REGION

aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com

# From the Backend/ folder (build for x86_64 which App Runner uses)
cd Backend
docker build --platform linux/amd64 -t $APP-backend .
docker tag $APP-backend:latest $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$APP-backend:latest
docker push $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$APP-backend:latest
cd ..
```

---

## 3. App Runner service (backend) + VPC connector

Easiest in the **console** (VPC connector wiring is fiddly on the CLI):

1. **App Runner → Create service.**
2. **Source:** Container registry → Amazon ECR → the `bitwix-backend:latest` image. Deployment trigger: Manual.
3. **Service settings:**
   - Port: **8080**
   - Health check: **HTTP**, path **`/api/health`**
   - CPU/Memory: 0.25 vCPU / 0.5 GB is fine to start.
4. **Environment variables:**
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `8080` |
   | `DB_HOST` | *(RDS endpoint from step 1)* |
   | `DB_PORT` | `3306` |
   | `DB_USER` | `admin` |
   | `DB_PASSWORD` | *(your DB password)* |
   | `DB_NAME` | `bitwix` |
   | `DB_SSL` | `true` |
   | `DB_SSL_REJECT_UNAUTHORIZED` | `false` |
   | `CORS_ORIGIN` | `https://bitwix.co.in,https://www.bitwix.co.in` |
   | `DEFAULT_CURRENCY` | `INR` |
   | `ADMIN_USERNAME` | `admin` (or your choice) |
   | `ADMIN_PASSWORD` | *(strong password)* |
   | `AUTH_SECRET` | *(the `openssl rand -hex 32` value)* |
   | `RUN_DB_INIT` | `true`  ← **first deploy only** |
   > For production, store `DB_PASSWORD` / `ADMIN_PASSWORD` / `AUTH_SECRET` in **Secrets Manager** and reference them, rather than plaintext env vars.
5. **Networking → Outgoing traffic: Custom VPC.** Create a **VPC connector** in the same VPC/subnets as RDS. Note the security group it uses (call it `APPRUNNER_SG`).
6. Create the service. Copy the resulting URL, e.g. `https://xxxx.ap-south-1.awsapprunner.com`.

Now allow App Runner → RDS on 3306:

```bash
# Replace APPRUNNER_SG with the connector's security group id
aws ec2 authorize-security-group-ingress --group-id $RDS_SG \
  --protocol tcp --port 3306 --source-group APPRUNNER_SG --region $REGION
```

Watch the App Runner logs: on first boot it runs the schema init (`RUN_DB_INIT=true`), seeds the
paper's demo data, then `🚀 Bitwix backend running on port 8080`.

**After the first successful deploy, set `RUN_DB_INIT=false`** (edit env → redeploy) so it doesn't
re-run every restart.

Sanity check the API directly:
```bash
curl https://xxxx.ap-south-1.awsapprunner.com/api/health      # {"success":true,...}
curl https://xxxx.ap-south-1.awsapprunner.com/api/settings     # INR default
```

---

## 4. ACM certificate (us-east-1, for CloudFront)

You already started this (the `_...acm-validations.aws.` CNAME in GoDaddy). Ensure a cert exists in
**us-east-1** covering both names:

```bash
aws acm request-certificate --region us-east-1 \
  --domain-name bitwix.co.in \
  --subject-alternative-names www.bitwix.co.in \
  --validation-method DNS \
  --query CertificateArn --output text
```

Add the CNAME validation record(s) it shows. **If you move DNS to Route 53 (step 7), create the
validation CNAME there** (or keep the existing GoDaddy one until the cert is `ISSUED`). Wait for
status `ISSUED`:

```bash
aws acm describe-certificate --region us-east-1 --certificate-arn <ARN> \
  --query 'Certificate.Status' --output text
```

---

## 5. Frontend → S3 (private)

Build with the relative API base (already the default) and upload:

```bash
cd Frontend
pnpm install
pnpm build            # outputs dist/
cd ..

aws s3api create-bucket --bucket $APP-web-bitwix --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION
aws s3api put-public-access-block --bucket $APP-web-bitwix \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3 sync Frontend/dist s3://$APP-web-bitwix --delete
```

Keep the bucket **private** — CloudFront reaches it via Origin Access Control (next step).

---

## 6. CloudFront distribution

Create in the **console** (two origins + SPA error mapping are clearest there):

1. **Create distribution.**
2. **Origin 1 — S3:** select `bitwix-web-bitwix`. Origin access: **Origin access control (OAC)** →
   create one. CloudFront shows a bucket policy to copy into the S3 bucket (allows this
   distribution to read).
3. **Default cache behavior** (S3 origin):
   - Viewer protocol policy: **Redirect HTTP to HTTPS**
   - Cache policy: **CachingOptimized**
4. **Add Origin 2 — App Runner:** origin domain = the App Runner URL host
   (`xxxx.ap-south-1.awsapprunner.com`), protocol **HTTPS only**.
5. **Add behavior** for the API:
   - Path pattern: **`/api/*`**
   - Origin: the App Runner origin
   - Viewer protocol policy: **Redirect HTTP to HTTPS**
   - Allowed methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
   - Cache policy: **CachingDisabled**
   - Origin request policy: **AllViewer** (forwards Authorization header, query strings, body)
6. **SPA fallback — Custom error responses** (so client-side routes like `/admin/projects` work):
   - HTTP 403 → Response page `/index.html`, HTTP response code **200**
   - HTTP 404 → Response page `/index.html`, HTTP response code **200**
7. **Settings:**
   - Alternate domain names (CNAMEs): **`bitwix.co.in`** and **`www.bitwix.co.in`**
   - Custom SSL certificate: the **us-east-1 ACM cert** from step 4
   - Default root object: **`index.html`**
8. Create, then copy the distribution domain, e.g. `d123abc.cloudfront.net`.

---

## 7. DNS: Route 53 + switch GoDaddy nameservers

1. **Create a hosted zone** for `bitwix.co.in`:
   ```bash
   aws route53 create-hosted-zone --name bitwix.co.in \
     --caller-reference $(date +%s) --query 'DelegationSet.NameServers'
   ```
   Note the **4 nameservers** it returns.
2. **Recreate your existing records** in Route 53 (from your GoDaddy screenshot) so email keeps
   working after the switch: the `MX` records (`smtp.secureserver.net`, `mailstore1...`), the
   `email` CNAME, the two `_domainkey` DKIM CNAMEs, and the ACM validation CNAME. (Skip GoDaddy's
   `NS`/`SOA` — Route 53 provides its own.)
3. **Point the site at CloudFront** — ALIAS records (apex works natively in Route 53):
   - `bitwix.co.in`  → **A – Alias** → the CloudFront distribution
   - `www.bitwix.co.in` → **A – Alias** → the CloudFront distribution
4. **At GoDaddy:** Domain → Nameservers → **Change to custom** → enter the 4 Route 53 nameservers.
   Propagation is usually minutes to a couple of hours.

> If you'd rather not move DNS: in GoDaddy point `www` (CNAME) at the CloudFront domain and use
> GoDaddy **domain forwarding** for the apex → `https://www.bitwix.co.in`. Route 53 is cleaner for
> the apex, which is why it's recommended.

---

## 8. Go-live checklist

```bash
curl -I https://bitwix.co.in                       # 200, from CloudFront
curl    https://bitwix.co.in/api/health            # {"success":true,...}
curl    https://bitwix.co.in/api/settings          # INR default
```
- Visit `https://bitwix.co.in` → marketing site (Services/Team load from the API).
- Visit `https://bitwix.co.in/admin` → redirects to `/admin/login`; log in → console works.
- Hard-refresh a deep route like `https://bitwix.co.in/admin/projects` → still loads (SPA fallback).

---

## 9. Redeploy cheat-sheet

**Frontend change:**
```bash
cd Frontend && pnpm build && cd ..
aws s3 sync Frontend/dist s3://$APP-web-bitwix --delete
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths '/*'
```

**Backend change:**
```bash
cd Backend
docker build --platform linux/amd64 -t $APP-backend .
docker tag $APP-backend:latest $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$APP-backend:latest
docker push $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$APP-backend:latest
cd ..
aws apprunner start-deployment --service-arn <APP_RUNNER_ARN> --region $REGION
```

---

## 10. Security hardening (before real traffic)

- **Change admin credentials**: strong `ADMIN_PASSWORD`, long random `AUTH_SECRET` (rotating
  `AUTH_SECRET` forces re-login).
- Move `DB_PASSWORD` / `ADMIN_PASSWORD` / `AUTH_SECRET` into **Secrets Manager**.
- Keep RDS **not publicly accessible**; only the App Runner connector SG can reach 3306.
- Consider **AWS WAF** on the CloudFront distribution and tightening the login rate limit.
- Set `DB_SSL_REJECT_UNAUTHORIZED=true` and bundle the RDS CA if you want full cert verification.

## 11. Rough monthly cost (light traffic)

RDS db.t3.micro (~$15) + App Runner 0.25vCPU (~$5–15 idle-to-light) + S3/CloudFront (cents–$1) +
Route 53 hosted zone ($0.50). Ballpark **$25–40/month**. Stop/downsize RDS and App Runner when idle
to reduce it.

## 12. Team photo uploads (S3)

The admin console (Employee Management → **Website Team**) can upload team photos
to S3; the DB stores the resulting URL and the website shows it (initials avatar
when none). Enable it once:

```bash
export ACC=214745598689 REGION=ap-south-1
export MEDIA_BUCKET=bitwix-media-$ACC

# 1. Bucket for public-readable images
aws s3api create-bucket --bucket $MEDIA_BUCKET --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION
aws s3api put-public-access-block --bucket $MEDIA_BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket $MEDIA_BUCKET --policy "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{\"Sid\":\"PublicReadTeam\",\"Effect\":\"Allow\",\"Principal\":\"*\",
    \"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$MEDIA_BUCKET/team/*\"}]
}"

# 2. App Runner INSTANCE role (the running container's AWS identity) with write access
cat > /tmp/trust.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"tasks.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
aws iam create-role --role-name bitwix-apprunner-instance \
  --assume-role-policy-document file:///tmp/trust.json
aws iam put-role-policy --role-name bitwix-apprunner-instance --policy-name media-write \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",
    \"Action\":[\"s3:PutObject\",\"s3:DeleteObject\"],\"Resource\":\"arn:aws:s3:::$MEDIA_BUCKET/*\"}]}"
```

Then, in the **App Runner** service:
- **Security → Instance role** → select `bitwix-apprunner-instance`.
- **Environment variables** → add `MEDIA_BUCKET=bitwix-media-214745598689` and `MEDIA_REGION=ap-south-1`.
- Deploy.

Uploads are optional: with `MEDIA_BUCKET` unset the app still runs and members show
initials. To serve images through your domain instead of the S3 URL, set
`MEDIA_PUBLIC_BASE_URL` to a CloudFront/CDN domain that fronts the media bucket.

> Note: the frontend GitHub Action syncs `dist/` with `--delete`, so **do not** store
> uploads in the website bucket — use this separate media bucket.
