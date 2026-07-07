import os
import logging
from fastapi import FastAPI, Depends, Header, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware

from app.scanner import scan_docker, scan_network
from app.diagram import generate_mermaid

# Configure logging
log_level_str = os.getenv("LOG_LEVEL", "info").upper()
log_level = getattr(logging, log_level_str, logging.INFO)
logging.basicConfig(
    level=log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("docker-visualizer.main")

app = FastAPI(title="Docker Live Visualizer API")

# Optional API Key Authentication
API_KEY = os.getenv("API_KEY", "").strip()

def verify_api_key(authorization: str = Header(None)):
    if not API_KEY:
        return
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization Header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization Scheme. Use Bearer.")
    token = parts[1]
    if token != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

@app.get("/api/diagram")
def get_diagram(
    exclude_networks: str = Query(None),
    exclude_stopped: bool = Query(False),
    hide_internal_ports: bool = Query(False),
    hide_loopback: bool = Query(True),
    hide_veth: bool = Query(True),
    hide_bridge: bool = Query(True),
    direction: str = Query("TD"),
    auth = Depends(verify_api_key)
):
    """
    Scans the system and returns the Mermaid diagram and metadata.
    """
    docker_data = scan_docker()
    network_data = scan_network()

    filters = {
        "exclude_networks": exclude_networks,
        "exclude_stopped": exclude_stopped,
        "hide_internal_ports": hide_internal_ports,
        "hide_loopback": hide_loopback,
        "hide_veth": hide_veth,
        "hide_bridge": hide_bridge,
        "direction": direction
    }

    try:
        topology_data = generate_mermaid(docker_data, network_data, filters)
    except Exception as e:
        logger.exception("Error generating topology data")
        topology_data = {
            "nodes": [{"id": "error", "label": f"❌ Error generating diagram:\n{e}", "group": "stopped"}],
            "edges": [],
            "ports": []
        }

    # Extract all network names and interface names to let the frontend build filters
    all_networks = [net.get("name") for net in docker_data.get("networks", []) if net.get("name")]
    all_interfaces = [iface.get("name") for iface in network_data.get("interfaces", []) if iface.get("name")]

    return {
        "topology": topology_data,
        "docker_error": docker_data.get("error"),
        "network_error": network_data.get("error"),
        "networks": sorted(list(set(all_networks))),
        "interfaces": sorted(list(set(all_interfaces))),
        "app_title": os.getenv("APP_TITLE", "Docker Live Visualizer"),
        "api_key_required": bool(API_KEY)
    }

# Serve Static Files
# Resolve the static directory relative to this file
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir, exist_ok=True)

# Mount the static files. Note: html=True maps "/" to index.html automatically.
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
