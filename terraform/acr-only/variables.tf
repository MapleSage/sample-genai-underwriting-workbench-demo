variable "location" {
  type    = string
  default = "eastus"
}

variable "resource_group_name" {
  type    = string
  default = "uw-workbench-acr-rg"
}

variable "acr_sku" {
  type    = string
  default = "Standard"
}

variable "acr_name_prefix" {
  type    = string
  default = "uwworkbenchacr"
  description = "Prefix for the container registry name; a short random suffix will be appended to ensure uniqueness"
}
