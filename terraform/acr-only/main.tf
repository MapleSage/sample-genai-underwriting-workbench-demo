resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
  tags = {
    ManagedBy = "Terraform-acr-only"
    CreatedBy = "copilot-agent"
  }
}

resource "random_pet" "suffix" {
  length = 2
}

resource "azurerm_container_registry" "acr" {
  name                = lower(replace("${var.acr_name_prefix}${random_pet.suffix.id}", "-", ""))
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = var.acr_sku
  admin_enabled       = false

  tags = {
    ManagedBy = "Terraform-acr-only"
    CreatedBy = "copilot-agent"
  }
}
