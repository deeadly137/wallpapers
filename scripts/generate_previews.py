"""Regenerates the preview.md pages and Preview/list.md from the contents of Wallpapers/.

Run it after adding, renaming or removing wallpapers and commit the result.
CI runs this on every pull request and fails if the pages are out of date,
and regenerates them automatically on main.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WALLPAPERS = ROOT / "Wallpapers"
INDEX = ROOT / "Preview" / "list.md"
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}

DISPLAY_NAMES = {
    "Gray-White": "Gray / White",
    "Red-Orange": "Red / Orange",
}


def display_name(directory):
    return DISPLAY_NAMES.get(directory.name, directory.name)


def encode(name):
    """Encode spaces for markdown links, keep everything else as is."""
    return name.replace(" ", "%20")


def media_in(directory):
    exts = EXTENSIONS | VIDEO_EXTENSIONS
    return sorted(
        (p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in exts),
        key=lambda p: p.name.lower(),
    )


def subdirectories_of(directory):
    return sorted(
        (p for p in directory.iterdir() if p.is_dir()), key=lambda p: p.name.lower()
    )


def existing_header(directory):
    """Keep the title and description already in place, if any."""
    preview = directory / "preview.md"
    if not preview.exists():
        return None
    lines = preview.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        if line.startswith("|") or line.startswith("- "):
            return "\n".join(lines[:i]).rstrip()
    return "\n".join(lines).rstrip() or None


def default_header(directory, has_children):
    name = display_name(directory)
    if directory == WALLPAPERS:
        title, description = (
            "Wallpapers",
            "A curated collection of wallpapers organized by category.",
        )
    elif name == "Desktop":
        title, description = "Desktop", "Wallpapers organized by color theme."
    elif name == "Distro":
        title, description = "Distro", "Wallpapers organized by Linux distribution."
    elif name == "Mobile":
        title, description = "Mobile", "A collection of mobile wallpapers."
    elif name == "Animated":
        title, description = (
            "Animated",
            "Video wallpapers (mp4/webm) that loop as your desktop background.",
        )
    elif has_children:
        title, description = name, f"Wallpapers organized by {name.lower()}."
    else:
        title, description = name, f"A collection of {name} themed desktop wallpapers."
    return f"# {title}\n\n{description}"


def table_for(directory):
    lines = ["| Preview | File |", "| --- | --- |"]
    for file in media_in(directory):
        name = file.stem
        if file.suffix.lower() in VIDEO_EXTENSIONS:
            lines.append(
                f"| *animated wallpaper* | [{file.name}]({encode(file.name)}) |"
            )
        else:
            lines.append(
                f'| <img src="{file.name}" alt="{name}" width="500"> '
                f"| [{file.name}]({encode(file.name)}) |"
            )
    return "\n".join(lines)


def links_for(directory):
    return "\n".join(
        f"- [{display_name(child)}]({encode(child.name)}/preview.md)"
        for child in subdirectories_of(directory)
    )


def write_preview(directory):
    has_children = bool(subdirectories_of(directory))
    header = existing_header(directory) or default_header(directory, has_children)
    body = links_for(directory) if has_children else table_for(directory)
    (directory / "preview.md").write_text(f"{header}\n\n{body}\n", encoding="utf-8")


def write_index():
    lines = [
        "# Preview List",
        "",
        "Full preview index of all wallpaper categories in this repository.",
        "",
    ]

    def entry(directory, depth):
        children = subdirectories_of(directory)
        link = (
            f"../Wallpapers/{directory.relative_to(WALLPAPERS).as_posix()}/preview.md"
        )
        label = f"[{display_name(directory)}]({encode(link)})"
        if children:
            label = f"**{label}**"
        result = ["  " * depth + f"- {label}"]
        for child in children:
            result.extend(entry(child, depth + 1))
        return result

    for child in subdirectories_of(WALLPAPERS):
        lines.extend(entry(child, 0))
    INDEX.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    count = 0
    for directory in [WALLPAPERS, *WALLPAPERS.rglob("*")]:
        if not directory.is_dir():
            continue
        if not media_in(directory) and not subdirectories_of(directory):
            continue
        write_preview(directory)
        count += 1
    write_index()
    print(f"regenerated {count} preview pages and {INDEX.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
