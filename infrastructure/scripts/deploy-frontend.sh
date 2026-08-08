#!/usr/bin/env bash
# Builds the frontend, injects the runtime config.json from Terraform
# outputs, syncs it to S3, and invalidates CloudFront. Run from repo root:
#   ./infrastructure/scripts/deploy-frontend.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/infrastructure/live/eu-central-1/prod/backend"
FRONTEND_DIR="$REPO_ROOT/infrastructure/live/eu-central-1/prod/frontend"
APP_DIR="$REPO_ROOT/app"

echo "==> Reading Terraform outputs"
API_URL=$(terragrunt output -raw api_url --terragrunt-working-dir "$BACKEND_DIR")
USER_POOL_ID=$(terragrunt output -raw user_pool_id --terragrunt-working-dir "$BACKEND_DIR")
CLIENT_ID=$(terragrunt output -raw user_pool_client_id --terragrunt-working-dir "$BACKEND_DIR")
AUTH_DOMAIN=$(terragrunt output -raw auth_domain --terragrunt-working-dir "$BACKEND_DIR")
BUCKET_NAME=$(terragrunt output -raw bucket_name --terragrunt-working-dir "$FRONTEND_DIR")
DISTRIBUTION_ID=$(terragrunt output -raw distribution_id --terragrunt-working-dir "$FRONTEND_DIR")

echo "==> Building backend Lambda bundles"
(cd "$REPO_ROOT/backend" && npm install && node build.mjs)

echo "==> Building frontend"
(cd "$APP_DIR" && npm install && npm run build)

echo "==> Writing runtime config.json"
cat > "$APP_DIR/dist/config.json" <<EOF
{
  "apiBaseUrl": "$API_URL",
  "cognitoAuthority": "https://cognito-idp.eu-central-1.amazonaws.com/$USER_POOL_ID",
  "cognitoClientId": "$CLIENT_ID",
  "cognitoDomain": "https://$AUTH_DOMAIN"
}
EOF

echo "==> Syncing to S3 ($BUCKET_NAME)"
aws s3 sync "$APP_DIR/dist" "s3://$BUCKET_NAME" --delete \
  --cache-control "public, max-age=31536000, immutable" --exclude "index.html" --exclude "config.json"
aws s3 cp "$APP_DIR/dist/index.html" "s3://$BUCKET_NAME/index.html" --cache-control "no-cache"
aws s3 cp "$APP_DIR/dist/config.json" "s3://$BUCKET_NAME/config.json" --cache-control "no-cache"

echo "==> Invalidating CloudFront ($DISTRIBUTION_ID)"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*"

echo "==> Done. Site: https://brewer-wars.com"
