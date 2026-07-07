import docker
import subprocess
import json
import logging
import os

logger = logging.getLogger("docker-visualizer.scanner")

def scan_docker():
    """
    Scans the local Docker daemon for containers and networks.
    """
    try:
        # Use docker.from_env() which reads DOCKER_HOST or defaults to local unix socket
        client = docker.from_env(timeout=5)
        client.ping()
    except Exception as e:
        logger.error(f"Failed to connect to Docker daemon: {e}")
        return {
            "error": f"Docker connection failed: {e}",
            "containers": [],
            "networks": []
        }

    try:
        containers_data = []
        containers = client.containers.list(all=True)
        for c in containers:
            try:
                c.reload()
                attrs = c.attrs
                
                # Get networks this container is connected to
                net_settings = attrs.get('NetworkSettings', {})
                networks = list(net_settings.get('Networks', {}).keys())
                
                # Get port mappings
                raw_ports = net_settings.get('Ports', {}) or {}
                ports = []
                for container_port, host_bindings in raw_ports.items():
                    if host_bindings:
                        for binding in host_bindings:
                            ports.append({
                                "container_port": container_port,
                                "host_port": binding.get("HostPort"),
                                "host_ip": binding.get("HostIp")
                            })
                    else:
                        # Exposed but not mapped
                        ports.append({
                            "container_port": container_port,
                            "host_port": None,
                            "host_ip": None
                        })
                
                containers_data.append({
                    "id": c.id,
                    "short_id": c.short_id,
                    "name": c.name,
                    "status": c.status,  # running, exited, paused, etc.
                    "image": c.image.tags[0] if c.image.tags else (attrs.get('Config', {}).get('Image', 'unknown')),
                    "networks": networks,
                    "ports": ports
                })
            except Exception as ce:
                logger.warning(f"Error reading container {c.name}: {ce}")

        networks_data = []
        networks = client.networks.list()
        for net in networks:
            try:
                net.reload()
                attrs = net.attrs
                
                # Get connected containers
                connected_containers = []
                containers_dict = attrs.get('Containers', {}) or {}
                for c_id, c_info in containers_dict.items():
                    connected_containers.append({
                        "id": c_id,
                        "name": c_info.get("Name"),
                        "ipv4": c_info.get("IPv4Address", "").split("/")[0],
                        "ipv6": c_info.get("IPv6Address", "").split("/")[0]
                    })
                
                # Get subnets
                ipam_configs = attrs.get('IPAM', {}).get('Config', []) or []
                subnets = [cfg.get('Subnet') for cfg in ipam_configs if cfg.get('Subnet')]
                
                networks_data.append({
                    "id": net.id,
                    "name": net.name,
                    "driver": attrs.get('Driver'),
                    "subnets": subnets,
                    "containers": connected_containers
                })
            except Exception as ne:
                logger.warning(f"Error reading network {net.name}: {ne}")

        return {
            "error": None,
            "containers": containers_data,
            "networks": networks_data
        }
    except Exception as e:
        logger.error(f"Failed to scan Docker: {e}")
        return {
            "error": str(e),
            "containers": [],
            "networks": []
        }

def scan_network():
    """
    Scans network interfaces on the host.
    Uses 'ip -j addr show' if available. Falls back to /sys/class/net.
    """
    interfaces = []
    
    # Try 'ip -j addr show' (requires iproute2, standard on most Linux)
    try:
        result = subprocess.run(['ip', '-j', 'addr', 'show'], capture_output=True, text=True, timeout=2)
        if result.returncode == 0:
            ip_data = json.loads(result.stdout)
            for item in ip_data:
                name = item.get('ifname')
                state = item.get('operstate', 'UNKNOWN')
                
                # Categorize interface type
                name_lower = name.lower()
                if name_lower.startswith('wg'):
                    iface_type = 'wireguard'
                elif name_lower.startswith('tailscale') or name_lower.startswith('ts'):
                    iface_type = 'tailscale'
                elif name_lower.startswith('docker') or name_lower.startswith('br-') or name_lower.startswith('docker_gwbridge'):
                    iface_type = 'docker-bridge'
                elif name_lower.startswith('veth'):
                    iface_type = 'veth'
                elif name_lower == 'lo':
                    iface_type = 'loopback'
                elif name_lower.startswith('eth') or name_lower.startswith('en') or name_lower.startswith('wl'):
                    iface_type = 'physical'
                else:
                    iface_type = 'other'
                
                # Extract IPs
                addresses = []
                for addr_info in item.get('addr_info', []):
                    ip = addr_info.get('local')
                    prefix = addr_info.get('prefixlen')
                    if ip:
                        addresses.append(f"{ip}/{prefix}" if prefix else ip)
                
                interfaces.append({
                    "name": name,
                    "state": state,
                    "type": iface_type,
                    "addresses": addresses
                })
            return {"interfaces": interfaces, "error": None}
    except Exception as e:
        logger.warning(f"Could not run 'ip -j addr show' (falling back to sysfs): {e}")

    # Fallback: Read /sys/class/net
    try:
        if os.path.exists('/sys/class/net'):
            for name in os.listdir('/sys/class/net'):
                state_path = f'/sys/class/net/{name}/operstate'
                state = 'UNKNOWN'
                if os.path.exists(state_path):
                    with open(state_path, 'r') as f:
                        state = f.read().strip().upper()
                
                name_lower = name.lower()
                if name_lower.startswith('wg'):
                    iface_type = 'wireguard'
                elif name_lower.startswith('tailscale') or name_lower.startswith('ts'):
                    iface_type = 'tailscale'
                elif name_lower.startswith('docker') or name_lower.startswith('br-'):
                    iface_type = 'docker-bridge'
                elif name_lower.startswith('veth'):
                    iface_type = 'veth'
                elif name_lower == 'lo':
                    iface_type = 'loopback'
                elif name_lower.startswith('eth') or name_lower.startswith('en') or name_lower.startswith('wl'):
                    iface_type = 'physical'
                else:
                    iface_type = 'other'
                
                interfaces.append({
                    "name": name,
                    "state": state,
                    "type": iface_type,
                    "addresses": []  # sysfs doesn't easily provide IPs without heavy parsing
                })
            return {"interfaces": interfaces, "error": None}
    except Exception as e:
        logger.error(f"Failed to scan network interfaces: {e}")
        
    return {"interfaces": [], "error": "Failed to retrieve network interfaces"}
