**Deployment Diagnostic Report**

Last updated: 2025-12-04

**Purpose**: This document captures all actions taken while attempting to build, push, and deploy container images to AKS via GitHub Actions, the file changes and fixes applied, CI run results, and recommended next steps. It's intended as a complete handoff for continued troubleshooting or to pass to another assistant (e.g., Claude).

**Quick Bottom Line**: CI builds images successfully in the runner, but pushes fail because the Azure Container Registry `uwworkbenchacr` does not exist (or is not reachable) in subscription `2bfa9715-785b-445f-8102-6a423a7495ef`. Until a reachable registry is created or CI pointed at an existing registry, the pipeline cannot complete the push & deploy stages.

**Repository & Branch**
- Repo: `MapleSage/uw-workbench-aks-deploy` (pushed artifacts from local workspace)
- Local workspace root: `/Volumes/Macintosh HD Ext./Developer/genai-underwriting-workbench-demo`
- Branch used: `main`

**Important Identifiers & Secrets (set in repo)**
- `AZURE_CREDENTIALS` : service principal JSON used by GitHub Actions (stored as secret)
- `SUBSCRIPTION_ID` : `2bfa9715-785b-445f-8102-6a423a7495ef`
- `ACR_NAME` : `uwworkbenchacr` (secret set; registry not found in subscription)
- `AKS_CLUSTER_NAME` : `uw-workbench-aks`
- `AKS_RESOURCE_GROUP` : `uw-workbench-aks-rg`

**Files created / modified during the effort**
- `.github/workflows/aks-deploy.yml` — main CI workflow to build images, tag them for ACR, log in, push images, and apply `k8s/manifests.yaml` to AKS. Patched to compute ACR login server at runtime and to export `IMAGE_API` and `IMAGE_WORKER` env vars.
- `.github/workflows/diagnose-acr.yml` — temporary diagnostic workflow to list ACRs and check `uwworkbenchacr`.
- `Dockerfile.api`, `Dockerfile.worker` — image definitions (already present in repo root).
- `k8s/manifests.yaml` — Kubernetes manifests with placeholder image references replaced by the workflow during run.
- `terraform/` — Terraform code to provision ACR, AKS, and supporting resources (present but not applied by agent).
- `azure-version/functions/api_handler/__init__.py` — changed upload path to `documents/{jobId}/{filename}`.
- `azure-version/functions/document_extract/__init__.py` — changed job lookup to parse jobId from blob path.

**CI Runs & Key Log Excerpts**
Relevant runs (examples called during investigation):

- Run ID: `19929381651` — early failure: Azure login reported "No subscriptions found" (service principal did not yet have subscription visibility). Resolved by assigning the SP Contributor role on the subscription.

- Run ID: `19929474811` — after fixing SP permission:
  - Build step: Docker images were successfully built in the runner and local tags were constructed like `uwworkbenchacr.azurecr.io/uw/api:<digest>` and `.../uw/worker:<digest>`.
  - Push/login step: `az acr login` failed with a warning that the registry `uwworkbenchacr` could not be found in the subscription and then: "Could not connect to the registry login server 'uwworkbenchacr.azurecr.io'". Image push aborted.

- Diagnostic Run ID: `19929970777` — diagnostic workflow output (key excerpts):
  - ACR list output (registries present in the subscription):
    - `sagecmoacr1762013144` (login server: `sagecmoacr1762013144.azurecr.io`)
    - `sageinsureacr6a05ef1f` (login server: `sageinsureacr6a05ef1f.azurecr.io`)
    - `swireregistry` (login server: `swireregistry.azurecr.io`)
  - `az acr show --name uwworkbenchacr` → ERROR: The resource with name 'uwworkbenchacr' could not be found in subscription `2bfa9715-...`.
  - `az acr check-health -n uwworkbenchacr` → `CONNECTIVITY_DNS_ERROR` (DNS for `uwworkbenchacr.azurecr.io` not reachable).

**Interpretation**
- The service principal used by GitHub Actions has adequate permissions now (login succeeded and subscription is visible).
- The runner can build docker images locally and tag them correctly.
- The registry `uwworkbenchacr` does not exist (or is misnamed) in the used subscription — hence `az acr login` and push fail due to DNS/connectivity errors.

**Options to Resolve (pick one)**
1. Provision the ACR named `uwworkbenchacr` in the target subscription (recommended if you want to use `ACR_NAME=uwworkbenchacr`). This can be done:
   - Manually, with the Azure CLI (fast):

