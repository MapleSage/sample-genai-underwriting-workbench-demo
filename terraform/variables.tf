variable "subscription_id" {
  type        = string
  description = "Azure subscription ID"
}

variable "resource_group_name" {
  type        = string
  description = "Azure resource group name"
  default     = "uw-workbench-aks-rg"
}

variable "location" {
  type        = string
  description = "Azure region"
  default     = "eastus"
}

variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"
  default     = "prod"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "uw-workbench"
}

# AKS Configuration
variable "kubernetes_version" {
  type        = string
  description = "Kubernetes version"
  default     = "1.30"
}

variable "aks_node_count" {
  type        = number
  description = "Initial number of AKS nodes"
  default     = 3
}

variable "aks_min_node_count" {
  type        = number
  description = "Minimum number of nodes for autoscaling"
  default     = 2
}

variable "aks_max_node_count" {
  type        = number
  description = "Maximum number of nodes for autoscaling"
  default     = 10
}

variable "aks_vm_size" {
  type        = string
  description = "VM size for AKS nodes"
  default     = "Standard_D4s_v3"
}

# Storage Configuration
variable "storage_account_tier" {
  type        = string
  description = "Storage account tier (Standard or Premium)"
  default     = "Standard"
}

variable "storage_account_replication_type" {
  type        = string
  description = "Storage replication type"
  default     = "LRS"
}

# Cosmos DB Configuration
variable "cosmos_db_tier" {
  type        = string
  description = "Cosmos DB tier"
  default     = "Standard"
}

variable "cosmos_db_autopilot_throughput" {
  type        = number
  description = "Cosmos DB autopilot max RU/s"
  default     = 4000
}

# ACR Configuration
variable "acr_sku" {
  type        = string
  description = "ACR SKU (Basic, Standard, Premium)"
  default     = "Standard"
}

# Logging Configuration
variable "log_analytics_retention_in_days" {
  type        = number
  description = "Log Analytics retention in days"
  default     = 30
}

variable "tags" {
  type        = map(string)
  description = "Common tags for all resources"
  default = {
    ManagedBy = "Terraform"
    Project   = "Underwriting-Workbench"
  }
}
