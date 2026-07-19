"""One-shot: green-screen Master Ball asset -> transparent logo + favicons."""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import remove

ASSETS = Path(
    r"C:\Users\eddu1\.cursor\projects\c-Users-eddu1-Documents-Code-master-ball\assets"
)
OUT = Path(__file__).resolve().parents[1] / "public"


def main() -> None:
    src = ASSETS / "masterball-logo-greenscreen.png"
    if not src.exists():
        src = ASSETS / "masterball-logo.png"
    im = Image.open(io.BytesIO(remove(src.read_bytes()))).convert("RGBA")
    a = np.array(im, copy=True)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    m = (al >= 230) & ~((g.astype(int) > np.maximum(r, b).astype(int) + 8) & (g > 50))
    for _ in range(10):
        p = np.pad(m, 1, constant_values=False)
        m = (
            p[:-2, 1:-1]
            & p[2:, 1:-1]
            & p[1:-1, :-2]
            & p[1:-1, 2:]
            & p[:-2, :-2]
            & p[:-2, 2:]
            & p[2:, :-2]
            & p[2:, 2:]
        )
    a[~m] = 0
    a[:, :, 3] = np.where(m, 255, 0)
    out = Image.fromarray(a)
    ys, xs = np.where(m)
    pad = 8
    box = (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(out.width, int(xs.max()) + pad + 1),
        min(out.height, int(ys.max()) + pad + 1),
    )
    cropped = out.crop(box)
    side = max(cropped.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(cropped, ((side - cropped.size[0]) // 2, (side - cropped.size[1]) // 2))
    for size, rel in (
        (512, "images/masterball-logo.png"),
        (192, "favicon-192.png"),
        (32, "favicon-32.png"),
    ):
        t = np.array(square.resize((size, size), Image.Resampling.NEAREST), copy=True)
        t[t[:, :, 3] == 0, :3] = 0
        t[:, :, 3] = np.where(t[:, :, 3] > 0, 255, 0)
        Image.fromarray(t).save(OUT / rel)
        print("wrote", rel)


if __name__ == "__main__":
    main()
