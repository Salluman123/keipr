"""
Resize App Store screenshots to Apple's exact required sizes for each
display-size upload slot in App Store Connect.

Reads every image from screenshhots/new screeens/ (the raw App Store
screenshots), resizes each to fill the target dimensions without distortion
(scale to cover, then center-crop any overflow — never stretches), and
writes the result into a per-size subfolder of appstore_screenshots_final/,
under the same filename.

Usage:
    python resize_appstore_screenshots.py
"""

from pathlib import Path
from PIL import Image

# name -> (width, height). Add/remove entries here as needed for whichever
# App Store Connect upload slots you're filling.
TARGETS = {
    "6.7in_1290x2796": (1290, 2796),  # iPhone 15/16 Pro Max
    "6.5in_1284x2778": (1284, 2778),  # iPhone 6.5" slot (also accepts 1242x2688)
}

ROOT = Path(__file__).resolve().parent
SRC_DIR = ROOT / "screenshhots" / "new screeens"
DST_ROOT = ROOT / "appstore_screenshots_final"

VALID_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}


def resize_cover_crop(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Scale `img` to fully cover target_w x target_h (preserving aspect
    ratio), then center-crop the overflow. Never stretches/distorts."""
    src_w, src_h = img.size
    src_ratio = src_w / src_h
    target_ratio = target_w / target_h

    if src_ratio > target_ratio:
        # Source is relatively wider than target -> match heights, crop width.
        new_h = target_h
        new_w = round(new_h * src_ratio)
    else:
        # Source is relatively taller (or equal) -> match widths, crop height.
        new_w = target_w
        new_h = round(new_w / src_ratio)

    resized = img.resize((new_w, new_h), Image.LANCZOS)

    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def main() -> None:
    if not SRC_DIR.is_dir():
        raise SystemExit(f"Source folder not found: {SRC_DIR}")

    files = sorted(
        p for p in SRC_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in VALID_EXTS
    )

    if not files:
        raise SystemExit(f"No image files found in {SRC_DIR}")

    for label, (target_w, target_h) in TARGETS.items():
        dst_dir = DST_ROOT / label
        dst_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n[{label}] Resizing {len(files)} image(s) to {target_w}x{target_h}...")

        for src_path in files:
            with Image.open(src_path) as raw:
                is_jpeg = src_path.suffix.lower() in {".jpg", ".jpeg"}
                # Normalize mode up front: RGB for formats with no alpha
                # channel, RGBA otherwise (covers P/LA/palette images too).
                img = raw.convert("RGB") if is_jpeg else raw.convert("RGBA")

                out = resize_cover_crop(img, target_w, target_h)

                dst_path = dst_dir / src_path.name
                save_kwargs = {"quality": 95} if is_jpeg else {}
                out.save(dst_path, **save_kwargs)

                print(f"  {src_path.name}: {img.size} -> {out.size}  ({dst_path})")

    print("\nDone.")


if __name__ == "__main__":
    main()
