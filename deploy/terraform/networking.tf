# Program 4 · Production networking — external HTTPS Application Load Balancer + Google-managed SSL.
#
# READINESS POSTURE: authored + validated + plan-clean, gated OFF by default (var.provision_lb = false)
# → no reserved IP, no LB, no cost. Live provisioning deferred to Program 9. See Deferred-Item Register §E.
#
# Topology (single public domain, path-based routing):
#   client ──HTTPS──> global external ALB ──serverless NEG──> Cloud Run
#     /api/*  → osieri-api      (API_PREFIX=api/v1 lives under /api)
#     default → osieri-web
#   Both Cloud Run services use ingress=INTERNAL_LOAD_BALANCER, so they are reachable ONLY through this LB.
#   Port 80 is redirected to 443.
#
# LAUNCH ORDERING NOTE (Program 9): a Google-managed cert only validates AFTER the domain's DNS points at
# the reserved LB IP. Sequence: apply (reserves lb_ip) → set the registrar A record (apex + www) → the
# managed cert transitions PROVISIONING → ACTIVE (can take 15–60 min). The registrar/DNS provider is
# external ("Other" — to be confirmed at launch); this repo does not manage the DNS zone.

locals {
  lb_count = var.provision_lb ? 1 : 0
}

# Compute API is only needed when the LB is provisioned (gated so the default plan stays clean).
resource "google_project_service" "compute" {
  count              = local.lb_count
  project            = var.project_id
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

# Reserved global external IP — this is the address the registrar A record (apex + www) points to.
resource "google_compute_global_address" "lb_ip" {
  count      = local.lb_count
  project    = var.project_id
  name       = "osieri-lb-ip"
  depends_on = [google_project_service.compute]
}

# Serverless NEGs → the Cloud Run services.
resource "google_compute_region_network_endpoint_group" "api" {
  count                 = local.lb_count
  project               = var.project_id
  name                  = "osieri-api-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.api[0].name
  }
  depends_on = [google_project_service.compute]
}

resource "google_compute_region_network_endpoint_group" "web" {
  count                 = local.lb_count
  project               = var.project_id
  name                  = "osieri-web-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.web[0].name
  }
  depends_on = [google_project_service.compute]
}

# Backend services (serverless NEGs need no health checks — Cloud Run manages instance health).
resource "google_compute_backend_service" "api" {
  count                 = local.lb_count
  project               = var.project_id
  name                  = "osieri-api-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  backend {
    group = google_compute_region_network_endpoint_group.api[0].id
  }
}

resource "google_compute_backend_service" "web" {
  count                 = local.lb_count
  project               = var.project_id
  name                  = "osieri-web-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  backend {
    group = google_compute_region_network_endpoint_group.web[0].id
  }
}

# URL map: default → web; /api/* → api.
resource "google_compute_url_map" "lb" {
  count           = local.lb_count
  project         = var.project_id
  name            = "osieri-url-map"
  default_service = google_compute_backend_service.web[0].id

  host_rule {
    hosts        = [var.domain, "www.${var.domain}"]
    path_matcher = "main"
  }

  path_matcher {
    name            = "main"
    default_service = google_compute_backend_service.web[0].id
    path_rule {
      paths   = ["/api", "/api/*"]
      service = google_compute_backend_service.api[0].id
    }
  }
}

# Google-managed SSL certificate for the apex + www.
resource "google_compute_managed_ssl_certificate" "cert" {
  count   = local.lb_count
  project = var.project_id
  name    = "osieri-cert"
  managed {
    domains = [var.domain, "www.${var.domain}"]
  }
}

resource "google_compute_target_https_proxy" "https" {
  count            = local.lb_count
  project          = var.project_id
  name             = "osieri-https-proxy"
  url_map          = google_compute_url_map.lb[0].id
  ssl_certificates = [google_compute_managed_ssl_certificate.cert[0].id]
}

resource "google_compute_global_forwarding_rule" "https" {
  count                 = local.lb_count
  project               = var.project_id
  name                  = "osieri-https-fr"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_target_https_proxy.https[0].id
  ip_address            = google_compute_global_address.lb_ip[0].id
}

# Port 80 → 301 redirect to HTTPS.
resource "google_compute_url_map" "redirect" {
  count   = local.lb_count
  project = var.project_id
  name    = "osieri-http-redirect"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http" {
  count   = local.lb_count
  project = var.project_id
  name    = "osieri-http-proxy"
  url_map = google_compute_url_map.redirect[0].id
}

resource "google_compute_global_forwarding_rule" "http" {
  count                 = local.lb_count
  project               = var.project_id
  name                  = "osieri-http-fr"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "80"
  target                = google_compute_target_http_proxy.http[0].id
  ip_address            = google_compute_global_address.lb_ip[0].id
}
