# Ollama

Run large language models locally.

## Credits
- **Original Project**: [Ollama](https://github.com/ollama/ollama)
- **Contributors**: The Ollama team and community.

## Configuration & Usage
This recipe deploys Ollama as a core container service accessible internally and routed via Traefik.

### GPU Acceleration (Optional but recommended)
By default, the service runs in **CPU-only** mode to ensure compatibility across all environments. If you have an NVIDIA GPU and `nvidia-container-toolkit` is configured on your system, you can enable GPU acceleration by modifying the `compose.yaml` to include a `deploy` section:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

## License
- Original project license: **MIT**
- Recipe license: **AGPL-3.0** (part of Tycho)
