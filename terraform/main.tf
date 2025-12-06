locals {
  resource_prefix = "${var.project_name}-${var.environment}"
  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      Timestamp   = timestamp()
    }
  )
}

# Resource Group
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
  tags     = local.common_tags
}

# Log Analytics Workspace for monitoring
resource "azurerm_log_analytics_workspace" "workspace" {
  name                = "${local.resource_prefix}-law"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"
  retention_in_days   = var.log_analytics_retention_in_days

  tags = local.common_tags
}

# Container Insights Solution
resource "azurerm_monitor_diagnostic_setting" "aks_diagnostics" {
  name                       = "${local.resource_prefix}-diag"
  target_resource_id         = azurerm_kubernetes_cluster.aks.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.workspace.id

  enabled_log {
    category = "kube-apiserver"
  }

  enabled_log {
    category = "kube-controller-manager"
  }

  enabled_log {
    category = "kube-scheduler"
  }

  enabled_log {
    category = "kube-audit"
  }

  metric {
    category = "AllMetrics"
  }

  depends_on = [azurerm_kubernetes_cluster.aks]
}

# Managed Identity for AKS cluster
resource "azurerm_user_assigned_identity" "aks" {
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  name                = "${local.resource_prefix}-aks-mi"

  tags = local.common_tags
}

# Managed Identity for Workload Identity
resource "azurerm_user_assigned_identity" "workload" {
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  name                = "${local.resource_prefix}-workload-mi"

  tags = local.common_tags
}

# AKS Cluster
resource "azurerm_kubernetes_cluster" "aks" {
  name                = "${local.resource_prefix}-aks"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = local.resource_prefix
  kubernetes_version  = var.kubernetes_version

  default_node_pool {
    name                = "default"
    node_count          = var.aks_node_count
    vm_size             = "Standard_D4s_v3"
    enable_auto_scaling = true
    min_count           = var.aks_min_node_count
    max_count           = var.aks_max_node_count
    os_disk_size_gb     = 100

    tags = local.common_tags
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.aks.id]
  }

  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
    outbound_type     = "loadBalancer"
  }

  workload_identity_enabled = true
  oidc_issuer_enabled       = true

  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.workspace.id
  }

  tags = local.common_tags

  depends_on = [
    azurerm_log_analytics_workspace.workspace,
  ]
}

# Federated Credential for Workload Identity
resource "azurerm_federated_identity_credential" "workload" {
  name                = "workload-credential"
  resource_group_name = azurerm_resource_group.rg.name
  audience            = ["api://AzureADTokenExchange"]
  issuer              = azurerm_kubernetes_cluster.aks.oidc_issuer_enabled ? azurerm_kubernetes_cluster.aks.oidc_issuer_url : ""
  parent_id           = azurerm_user_assigned_identity.workload.id
  subject             = "system:serviceaccount:underwriting:underwriting-workload-sa"

  depends_on = [azurerm_kubernetes_cluster.aks]
}

# Azure Container Registry
resource "azurerm_container_registry" "acr" {
  name                = replace("${local.resource_prefix}acr", "-", "")
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = var.acr_sku
  admin_enabled       = false

  tags = local.common_tags
}

# Role assignment: AKS pull from ACR
resource "azurerm_role_assignment" "aks_acr_pull" {
  scope              = azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id       = azurerm_user_assigned_identity.aks.principal_id
}

# Role assignment: Workload Identity can pull from ACR
resource "azurerm_role_assignment" "workload_acr_pull" {
  scope              = azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id       = azurerm_user_assigned_identity.workload.principal_id
}

# Storage Account for documents
resource "azurerm_storage_account" "storage" {
  name                     = replace("${local.resource_prefix}sa", "-", "")
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = var.storage_account_tier
  account_replication_type = var.storage_account_replication_type
  https_traffic_only_enabled = true

  tags = local.common_tags
}

# Blob container for documents
resource "azurerm_storage_container" "documents" {
  name                  = "documents"
  storage_account_name  = azurerm_storage_account.storage.name
  container_access_type = "private"
}

