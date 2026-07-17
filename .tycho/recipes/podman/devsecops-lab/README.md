# DevSecOps Pentest Lab Tycho Recipe

Local pentest lab containing OWASP Juice Shop as the target, preceded by Trivy vulnerability scan.

## Deployment Details

- **Trivy Scanner**: Ephemeral scan on `bkimminich/juice-shop:latest` with output report stored in `./reports/trivy-report.txt`.
- **OWASP Juice Shop**: Voluntarily vulnerable target exposed only to local loopback.
- **Access URL**: `http://127.0.0.1:3000`

## How to Install

Run the following command via the Tycho CLI:

```bash
tycho install devsecops-lab
```
