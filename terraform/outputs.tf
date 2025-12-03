output "aks_cluster_name" {
  value       = azurerm_kubernetes_cluster.aks.name
  description = "AKS cluster name"
}

output "aks_cluster_id" {
  value       = azurerm_kubernetes_cluster.aks.id
  description = "AKS cluster ID"
}

output "aks_kube_config" {
  value       = azurerm_kubernetes_cluster.aks.kube_config_raw
  sensitive   = true
  description = "Kubernetes config for AKS cluster"
}

output "aks_oidc_issuer_url" {
  value       = try(azurerm_kubernetes_cluster.aks.oidc_issuer[0].issuer, null)
  description = "OIDC issuer URL for Workload Identity"
}

output "acr_login_server" {
  value       = azurerm_container_registry.acr.login_server
  description = "ACR login server"
}

output "acr_name" {
  value       = azurerm_container_registry.acr.name
  description = "ACR name"
}

output "storage_account_name" {
  value       = azurerm_storage_account.storage.name
  description = "Storage account name"
}

output "storage_account_id" {
  value       = azurerm_storage_account.storage.id
  description = "Storage account ID"
}

output "cosmos_endpoint" {
  value       = azurerm_cosmosdb_account.cosmos.endpoint
  description = "Cosmos DB endpoint"
}

output "cosmos_account_name" {
  value       = azurerm_cosmosdb_account.cosmos.name
  description = "Cosmos DB account name"
}

output "servicebus_namespace_name" {
  value       = azurerm_servicebus_namespace.sb.name
  description = "Service Bus namespace name"
}

output "servicebus_connection_string" {
  value       = azurerm_servicebus_namespace.sb.default_primary_connection_string
  sensitive   = true
  description = "Service Bus connection string"
}

output "servicebus_queue_name" {
  value       = azurerm_servicebus_queue.extraction_queue.name
  description = "Service Bus queue name"
}

output "workload_identity_client_id" {
  value       = azurerm_user_assigned_identity.workload.client_id
  description = "Workload Identity client ID"
}

output "workload_identity_principal_id" {
  value       = azurerm_user_assigned_identity.workload.principal_id
  description = "Workload Identity principal ID"
}

output "log_analytics_workspace_id" {
  value       = azurerm_log_analytics_workspace.workspace.id
  description = "Log Analytics workspace ID"
}

output "resource_group_name" {
  value       = azurerm_resource_group.rg.name
  description = "Resource group name"
}
