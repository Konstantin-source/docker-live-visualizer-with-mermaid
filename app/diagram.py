import re
import logging

logger = logging.getLogger("docker-visualizer.diagram")

def classify_container(name, image, status):
    if status == "paused":
        return "paused"
    elif status != "running":
        return "stopped"
        
    n_lower = name.lower()
    i_lower = image.lower()
    
    # DB/Cache/Storage
    if any(k in n_lower or k in i_lower for k in ["db", "database", "redis", "postgres", "mysql", "mongo", "mariadb", "influx", "elastic", "sqlite", "neo4j", "cassandra"]):
        return "db"
    # Web/Proxy/Gateway
    elif any(k in n_lower or k in i_lower for k in ["nginx", "traefik", "caddy", "proxy", "gateway", "apache", "ingress", "envoy", "kong"]):
        return "web"
    # Tools/Monitoring/Dashboards
    elif any(k in n_lower or k in i_lower for k in ["monitor", "prometheus", "grafana", "log", "agent", "visualizer", "dashboard", "portainer", "netdata"]):
        return "tool"
    # App servers / API / Frontend
    elif any(k in n_lower or k in i_lower for k in ["app", "api", "backend", "frontend", "server", "web-app", "service"]):
        return "app"
    else:
        return "running"

def get_status_emoji(status):
    status = status.lower()
    if status == "running":
        return "🟢"
    elif status == "paused":
        return "🟡"
    elif status == "exited":
        return "🔴"
    elif status == "created":
        return "🆕"
    else:
        return "⚪"

