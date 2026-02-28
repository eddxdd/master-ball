# AWS pipeline setup (test → build → deploy)

This repo is set up to run the full CI/CD pipeline on AWS: **CodePipeline** (source from GitHub) → **CodeBuild** (test, build Docker image, deploy to EC2). You get a step-by-step view in the CodePipeline console (similar to GitHub Actions).

## Prerequisites

1. **GitHub connection** – In **CodeBuild → Settings → Connections** you have a connection (e.g. `github-amazon`) to GitHub with status **Available**, and the AWS Connector for GitHub is **installed** on your account with access to this repo (so the repo appears in CodeBuild source).
2. **ECR repository** – `338753559735.dkr.ecr.us-east-2.amazonaws.com/master-ball-api` exists in us-east-2.
3. **SSH key in Secrets Manager** – The same private key you use to deploy to EC2 (e.g. from GitHub Actions secret `EC2_SSH_PRIVATE_KEY`) must be stored in AWS Secrets Manager so the deploy stage can use it.
   - In **Secrets Manager**: Create secret → **Other type of secret** → Plaintext, paste the **entire** private key (including `-----BEGIN ... KEY-----` and `-----END ... KEY-----`). Name it e.g. `master-ball/ec2-deploy-key`. Note the **secret name** or **ARN** for the deploy project.

## 1. Create the three CodeBuild projects

All in **CodeBuild → Build projects → Create build project**. Region: **us-east-2**.

### 1.1 Test project: `master-ball-test`

- **Name:** `master-ball-test`
- **Source:** **No source** (CodePipeline will pass the GitHub source as input when the pipeline runs).
- **Environment:**
  - **Managed image**
  - **Amazon Linux**
  - **Standard**
  - **3.0** (or latest)
  - **Privileged:** No
- **Buildspec:** **Use a buildspec file** → `buildspec-test.yml`
- **Artifacts:** None
- **Service role:** New or existing role with CloudWatch Logs

Create the project.


### 1.2 Build project: `master-ball-build`

- **Name:** `master-ball-build`
- **Source:** **No source** (pipeline provides it).
- **Environment:**
  - **Managed image**
  - **Docker**
  - **Standard**
  - **3.0** (or latest)
  - **Compute:** **BUILD_GENERAL1_MEDIUM** (or LARGE if you hit disk space issues)
  - **Privileged:** No
- **Buildspec:** **Use a buildspec file** → `buildspec.yml`
- **Artifacts:** None (image is pushed to ECR)
- **Service role:** Role that can push to ECR (e.g. `ecr:GetAuthorizationToken` plus `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`)

### 1.3 Deploy project: `master-ball-deploy`

- **Name:** `master-ball-deploy`
- **Source:** **No source** (deploy only runs SSH; no code needed).
- **Environment:**
  - **Managed image**
  - **Amazon Linux**
  - **Standard**
  - **3.0**
  - **Privileged:** No
- **Buildspec:** **Use a buildspec file** → `buildspec-deploy.yml`
- **Artifacts:** None
- **Service role:** Role that can:
  - `secretsmanager:GetSecretValue` for the secret that holds the EC2 SSH private key
  - (Optional) `ssm:GetParameters` if you later store EC2_HOST in Parameter Store
- **Environment variables** (add in the project’s Environment section):
  - `EC2_HOST` = your EC2 IP or hostname (e.g. `18.225.81.206`)
  - `EC2_USER` = `ec2-user`
  - `SSH_KEY_SECRET_NAME` = the name of the secret in Secrets Manager (e.g. `master-ball/ec2-deploy-key`) **or** `SSH_KEY_SECRET_ARN` = the full ARN of that secret

Create the project.

## 2. Create the pipeline

In **CodePipeline → Pipelines → Create pipeline**:

- **Name:** `master-ball-pipeline`
- **Service role:** New or existing (must have `codestar-connections:UseConnection` for the GitHub connection).
- **Source stage:**
  - **Source provider:** **GitHub (Version 2)** or **CodeStar Source Connection**
  - **Connection:** Select your connection (e.g. `github-amazon`)
  - **Repository:** Select `eddxdd/master-ball` (or your repo)
  - **Branch:** `main`
  - **Output artifact name:** e.g. `SourceOutput`
- **Add build stage – Test:**
  - **Stage name:** `Test`
  - **Action name:** `Test`
  - **Provider:** **AWS CodeBuild**
  - **Region:** us-east-2
  - **Input artifact:** `SourceOutput`
  - **Project name:** `master-ball-test`
- **Add build stage – Build:**
  - **Stage name:** `Build`
  - **Action name:** `Build`
  - **Provider:** **AWS CodeBuild**
  - **Input artifact:** `SourceOutput`
  - **Project name:** `master-ball-build`
- **Add build stage – Deploy:**
  - **Stage name:** `Deploy`
  - **Action name:** `Deploy`
  - **Provider:** **AWS CodeBuild**
  - **Input artifact:** `SourceOutput` (or leave empty; deploy doesn’t need it)
  - **Project name:** `master-ball-deploy`

Create the pipeline. It will run once; you can also **Release change** to run it again.

## 3. Where to see the “step-by-step” view

- **CodePipeline → Pipelines → master-ball-pipeline**  
  You see each run and, for each run, the stages: **Source**, **Test**, **Build**, **Deploy**. Click a stage to see its status and open the linked CodeBuild run and logs.

## 4. Disable deploy from GitHub Actions

Deployment is now handled by AWS. The repo’s GitHub Actions workflow has been updated so it no longer runs the deploy job; it can still run tests on push/PR for fast feedback if you want.

## 5. Optional: run only on main

To run the pipeline only when `main` changes, the default “Source” configuration already uses branch `main`. So every push to `main` (and the initial creation) will run the pipeline. For PRs, CodePipeline does not run unless you add a separate source or webhook; typically only pushes to `main` trigger the pipeline.

## Summary

| Stage   | CodeBuild project    | Buildspec              | Purpose                          |
|---------|----------------------|------------------------|----------------------------------|
| Source  | —                    | —                      | GitHub (connection) → artifact   |
| Test    | `master-ball-test`   | `buildspec-test.yml`   | type-check, build                |
| Build   | `master-ball-build`  | `buildspec.yml`        | Docker build, push to ECR       |
| Deploy  | `master-ball-deploy`| `buildspec-deploy.yml` | SSH to EC2, docker compose up    |

Store the EC2 SSH private key in Secrets Manager and set `SSH_KEY_SECRET_NAME` (or `SSH_KEY_SECRET_ARN`) and `EC2_HOST`, `EC2_USER` on the deploy project.

