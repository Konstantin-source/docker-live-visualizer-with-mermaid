import re
import logging

logger = logging.getLogger("docker-visualizer.diagram")

def sanitize_id(name):
    """
    Sanitizes a string to be a safe Mermaid node ID.
    """
    # Replace non-alphanumeric characters with underscores
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    # Avoid starting with a number (Mermaid IDs should start with a letter/underscore)
    if sanitized and sanitized[0].isdigit():
        sanitized = f"node_{sanitized}"
    # Reserved words in Mermaid
    reserved = {"end", "graph", "flowchart", "subgraph", "direction", "classdef", "class", "style"}
    if sanitized.lower() in reserved:
        sanitized = f"node_{sanitized}"
    return sanitized

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

def get_iface_emoji(iface_type):
    if iface_type == "wireguard":
        return "🔒"
    elif iface_type == "tailscale":
        return "🛡️"
    elif iface_type == "physical":
        return "🌐"
    elif iface_type == "loopback":
        return "🔄"
    elif iface_type == "docker-bridge":
        return "🐳"
    else:
        return "🔌"

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

def generate_mermaid(docker_data, network_data, filters=None):
    """
    Generates a valid Mermaid.js flowchart string from Docker and network data.
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
    direction = filters.get("direction") or "TD"

    if direction not in ["TD", "LR", "BT", "RL"]:
        direction = "TD"

    lines = []
    lines.append(f"flowchart {direction}")
    lines.append("")

    # Class Definitions for styling with subtle container fills (using hex alpha to avoid comma-split parser errors)
    lines.append("    classDef running fill:#10b9810d,stroke:#10b981,stroke-width:2px,color:#f8fafc;")
    lines.append("    classDef stopped fill:#ef44440d,stroke:#ef4444,stroke-width:2px,color:#94a3b8;")
    lines.append("    classDef paused fill:#f59e0b0d,stroke:#f59e0b,stroke-width:2px,color:#f8fafc;")
    lines.append("    classDef physical fill:#0f172a,stroke:#3b82f6,stroke-width:2px,color:#f8fafc;")
    lines.append("    classDef vpn fill:#0f172a,stroke:#8b5cf6,stroke-width:2px,color:#f8fafc;")
    lines.append("    classDef hostport fill:#1e293b,stroke:#e2e8f0,stroke-dasharray: 5 5,stroke-width:2px,color:#f8fafc;")
    lines.append("    classDef nethub fill:#111827,stroke:#06b6d4,stroke-width:2px,color:#f8fafc;")
    
    # Subtle pastel category fills for running containers (using hex alpha)
    lines.append("    classDef db fill:#a855f70f,stroke:#a855f7,stroke-width:2px,color:#f8fafc;")
    lines.append("    classDef web fill:#0ea5e90f,stroke:#0ea5e9,stroke-width:2px,color:#f8fafc;")
    lines.append("    classDef tool fill:#eab3080f,stroke:#eab308,stroke-width:2px,color:#f8fafc;")
    lines.append("    classDef app fill:#ec48990f,stroke:#ec4899,stroke-width:2px,color:#f8fafc;")
    lines.append("")

    # Track defined container nodes to prevent double definition
    # container_id -> node_id
    defined_containers = {}
    
    # Filter and collect containers
    active_containers = []
    for c in docker_data.get("containers", []):
        if exclude_stopped and c.get("status") != "running":
            continue
        active_containers.append(c)

    # 1. Host/Edge Subgraph
    lines.append("    subgraph HOST[\"🖥️ Host / Edge\"]")
    lines.append("        direction TB")
    
    # Filter interfaces
    active_interfaces = []
    for iface in network_data.get("interfaces", []):
        iface_type = iface.get("type")
        iface_name = iface.get("name")
        
        if hide_loopback and iface_type == "loopback":
            continue
        if hide_veth and iface_type == "veth":
            continue
        if hide_bridge and iface_type == "docker-bridge":
            continue
            
        active_interfaces.append(iface)

    # Write interfaces to Host subgraph
    iface_nodes = {}
    for iface in active_interfaces:
        name = iface.get("name")
        iface_type = iface.get("type")
        state = iface.get("state")
        addrs = iface.get("addresses", [])
        
        node_id = sanitize_id(f"iface_{name}")
        iface_nodes[name] = node_id
        
        emoji = get_iface_emoji(iface_type)
        addrs_str = "<br/>".join(addrs) if addrs else "No IP"
        
        lines.append(f"        {node_id}[\"{emoji} {name}<br/>{addrs_str} ({state})\"]")
        
        # Apply styling class
        if iface_type in ["wireguard", "tailscale"]:
            lines.append(f"        class {node_id} vpn;")
        else:
            lines.append(f"        class {node_id} physical;")
            
    # Collect mapped host ports
    mapped_ports = []
    for c in active_containers:
        c_node_id = sanitize_id(f"container_{c.get('name')}")
        for p in c.get("ports", []):
            host_port = p.get("host_port")
            if host_port:
                mapped_ports.append({
                    "host_port": host_port,
                    "host_ip": p.get("host_ip", "0.0.0.0"),
                    "container_port": p.get("container_port"),
                    "container_node_id": c_node_id,
                    "container_name": c.get("name")
                })

    # Deduplicate host ports by port number
    unique_host_ports = {}
    for p in mapped_ports:
        port = p["host_port"]
        if port not in unique_host_ports:
            unique_host_ports[port] = []
        unique_host_ports[port].append(p)

    # Write port nodes to Host subgraph
    port_nodes = {}
    for port, bindings in unique_host_ports.items():
        port_node_id = sanitize_id(f"port_{port}")
        port_nodes[port] = port_node_id
        
        # Display all bindings if multiple
        ips = list(set([b["host_ip"] for b in bindings]))
        ips_str = ", ".join(ips)
        
        lines.append(f"        {port_node_id}[\"🔌 Port :{port}<br/>({ips_str})\"]")
        lines.append(f"        class {port_node_id} hostport;")
        
        # Connect host interfaces to this port if exposed
        for iface in active_interfaces:
            iface_name = iface.get("name")
            iface_node_id = iface_nodes.get(iface_name)
            
            # Simple heuristic: if bound to 0.0.0.0 or [::], connect to all physical/vpn interfaces
            # If bound to a specific IP, connect only if interface has that IP
            is_exposed_on_iface = False
            for ip_binding in ips:
                if ip_binding in ["0.0.0.0", "::", "[::]"]:
                    is_exposed_on_iface = True
                else:
                    # Check if interface addresses contain this IP
                    for addr in iface.get("addresses", []):
                        if ip_binding in addr:
                            is_exposed_on_iface = True
            
            if is_exposed_on_iface and iface_node_id:
                lines.append(f"        {iface_node_id} -.-> {port_node_id}")

    lines.append("    end")
    lines.append("")

    # 2. Docker Networks Subgraphs
    # Track which networks are empty or excluded
    active_networks = []
    for net in docker_data.get("networks", []):
        net_name = net.get("name")
        if net_name in exclude_networks:
            continue
        active_networks.append(net)

    # Create network subgraphs
    network_hub_nodes = {}
    for net in active_networks:
        net_name = net.get("name")
        driver = net.get("driver", "unknown")
        subnets = net.get("subnets", [])
        net_node_id = sanitize_id(f"net_{net_name}")
        
        lines.append(f"    subgraph SUB_{net_node_id}[\"🐳 Network: {net_name} ({driver})\"]")
        lines.append("        direction TB")
        
        # Create a hub/gateway node for the network
        hub_id = f"hub_{net_node_id}"
        network_hub_nodes[net_name] = hub_id
        subnets_str = ", ".join(subnets) if subnets else "No Subnet"
        
        lines.append(f"        {hub_id}(\"🌐 {net_name}<br/>{subnets_str}\")")
        lines.append(f"        class {hub_id} nethub;")
        
        # Add containers that belong to this network and aren't defined yet
        # A container is "owned" by the first network subgraph it is listed in
        for c in active_containers:
            if net_name in c.get("networks", []):
                c_name = c.get("name")
                c_node_id = sanitize_id(f"container_{c_name}")
                
                if c_name not in defined_containers:
                    status = c.get("status", "unknown")
                    status_emoji = get_status_emoji(status)
                    image = c.get("image", "unknown")
                    # Shorten image name if it's too long
                    if len(image) > 30:
                        image = image[:27] + "..."
                        
                    lines.append(f"        {c_node_id}[\"📦 {c_name}<br/>{status_emoji} {status}<br/><sub>{image}</sub>\"]")
                    
                    # Apply styling class
                    c_class = classify_container(c_name, image, status)
                    lines.append(f"        class {c_node_id} {c_class};")
                        
                    defined_containers[c_name] = c_node_id
                
                # Connect container to network hub within the subgraph
                lines.append(f"        {c_node_id} --- {hub_id}")
                
        lines.append("    end")
        lines.append("")

    # Handle containers that were not placed in any active network subgraph
    # (either they have no networks, or all their networks were excluded)
    standalone_containers = [c for c in active_containers if c.get("name") not in defined_containers]
    if standalone_containers:
        lines.append("    subgraph SUB_standalone[\"📦 Standalone Containers\"]")
        lines.append("        direction TB")
        for c in standalone_containers:
            c_name = c.get("name")
            c_node_id = sanitize_id(f"container_{c_name}")
            status = c.get("status", "unknown")
            status_emoji = get_status_emoji(status)
            image = c.get("image", "unknown")
            if len(image) > 30:
                image = image[:27] + "..."
                
            lines.append(f"        {c_node_id}[\"📦 {c_name}<br/>{status_emoji} {status}<br/><sub>{image}</sub>\"]")
            c_class = classify_container(c_name, image, status)
            lines.append(f"        class {c_node_id} {c_class};")
            defined_containers[c_name] = c_node_id
        lines.append("    end")
        lines.append("")

    # 3. Connections between Networks and Containers (for multi-homed containers)
    # If container is connected to networks other than its "owner" network, draw links
    for c in active_containers:
        c_name = c.get("name")
        c_node_id = defined_containers.get(c_name)
        if not c_node_id:
            continue
            
        c_nets = c.get("networks", [])
        if len(c_nets) > 1:
            # We already connected to the first one inside the subgraph.
            # Connect to other networks' hubs
            for net_name in c_nets[1:]:
                hub_id = network_hub_nodes.get(net_name)
                # Only connect if the network wasn't excluded
                if hub_id:
                    lines.append(f"    {c_node_id} --- {hub_id}")

    # 4. Connections between Host Ports and Containers (Port Mappings)
    for port, bindings in unique_host_ports.items():
        port_node_id = port_nodes.get(port)
        if not port_node_id:
            continue
            
        for binding in bindings:
            c_name = binding["container_name"]
            c_node_id = defined_containers.get(c_name)
            c_port = binding["container_port"]
            
            if c_node_id:
                lines.append(f"    {port_node_id} -->|\"{c_port}\"| {c_node_id}")

    # 5. Internal Exposed Ports (if not hidden)
    if not hide_internal_ports:
        for c in active_containers:
            c_name = c.get("name")
            c_node_id = defined_containers.get(c_name)
            if not c_node_id:
                continue
                
            for p in c.get("ports", []):
                host_port = p.get("host_port")
                container_port = p.get("container_port")
                # If it's exposed but not mapped to a host port
                if container_port and not host_port:
                    # Create an internal port node near the container
                    port_clean = container_port.replace("/", "_")
                    internal_port_id = sanitize_id(f"int_{c_name}_{port_clean}")
                    lines.append(f"    {internal_port_id}[\"🔒 Exposed: {container_port}\"]")
                    lines.append(f"    {c_node_id} --- {internal_port_id}")

    return "\n".join(lines)
