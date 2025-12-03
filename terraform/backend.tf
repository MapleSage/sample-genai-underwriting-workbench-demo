# Configure remote backend for state management
# Before running terraform init, ensure the backend storage exists and update these values
#
# To create the backend storage:
#   az group create --name tf-backend-rg --location eastus
#   az storage account create --name tfbackend<random> --resource-group tf-backend-rg --location eastus
#   az storage container create --name tfstate --account-name tfbackend<random>
#
# Then uncomment and update the backend block below with actual values

# terraform {
#   backend "azurerm" {
#     resource_group_name  = "tf-backend-rg"
#     storage_account_name = "tfbackend<random>"
#     container_name       = "tfstate"
#     key                  = "uw-workbench-aks.tfstate"
#     use_oidc              = true  # Use OIDC for authentication (recommended)
#   }
# }

# For local state during development (not recommended for production):
# terraform {
#   backend "local" {
#     path = "terraform.tfstate"
#   }
# }
