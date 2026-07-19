"""One-time helper: generates a VAPID key pair for Web Push (Phase 3) and
prints them ready to paste into the repo-root `.env`. Not run automatically —
regenerating these would invalidate every existing browser push subscription,
since the public key is baked into the subscription itself (see
app/tools/push.py's module docstring), so this is a deliberate, manual,
run-once action, not part of any seed/migration flow.

Run: uv run python -m scripts.generate_vapid_keys
"""

import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid01


def generate() -> tuple[str, str]:
    vapid = Vapid01()
    vapid.generate_keys()

    private_raw = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    private_key = base64.urlsafe_b64encode(private_raw).rstrip(b"=").decode()

    public_raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    public_key = base64.urlsafe_b64encode(public_raw).rstrip(b"=").decode()

    return public_key, private_key


def main() -> None:
    public_key, private_key = generate()
    print("Add these to your .env (repo root, for docker-compose.yml) or Backend/.env:\n")
    print(f"VAPID_PUBLIC_KEY={public_key}")
    print(f"VAPID_PRIVATE_KEY={private_key}")
    print(
        "\nVITE_VAPID_PUBLIC_KEY (Frontend/.env) should be set to the same public key above — "
        "the browser's pushManager.subscribe() call needs it directly, it isn't fetched from the "
        "backend on every page load."
    )


if __name__ == "__main__":
    main()
