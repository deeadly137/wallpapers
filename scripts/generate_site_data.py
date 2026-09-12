"""Generates docs/data.json for the website from the contents of Wallpapers/.

Run it after adding, renaming or removing wallpapers and commit the result.
The website reads this file to build its sidebar, search and gallery.
"""

import json
import re
import subprocess
from colorsys import rgb_to_hsv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WALLPAPERS = ROOT / "Wallpapers"
OUT = ROOT / "docs" / "data.json"
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}


def im(*args):
    """Run ImageMagick (IMv7 prefers magick, IM6 only ships convert/identify)."""
    error = None
    for binary in ("magick", "convert"):
        try:
            result = subprocess.run([binary, *args], capture_output=True, text=True)
        except FileNotFoundError:
            continue
        if result.returncode == 0:
            return result.stdout
        error = result.stderr.strip()
    raise RuntimeError(f"ImageMagick is not available or failed: {error}")


def dimensions(path):
    w, h = im(str(path), "-format", "%w %h", "info:").split()
    return int(w), int(h)


def average_color(path):
    """Average color as (r, g, b), from a 1x1 resize done by ImageMagick."""
    out = im(str(path), "-resize", "1x1!", "-alpha", "off", "txt:-")
    match = re.search(r"#([0-9A-Fa-f]{6})", out)
    if not match:
        raise RuntimeError(f"could not read the average color of {path}")
    hexpart = match.group(1)
    return tuple(int(hexpart[i : i + 2], 16) for i in (0, 2, 4))


def video_dimensions(path):
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    w, h = out.strip().split(",")[:2]
    return int(w), int(h)


def video_average_color(path):
    """Average color of the first frame as (r, g, b)."""
    out = subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-loglevel",
            "error",
            "-i",
            str(path),
            "-frames:v",
            "1",
            "-vf",
            "scale=1:1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ],
        capture_output=True,
        check=True,
    ).stdout
    if len(out) < 3:
        raise RuntimeError(f"could not read the average color of {path}")
    return out[0], out[1], out[2]


def tags_for(name, categories, w, h, animated=False):
    tags = set()
    for part in categories:
        tags.update(part.lower().replace("/", " ").split())
    tags.update(name.lower().split("-"))
    tags.add("landscape" if w > h else "portrait")
    if animated:
        tags.update(("animated", "video"))
    if w >= 3840 or h >= 2160:
        tags.add("4k")
    elif w >= 2560 or h >= 1440:
        tags.add("1440p")
    elif w >= 1920 or h >= 1080:
        tags.add("1080p")
    return sorted(tags)


def main():
    media = []
    for path in sorted(WALLPAPERS.rglob("*")):
        ext = path.suffix.lower()
        if path.is_file() and ext in VIDEO_EXTENSIONS:
            animated = True
        elif path.is_file() and ext in EXTENSIONS:
            animated = False
        else:
            continue
        rel = path.relative_to(ROOT)
        categories = path.parent.relative_to(WALLPAPERS).parts
        w, h = video_dimensions(path) if animated else dimensions(path)
        r, g, b = video_average_color(path) if animated else average_color(path)
        hue, _, _ = rgb_to_hsv(r / 255, g / 255, b / 255)
        media.append(
            {
                "path": rel.as_posix(),
                "name": path.stem,
                "category": list(categories),
                "w": w,
                "h": h,
                "bytes": path.stat().st_size,
                "color": f"#{r:02x}{g:02x}{b:02x}",
                "hue": round(hue * 360),
                "light": round((0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.55),
                "animated": animated,
                "tags": tags_for(path.stem, categories, w, h, animated),
            }
        )

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"images": media}, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} with {len(media)} wallpapers")


if __name__ == "__main__":
    main()