def generate_mermaid(docker_data, network_data, filters=None):
    """
    NOTE: We keep the function name 'generate_mermaid' to avoid changing imports in main.py, 
    but it now returns a JSON-compatible dictionary containing nodes and edges for Vis.js!
    """
    if filters is None:
        filters = {}

    exclude_networks = filters.get("exclude_networks") or []
    if isinstance(exclude_networks, str):
        exclude_networks = [n.strip() for n in exclude_networks.split(",") if n.strip()]
        
    exclude_stopped = filters.get("exclude_stopped") is True
    hide_internal_ports = filters.get("hide_internal_ports") is True
    hide_loopback = filters.get("hide_loopback") is not False
    hide_veth = filters.get("hide_veth") is not False
    hide_bridge = filters.get("hide_bridge") is not False

    nodes = []
    edges = []
    
    # Keep track of active/defined container names to link edges correctly
    defined_containers = set()
    
    # 1. Gather Container Nodes
    active_containers = []
    for c in docker_data.get("containers", []):
        c_name = c.get("name")
        status = c.get("status", "unknown")
        
        if exclude_stopped and status != "running":
            continue
            
        active_containers.append(c)
        defined_containers.add(c_name)
        
        # Build detailed hover HTML tooltip
        ports_str = ""
        for p in c.get("ports", []):
            h_port = p.get("host_port")
            c_port = p.get("container_port")
            if h_port:
                ports_str += f"<br>• Host Port :{h_port} ➔ Container {c_port}"
            elif c_port:
                ports_str += f"<br>• Exposed Container Port {c_port}"
        if not ports_str:
            ports_str = "None"

        tooltip = f"""
        <div style="font-family: sans-serif; padding: 4px;">
            <b style="font-size:14px; color:#f8fafc;">📦 {c_name}</b><br>
            <hr style="border:0; border-top:1px solid #374151; margin:4px 0;">
            <b>Status:</b> {get_status_emoji(status)} {status}<br>
            <b>Image:</b> {c.get('image', 'unknown')}<br>
            <b>Networks:</b> {', '.join(c.get('networks', [])) or 'none'}<br>
            <b>Mapped Ports:</b> {ports_str}
        </div>
        """
        
        group = classify_container(c_name, c.get("image", ""), status)
        
        nodes.append({
            "id": f"container_{c_name}",
            "label": f"📦 {c_name}\n{get_status_emoji(status)} {status}",
            "title": tooltip,
            "group": group
        })

    # 2. Gather Docker Network Hub Nodes
    active_networks = []
    network_hub_ids = {}
    
    for net in docker_data.get("networks", []):
        net_name = net.get("name")
        driver = net.get("driver", "unknown")
        subnets = net.get("subnets", [])
        
        if net_name in exclude_networks:
            continue
            
        active_networks.append(net)
        net_id = f"net_{net_name}"
        network_hub_ids[net_name] = net_id
        
        subnets_str = ", ".join(subnets) if subnets else "No Subnet"
        
        tooltip = f"""
        <div style="font-family: sans-serif; padding: 4px;">
            <b style="font-size:14px; color:#06b6d4;">🐳 Network: {net_name}</b><br>
            <hr style="border:0; border-top:1px solid #374151; margin:4px 0;">
            <b>Driver:</b> {driver}<br>
            <b>Subnet/Gateway:</b> {subnets_str}
        </div>
        """
        
        nodes.append({
            "id": net_id,
            "label": f"🌐 {net_name}\n({driver})",
            "title": tooltip,
            "group": "network"
        })
        
        # Connect containers to this network
        # Find containers listed as connected inside network attributes
        for conn_c in net.get("containers", []):
            c_name = conn_c.get("name")
            c_ip = conn_c.get("ipv4", "")
            
            if c_name in defined_containers:
                edges.append({
                    "from": f"container_{c_name}",
                    "to": net_id,
                    "label": c_ip,
                    "font": {"align": "middle", "size": 10, "color": "#94a3b8", "strokeWidth": 0, "background": "#0b0f19"},
                    "color": {"color": "#334155", "highlight": "#06b6d4"}
                })

    # 3. Gather Host Interface Nodes
    active_interfaces = []
    iface_nodes = {}
    
    for iface in network_data.get("interfaces", []):
        name = iface.get("name")
        iface_type = iface.get("type")
        state = iface.get("state")
        addrs = iface.get("addresses", [])
        
        if hide_loopback and iface_type == "loopback":
            continue
        if hide_veth and iface_type == "veth":
            continue
        if hide_bridge and iface_type == "docker-bridge":
            continue
            
        active_interfaces.append(iface)
        node_id = f"iface_{name}"
        iface_nodes[name] = node_id
        
        ips_str = "<br>".join([f"• {a}" for a in addrs]) if addrs else "No IP"
        tooltip = f"""
        <div style="font-family: sans-serif; padding: 4px;">
            <b style="font-size:14px; color:#3b82f6;">🌐 Interface: {name}</b><br>
            <hr style="border:0; border-top:1px solid #374151; margin:4px 0;">
            <b>Type:</b> {iface_type}<br>
            <b>State:</b> {state}<br>
            <b>IP Addresses:</b><br>{ips_str}
        </div>
        """
        
        group = "vpn" if iface_type in ["wireguard", "tailscale"] else "physical"
        
        nodes.append({
            "id": node_id,
            "label": f"🌐 {name}\n({state})",
            "title": tooltip,
            "group": group
        })

    # 4. Gather Host Port Nodes
    # Collect mapped host ports
    mapped_ports = []
    for c in active_containers:
        c_name = c.get("name")
        for p in c.get("ports", []):
            host_port = p.get("host_port")
            if host_port:
                mapped_ports.append({
                    "host_port": host_port,
                    "host_ip": p.get("host_ip", "0.0.0.0"),
                    "container_port": p.get("container_port"),
                    "container_name": c_name
                })

    # Group mapped ports by port number
    unique_host_ports = {}
    for p in mapped_ports:
        port = p["host_port"]
        if port not in unique_host_ports:
            unique_host_ports[port] = []
        unique_host_ports[port].append(p)

    # Write port nodes and connect to interfaces
    for port, bindings in unique_host_ports.items():
        port_node_id = f"port_{port}"
        ips = list(set([b["host_ip"] for b in bindings]))
        ips_str = ", ".join(ips)
        
        tooltip = f"""
        <div style="font-family: sans-serif; padding: 4px;">
            <b style="font-size:14px; color:#e2e8f0;">🔌 Host Port: {port}</b><br>
            <hr style="border:0; border-top:1px solid #374151; margin:4px 0;">
            <b>IP Binding:</b> {ips_str}
        </div>
        """
        
        nodes.append({
            "id": port_node_id,
            "label": f"🔌 :{port}",
            "title": tooltip,
            "group": "hostport"
        })
        
        # Connect host interfaces to this port if exposed
        for iface in active_interfaces:
            iface_name = iface.get("name")
            iface_node_id = iface_nodes.get(iface_name)
            
            is_exposed_on_iface = False
            for ip_binding in ips:
                if ip_binding in ["0.0.0.0", "::", "[::]"]:
                    is_exposed_on_iface = True
                else:
                    for addr in iface.get("addresses", []):
                        if ip_binding in addr:
                            is_exposed_on_iface = True
                            
            if is_exposed_on_iface and iface_node_id:
                edges.append({
                    "from": iface_node_id,
                    "to": port_node_id,
                    "dashes": True,
                    "color": {"color": "#475569", "highlight": "#3b82f6"},
                    "arrows": {"to": {"enabled": False}}
                })
                
        # Connect port node to containers
        for binding in bindings:
            c_name = binding["container_name"]
            c_port = binding["container_port"]
            
            if c_name in defined_containers:
                edges.append({
                    "from": port_node_id,
                    "to": f"container_{c_name}",
                    "label": c_port,
                    "font": {"align": "top", "size": 11, "color": "#cbd5e1", "strokeWidth": 0, "background": "#0b0f19"},
                    "color": {"color": "#64748b", "highlight": "#6366f1"},
                    "arrows": {"to": {"enabled": True, "scaleFactor": 0.8}}
                })

    return {
        "nodes": nodes,
        "edges": edges
    }