```bash
# create a resource group if needed
az group create -n uw-workbench-aks-rg -l eastus
# create the ACR
az acr create -n uwworkbenchacr -g uw-workbench-aks-rg -l eastus --sku Standard
az acr show -n uwworkbenchacr -o table
```

   - Or use the repo `terraform/` to provision ACR + AKS. Typical terraform workflow (zsh):

```bash
cd terraform
terraform init
terraform plan -out plan.tfplan
terraform apply plan.tfplan
```

   Note: If you run Terraform from the runner/CI, ensure the SP has rights to create resources in the target subscription and resource group.

2. Point CI to an existing registry in the subscription (quicker). Update the repository secret `ACR_NAME` to one of the registries shown in the diagnostic run, e.g., `swireregistry`, then re-dispatch the `aks-deploy.yml` workflow. Steps:

```bash
# locally (requires gh CLI and repo admin rights)
gh secret set ACR_NAME -b"swireregistry" --repo MapleSage/uw-workbench-aks-deploy
# then rerun workflow or use GitHub UI to re-dispatch
gh workflow run aks-deploy.yml -f ref=main --repo MapleSage/uw-workbench-aks-deploy
```

3. If you prefer another cloud registry (ECR, Docker Hub), change the workflow to authenticate to that registry and set `ACR_NAME`-style variables accordingly.

**Exact Handoff Checklist for Claude (or other assistant)**
1. Review this file: `docs/DEPLOYMENT_DIAGNOSTIC_REPORT.md` (this file).
2. Review CI workflow file: `.github/workflows/aks-deploy.yml` — the places to inspect:
   - where `az login` runs
   - where `az acr show` or `az acr login` is invoked
   - where `IMAGE_API` and `IMAGE_WORKER` are computed
3. Look at the diagnostic workflow: `.github/workflows/diagnose-acr.yml` (it was used to confirm ACR absence).
4. Inspect `terraform/` to assess whether applying Terraform will produce `uwworkbenchacr` (look for `azurerm_container_registry` resource and its `name`/`login_server` outputs).
5. Verify that the service principal (secret `AZURE_CREDENTIALS`) has rights to create the resources (Contributor) or has appropriate access to the resource group in which ACR will be created.

**Credentials & Access Notes for Next Person**
- GitHub secrets used: `AZURE_CREDENTIALS`, `ACR_NAME`, `AKS_CLUSTER_NAME`, `AKS_RESOURCE_GROUP`, `SUBSCRIPTION_ID`.
- Ensure the `AZURE_CREDENTIALS` SP has the following at minimum: Resource creation rights for Terraform (Contributor), and access to the target resource group for AKS/ACR operations.

**Commands to Re-run / Verify Locally**
- Verify subscription & ACR list with the SP (in a shell with `az` and the SP credentials exported):

```bash
az login --service-principal -u <appId> -p '<password-or-cert>' --tenant <tenantId>
az account set --subscription 2bfa9715-785b-445f-8102-6a423a7495ef
az acr list -o table
az acr show -n uwworkbenchacr -o table
az acr check-health -n uwworkbenchacr
```

**Where logs and artifacts live**
- GitHub Actions run logs for runs mentioned above are visible in the repo `Actions` tab. Key run IDs:
  - `19929381651` (initial failing run)
  - `19929474811` (build succeeded, push failed)
  - `19929970777` (diagnostic run showing registry list)

**Final Notes / Recommendations**
- If you want the pipeline to use `uwworkbenchacr`, create that registry in the subscription (option 1). If you want a fast validation, update `ACR_NAME` to one of the existing registries shown in the diagnostic run (option 2) and re-run the `aks-deploy.yml` workflow.
- If you want me to proceed, tell me which option and which identity to use (run Terraform from CI using the existing SP, or ask me to run `az` commands locally). I can prepare the Terraform `plan` and present it for approval before `apply`.

**Appendix — Key log excerpts**
 - `az account show` (subscription): shows `id: 2bfa9715-785b-445f-8102-6a423a7495ef` and `isDefault: true`.
 - `az acr list` output excerpt:

```
Name                   ResourceGroup    LoginServer
---------------------  ---------------  --------------------------------
sagecmoacr1762013144   SageCMO          sagecmoacr1762013144.azurecr.io
sageinsureacr6a05ef1f  sageinsure-rg    sageinsureacr6a05ef1f.azurecr.io
swireregistry          swire-rg         swireregistry.azurecr.io
```

 - `az acr show --name uwworkbenchacr` → ERROR: The resource with name 'uwworkbenchacr' and type 'Microsoft.ContainerRegistry/registries' could not be found in subscription.
 - `az acr check-health -n uwworkbenchacr` → `CONNECTIVITY_DNS_ERROR` (DNS for `uwworkbenchacr.azurecr.io` not reachable).

— End of report —