# Role assignment: Workload Identity access to Storage
resource "azurerm_role_assignment" "workload_storage" {
  scope              = azurerm_storage_account.storage.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id       = azurerm_user_assigned_identity.workload.principal_id
}

# Cosmos DB Account
resource "azurerm_cosmosdb_account" "cosmos" {
  name                = "${local.resource_prefix}-cosmos"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"
  consistency_policy {
    consistency_level       = "Session"
    max_staleness_prefix    = 100
    max_interval_in_seconds = 5
  }

  geo_location {
    location          = azurerm_resource_group.rg.location
    failover_priority = 0
  }

  tags = local.common_tags
}

# Cosmos DB Database
resource "azurerm_cosmosdb_sql_database" "underwriting" {
  name                = "underwriting"
  resource_group_name = azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.cosmos.name
}

# Cosmos DB Container for jobs with autoscale and TTL
resource "azurerm_cosmosdb_sql_container" "jobs" {
  name                = "jobs"
  resource_group_name = azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.cosmos.name
  database_name       = azurerm_cosmosdb_sql_database.underwriting.name
  partition_key_paths = ["/id"]

  autoscale_settings {
    max_throughput = var.cosmos_db_autopilot_throughput
  }

  default_ttl = 2592000 # 30 days in seconds

  indexing_policy {
    indexing_mode = "consistent"

    included_path {
      path = "/*"
    }

    excluded_path {
      path = "/\"_etag\"/?"
    }
  }

  depends_on = [azurerm_cosmosdb_sql_database.underwriting]
}

# Role assignment: Workload Identity access to Cosmos
resource "azurerm_role_assignment" "workload_cosmos" {
  scope              = azurerm_cosmosdb_account.cosmos.id
  role_definition_name = "DocumentDB Account Contributor"
  principal_id       = azurerm_user_assigned_identity.workload.principal_id
}

# Service Bus Namespace
resource "azurerm_servicebus_namespace" "sb" {
  name                = "${local.resource_prefix}-sb"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "Standard"

  tags = local.common_tags
}

# Service Bus Queue for document extraction
resource "azurerm_servicebus_queue" "extraction_queue" {
  name                = "document-extraction"
  namespace_id        = azurerm_servicebus_namespace.sb.id
  max_delivery_count  = 10
  lock_duration       = "PT5M"
  default_message_ttl = "P1D"

  depends_on = [azurerm_servicebus_namespace.sb]
}

# Role assignment: Workload Identity access to Service Bus
resource "azurerm_role_assignment" "workload_servicebus" {
  scope              = azurerm_servicebus_namespace.sb.id
  role_definition_name = "Azure Service Bus Data Owner"
  principal_id       = azurerm_user_assigned_identity.workload.principal_id
}

# Event Grid System Topic for Blob Storage
resource "azurerm_eventgrid_system_topic" "blob_events" {
  name                = "${local.resource_prefix}-blob-topic"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  source_arm_resource_id = azurerm_storage_account.storage.id
  topic_type          = "Microsoft.Storage.StorageAccounts"

  tags = local.common_tags

  depends_on = [azurerm_storage_account.storage]
}

# TODO: Event Grid Subscription - requires proper schema validation
# This resource needs to be configured with the correct azurerm provider schema
# For now, Event Grid will be provisioned but subscriptions can be added manually or via Azure Portal
/*
resource "azurerm_eventgrid_system_topic_event_subscription" "blob_to_queue" {
  name                = "blob-created-to-queue"
  system_topic_name   = azurerm_eventgrid_system_topic.blob_events.name
  resource_group_name = azurerm_resource_group.rg.name

  event_delivery_schema = "EventGridSchema"

  subject_filter {
    subject_begins_with = "/blobServices/default/containers/documents"
  }

  included_event_types = ["Microsoft.Storage.BlobCreated"]

  service_bus_queue_endpoint_properties {
    resource_id = azurerm_servicebus_queue.extraction_queue.id
  }

  depends_on = [
    azurerm_eventgrid_system_topic.blob_events,
    azurerm_servicebus_queue.extraction_queue
  ]
}
*/
