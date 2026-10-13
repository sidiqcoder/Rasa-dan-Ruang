"""Render SVG diagram lokal menjadi PNG untuk Word (tooling opsional)."""
from pathlib import Path
import math
import re
from xml.etree import ElementTree as ET

import pymupdf

root = Path(__file__).resolve().parents[1]
directory = root / "docs" / "diagrams"
namespace = "{http://www.w3.org/2000/svg}"


def compatible_svg(filename):
    """MuPDF mengabaikan marker/dash SVG; ubah ke garis/poligon eksplisit."""
    tree = ET.parse(filename)
    parent_map = {child: parent for parent in tree.iter() for child in parent}
    marker_fill = {}
    for marker in tree.iter(namespace + "marker"):
        shape = next(iter(marker), None)
        marker_fill[marker.get("id")] = shape.get("fill", "none") if shape is not None else "none"

    for element in list(tree.iter()):
        if element.tag not in (namespace + "line", namespace + "path"):
            continue
        marker = element.attrib.pop("marker-end", None)
        endpoint = previous = None
        if element.tag == namespace + "line":
            x1, y1, x2, y2 = (float(element.get(k)) for k in ("x1", "y1", "x2", "y2"))
            endpoint, previous = (x2, y2), (x1, y1)
            pattern = element.attrib.pop("stroke-dasharray", None)
            if pattern:
                dash, gap = map(float, pattern.split())
                length = math.hypot(x2 - x1, y2 - y1)
                group = ET.Element(namespace + "g")
                offset = 0.0
                while offset < length:
                    start, end = offset / length, min(offset + dash, length) / length
                    attrs = dict(element.attrib)
                    attrs.update(x1=str(x1 + (x2 - x1) * start), y1=str(y1 + (y2 - y1) * start), x2=str(x1 + (x2 - x1) * end), y2=str(y1 + (y2 - y1) * end))
                    ET.SubElement(group, namespace + "line", attrs)
                    offset += dash + gap
                parent = parent_map[element]
                index = list(parent).index(element)
                parent.remove(element)
                parent.insert(index, group)
        elif marker:
            # Self-call path generator: M x y H end V lower_y H x.
            numbers = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", element.get("d", ""))]
            if len(numbers) == 5:
                endpoint, previous = (numbers[4], numbers[3]), (numbers[2], numbers[3])

        if marker and endpoint and previous:
            dx, dy = endpoint[0] - previous[0], endpoint[1] - previous[1]
            length = math.hypot(dx, dy)
            if not length:
                continue
            ux, uy = dx / length, dy / length
            ex, ey = endpoint
            left = (ex - 10 * ux - 5 * uy, ey - 10 * uy + 5 * ux)
            right = (ex - 10 * ux + 5 * uy, ey - 10 * uy - 5 * ux)
            marker_name = marker.removeprefix("url(#").removesuffix(")")
            fill = marker_fill.get(marker_name, "none")
            ET.SubElement(tree.getroot(), namespace + ("polyline" if fill == "none" else "polygon"), {
                "points": f"{left[0]},{left[1]} {ex},{ey} {right[0]},{right[1]}",
                "fill": "none" if fill == "none" else element.get("stroke", "#244A3B"),
                "stroke": element.get("stroke", "#244A3B"), "stroke-width": "2",
            })
    return ET.tostring(tree.getroot(), encoding="utf-8")


for filename in sorted(directory.rglob("*.svg")):
    with pymupdf.open(stream=compatible_svg(filename), filetype="svg") as document:
        pixmap = document[0].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
        pixmap.save(filename.with_suffix(".png"))
    print(filename.relative_to(root))
