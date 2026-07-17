# Tycho Cybersecurity Lab Guide (DevSecOps)

This document details the architecture and security design decisions for the local pentest lab **DevSecOps Lab** integrated into Tycho.

## 🏗️ Architecture & Services

The lab is designed to verify container image security and provide a deliberately vulnerable target for application security training (SecOps/Pentesting). It consists of two orchestrated services:

1. **`trivy-scanner`** (Image: `aquasec/trivy:latest`):
   - Static and dynamic vulnerability analyzer.
   - Runs as an ephemeral job before target startup.
   - Scans the `bkimminich/juice-shop:latest` image pulled from the remote registry and writes a comprehensive report to `./reports/trivy-report.txt`.
   
2. **`juiceshop`** (Image: `bkimminich/juice-shop:latest`):
   - OWASP Juice Shop, a modern web application full of security vulnerabilities (XSS, SQL injections, broken authentication, etc.).
   - Starts only after the Trivy scan completes successfully.

---

## 🛠️ Environment Preparation (`pre-install.sh`)

To function properly in strict **Rootless mode** (without root privileges), a pre-install hook script runs on the host before starting the containers:

1. **Directory Creation**: It initializes `./data/juiceshop` (for target persistence) and `./reports` (for storing the Trivy report).
2. **Rootless Permission Translation via `podman unshare`**:
   In a rootless environment, the host user executing the command is not root. To allow the container running under internal UID `1000` to write to mounted volumes without permission errors, the script uses:
   ```bash
   podman unshare chown -R 1000:1000 ./data/juiceshop ./reports
   ```
   This command changes the ownership of the host directories to the virtual UID `1000` mapping within Podman's user namespace.

---

## 🛡️ Implemented Hardening & Security Choices

Since the lab hosts a deliberately vulnerable application, strict containment measures are implemented to protect the host machine:

### A. Strict Network Isolation
Juice Shop's port `3000` is not exposed to all network interfaces on the host. It is bound exclusively to the local loopback interface:
```yaml
ports:
  - "127.0.0.1:3000:3000"
```
This ensures the vulnerable application is only accessible from the host loopback (`localhost`), preventing scanning or exploitation from other machines on the network.

### B. No Docker Socket Exposure
Trivy scans the image directly by pulling it from the remote registry. The Podman/Docker socket (`/var/run/docker.sock`) **is never mounted** inside the Trivy container. This eliminates any risk of container escape or host control by a compromised container.

### C. Kernel Capability Dropping
Juice Shop runs with all Linux kernel capabilities dropped:
```yaml
cap_drop:
  - ALL
```
Even if an attacker gains remote code execution or spawns a shell inside the container, they will have no privileges to perform system-level tasks (e.g., modifying network interfaces, mounting file systems).

### D. Privilege Escalation Prevention
Both services share the following security configuration:
```yaml
user: "1000:1000"
security_opt:
  - no-new-privileges:true
```
- **`user: "1000:1000"`**: Forces container processes to run as a non-privileged user.
- **`no-new-privileges:true`**: Prevents container processes from acquiring new privileges dynamically (e.g., via `setuid` or `setgid` executables).

### E. SELinux Compatibility
Volumes are mounted using the `:Z` suffix (e.g., `./reports:/reports:Z`). This instructs Podman to automatically relabel the shared host directory with the correct SELinux security context (essential on Fedora/RedHat/CentOS).

---

## 🚀 Usage

To deploy the cybersecurity lab with Tycho, run:

```bash
tycho install devsecops-lab
```

Once the deployment completes:
1. The Trivy scan report will be available on the host at `./reports/trivy-report.txt`.
2. The OWASP Juice Shop web interface will be accessible locally at: [http://127.0.0.1:3000](http://127.0.0.1:3000).
