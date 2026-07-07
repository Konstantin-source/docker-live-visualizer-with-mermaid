# 🐳 Docker Live Visualizer mit Mermaid.js

Eine extrem leichtgewichtige, einteilige Webanwendung (FastAPI Backend + HTML5/JS/CSS Frontend), die deine lokale Docker-Infrastruktur und die Netzwerkinterfaces des Hosts scannt und live als strukturiertes, interaktives Mermaid.js-Diagramm visualisiert.

Das Projekt ist für den direkten Einsatz mit **Docker Compose** und **Portainer** optimiert.

---

## ✨ Features

- **Live-Infrastruktur-Diagramm:** Visualisiert Container, Docker-Netzwerke, Host-Netzwerke (Bridge, Physical, VPN) und Port-Mappings.
- **Auto-Refresh:** Automatische Updates im einstellbaren Intervall (5s bis 60s) mit manuellem Refresh-Trigger.
- **Umfangreiche Filter:** 
  - Netzwerke dynamisch ein- und ausblenden.
  - Gestoppte Container ausblenden.
  - Interne (nicht gemappte) Container-Ports ausblenden.
  - Loopback- (`lo`), veth- und Docker-Bridge-Interfaces filtern.
- **Layout-Richtung:** Dynamische Umschaltung zwischen Top-Down (TD) und Left-Right (LR).
- **Interaktiver Viewport:** Zoom und Pan (Verschieben) des Diagramms per Mausrad/Ziehen.
- **Code-Ansicht:** Rohen Mermaid.js-Code mit einem Klick in die Zwischenablage kopieren.
- **Sicherheit:** Läuft standardmäßig im Read-Only-Modus für den Docker-Socket. Optionaler API-Key-Schutz integriert.

---

## 🚀 Quick Start (Docker Compose)

### 1. Repository klonen oder Dateien kopieren
Klone dieses Repository auf deinen Host:
```bash
git clone https://github.com/<dein-username>/docker-live-visualizer-with-mermaid.git
cd docker-live-visualizer-with-mermaid
```

### 2. Umgebungsvariablen einrichten
Erstelle eine private `.env`-Datei aus der Vorlage:
```bash
cp .env.example .env
```
Passe die Werte in der `.env` nach Bedarf an (z. B. den Port oder den API-Schutz). Die `.env` wird durch `.gitignore` automatisch von Git ausgeschlossen.

### 3. Anwendung starten
Starte den Container über Docker Compose:
```bash
docker compose up -d --build
```
Die Anwendung ist nun unter `http://<host-ip>:9100` (oder deinem konfigurierten Port) erreichbar.

---

## 🛠️ Konfiguration (`.env`)

Folgende Variablen können konfiguriert werden:

| Variable | Standardwert | Beschreibung |
|---|---|---|
| `APP_PORT` | `9100` | Der Port auf dem Host, unter dem das Web-UI erreichbar ist. |
| `APP_TITLE` | `Docker Live Visualizer` | Der Titel, der oben im Web-Interface angezeigt wird. |
| `API_KEY` | *(leer)* | Wenn gesetzt, müssen alle API-Aufrufe mit dem Token autorisiert werden (Eingabe im UI). |
| `LOG_LEVEL` | `info` | Logging-Tiefe für den FastAPI-Server (`debug`, `info`, `warning`, `error`). |

---

## 🚢 Portainer-Deployment (Stack)

Du kannst diese App direkt in Portainer als **Stack** deployen.

1. Gehe in Portainer zu **Stacks** -> **Add stack**.
2. Wähle **Repository** oder füge den Inhalt der `docker-compose.yml` ein.
3. Füge die Umgebungsvariablen (siehe Tabelle oben) im Bereich **Environment variables** hinzu.
4. Klicke auf **Deploy the stack**.

> [!NOTE]
> Da der Stack im `network_mode: host` läuft, ist er sofort auf dem konfigurierten Port deines Servers erreichbar.

---

## 🔒 Sicherheitshinweise

### 1. Docker-Socket (Read-Only)
Die App benötigt Zugriff auf `/var/run/docker.sock`, um die Container-Daten abzufragen. Um die Sicherheit zu maximieren, wird der Socket als **read-only (`ro`)** eingebunden:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```
Dadurch kann die App keine Container erstellen, löschen oder manipulieren.

### 2. Host-Netzwerkmodus
Die App läuft im `network_mode: host`. Dies ist notwendig, damit das Backend die realen Netzwerkinterfaces des Linux-Systems (wie `eth0`, `wg0` für Wireguard oder `tailscale0`) sehen und auslesen kann.
* Der Port wird direkt an die Host-Interfaces gebunden.
* Stelle sicher, dass der Port `9100` (oder dein Custom-Port) in deiner Firewall freigegeben bzw. abgesichert ist.

### 3. API-Key Schutz
Wenn du den Visualizer über das Internet erreichbar machst, setze unbedingt einen sicheren `API_KEY` in deiner `.env`. Die App fordert den Client beim Laden automatisch auf, diesen Key einzugeben. Für maximale Sicherheit empfiehlt sich ein Reverse-Proxy (z.B. Traefik, Nginx Proxy Manager) mit zusätzlicher Authentifizierung.

---

## 📄 Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert.
