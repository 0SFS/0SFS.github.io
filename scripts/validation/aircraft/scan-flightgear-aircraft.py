#!/usr/bin/env python3
"""Inventory the FlightGear aircraft catalogue for aircraft 0sfs could adopt.

For every package and variant in an FGAddon catalogue this records which flight
model the aircraft uses, what its JSBSim files depend on, how heavy its 3D
model is, how much Nasal it carries and what its licence files say. It reads
each package zip with HTTP range requests - the central directory and a handful
of small XML members - so a full run moves a few hundred megabytes rather than
the tens of gigabytes the zips add up to.

With --extract-fdm it also writes each JSBSim aircraft's own files (the aero
file, and everything reachable from it through `file=` attributes) to
`fdm/<variant-id>/`, laid out for smoke-test-flightgear-fdm.mjs beside this file.

    python3 scripts/validation/aircraft/scan-flightgear-aircraft.py --extract-fdm

Output goes to a new dated folder under build/fg-aircraft-inventory/ unless
--out is given, the same convention as scripts/outputDirectory.mjs.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import io
import json
import posixpath
import re
import sys
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CATALOG = "https://mirrors.ibiblio.org/flightgear/ftp/Aircraft-trunk/catalog.xml"
BLOCK = 128 * 1024
USER_AGENT = "0sfs-aircraft-inventory/1 (+https://github.com/Felipegalind0/0sfs)"

MODEL_EXT = {".ac", ".obj", ".3ds", ".osg", ".osgt", ".osgb", ".ive", ".gltf", ".glb"}
TEXTURE_EXT = {".png", ".jpg", ".jpeg", ".rgb", ".rgba", ".sgi", ".dds", ".ktx", ".ktx2", ".bmp", ".tga"}
SOUND_EXT = {".wav", ".ogg", ".mp3", ".flac"}
LICENCE_NAMES = re.compile(r"^(copying|licen[cs]e|readme|copyright|authors|credits)([._-].*)?(\.(txt|md|html?))?$", re.I)
ENGINE_TAGS = {"piston_engine", "turbine_engine", "turboprop_engine", "rocket_engine", "electric_engine"}
# A leading slash in a JSBSim property path reaches outside the FDM's own tree.
# Inside FlightGear that is the global tree Nasal and the instruments write to;
# standalone JSBSim has nothing writing there, so each one is an input that
# will sit at zero unless 0sfs drives it.
# JSBSim allows a sign in front of a property, "-/orientation/pitch-deg".
ABSOLUTE_PROPERTY = re.compile(r"(?<![\w./])-?(/(?:[a-z][\w\-]*)(?:\[\d+\])?(?:/[\w\-]+(?:\[\d+\])?)+)")


def default_output() -> Path:
    stamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    parent = ROOT / "build" / "fg-aircraft-inventory"
    parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, 1000):
        directory = parent / (stamp if attempt == 1 else f"{stamp}-{attempt}")
        try:
            directory.mkdir()
            return directory
        except FileExistsError:
            continue
    raise RuntimeError("no free output directory")


def fetch(url: str, byte_range: tuple[int, int] | None = None) -> tuple[bytes, dict]:
    headers = {"User-Agent": USER_AGENT}
    if byte_range:
        headers["Range"] = f"bytes={byte_range[0]}-{byte_range[1]}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response:
                return response.read(), dict(response.headers)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise AssertionError


class RangeFile(io.RawIOBase):
    """A read-only, seekable view of a remote file, fetched in cached blocks."""

    def __init__(self, url: str):
        self.url = url
        self.position = 0
        self.blocks: dict[int, bytes] = {}
        self.bytes_fetched = 0
        first, headers = fetch(url, (0, 0))
        content_range = headers.get("Content-Range") or headers.get("content-range")
        if not content_range:
            raise IOError(f"{url} did not honour a range request")
        self.size = int(content_range.rsplit("/", 1)[1])
        self.bytes_fetched += len(first)

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self.position, io.SEEK_END: self.size}[whence]
        self.position = max(0, base + offset)
        return self.position

    def _block(self, index: int) -> bytes:
        if index not in self.blocks:
            start = index * BLOCK
            data, _ = fetch(self.url, (start, min(self.size, start + BLOCK) - 1))
            self.blocks[index] = data
            self.bytes_fetched += len(data)
        return self.blocks[index]

    def read(self, size=-1):
        if size is None or size < 0:
            size = self.size - self.position
        size = min(size, self.size - self.position)
        out = bytearray()
        while size > 0:
            index, offset = divmod(self.position, BLOCK)
            chunk = self._block(index)[offset:offset + size]
            if not chunk:
                break
            out += chunk
            self.position += len(chunk)
            size -= len(chunk)
        return bytes(out)

    def readinto(self, buffer):
        data = self.read(len(buffer))
        buffer[:len(data)] = data
        return len(data)


def parse_xml(data: bytes) -> ET.Element | None:
    try:
        return ET.fromstring(data)
    except ET.ParseError:
        # FlightGear's reader tolerates things ElementTree does not, most often
        # a stray byte-order mark or an undeclared entity. Try once more lightly.
        try:
            text = data.decode("utf-8", "replace").lstrip("﻿")
            text = re.sub(r"&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)", "&amp;", text)
            return ET.fromstring(text.encode("utf-8"))
        except ET.ParseError:
            return None


class Package:
    """One aircraft zip: its member list and a case-insensitive path lookup."""

    def __init__(self, url: str, directory: str):
        self.remote = RangeFile(url)
        self.zip = zipfile.ZipFile(self.remote)
        self.directory = directory
        self.members = {info.filename: info for info in self.zip.infolist() if not info.is_dir()}
        self.lower = {name.lower(): name for name in self.members}
        prefixes = {name.split("/", 1)[0] for name in self.members if "/" in name}
        self.prefix = (directory + "/") if directory in prefixes else (next(iter(prefixes)) + "/" if len(prefixes) == 1 else "")

    def find(self, relative: str) -> str | None:
        """Resolve a path relative to the aircraft directory, ignoring case like Windows authors do."""
        relative = posixpath.normpath(relative.replace("\\", "/")).lstrip("/")
        if relative.startswith("Aircraft/"):
            parts = relative.split("/", 2)
            relative = parts[2] if len(parts) == 3 and parts[1].lower() == self.directory.lower() else relative
        name = (self.prefix + relative).lower()
        return self.lower.get(name)

    def read(self, name: str) -> bytes:
        return self.zip.read(name)

    def relative(self, name: str) -> str:
        return name[len(self.prefix):] if name.startswith(self.prefix) else name


def text_of(element: ET.Element | None, path: str) -> str | None:
    if element is None:
        return None
    found = element.find(path)
    return found.text.strip() if found is not None and found.text and found.text.strip() else None


def load_set_file(package: Package, variant_id: str) -> tuple[dict, list[str]]:
    """Read <id>-set.xml and whatever it pulls in through include= attributes."""
    problems: list[str] = []
    name = package.find(f"{variant_id}-set.xml")
    if not name:
        return {}, [f"no {variant_id}-set.xml in package"]
    merged: dict[str, str] = {}
    seen: set[str] = set()

    def walk(member: str, depth: int):
        if member in seen or depth > 8:
            return
        seen.add(member)
        root = parse_xml(package.read(member))
        if root is None:
            problems.append(f"unparseable {package.relative(member)}")
            return
        # The including file's own values win over what it includes, so read
        # them first; merged keeps the first value it is given for each key.
        sim = root.find("sim") if root.tag == "PropertyList" else (root if root.tag == "sim" else None)
        if sim is not None:
            read_sim(sim)
        base = posixpath.dirname(package.relative(member))
        for element in root.iter():
            include = element.get("include")
            if include:
                target = package.find(posixpath.join(base, include)) or package.find(include)
                if target:
                    walk(target, depth + 1)

    def read_sim(sim: ET.Element):
        for key, path in [
            ("flight_model", "flight-model"), ("aero", "aero"), ("model_path", "model/path"),
            ("status", "status"), ("description", "description"), ("author", "author"),
            ("aircraft_version", "aircraft-version"), ("minimum_fg_version", "minimum-fg-version"),
            ("variant_of", "variant-of"), ("license", "license"),
        ]:
            value = text_of(sim, path)
            if value and key not in merged:
                merged[key] = value
        rating = sim.find("rating")
        if rating is not None and "rating" not in merged:
            merged["rating"] = {child.tag: (child.text or "").strip() for child in rating}

    walk(name, 0)
    return merged, problems


def jsbsim_closure(package: Package, aero: str) -> tuple[dict[str, bytes], list[str]]:
    """The aero file and every file it reaches through file= attributes."""
    problems: list[str] = []
    start = package.find(f"{aero}.xml")
    if not start:
        return {}, [f"aero file {aero}.xml not found"]
    files: dict[str, bytes] = {}
    queue = [start]
    while queue:
        member = queue.pop()
        relative = package.relative(member)
        if relative in files:
            continue
        data = package.read(member)
        files[relative] = data
        root = parse_xml(data)
        if root is None:
            problems.append(f"unparseable {relative}")
            continue
        for element in root.iter():
            reference = element.get("file")
            if not reference:
                continue
            candidates = [reference, reference + ".xml"]
            if element.tag in ("engine", "thruster"):
                candidates = [f"Engines/{reference}.xml", f"Engines/{reference}", *candidates]
            else:
                candidates += [f"Systems/{reference}.xml", f"Systems/{reference}"]
            target = next((found for c in candidates if (found := package.find(c))), None)
            if target:
                queue.append(target)
            else:
                problems.append(f"{element.tag} file={reference} not in package")
    return files, problems


def describe_jsbsim(files: dict[str, bytes], aero: str) -> dict:
    main = parse_xml(next(data for name, data in files.items() if name.lower() == f"{aero}.xml".lower()))
    info: dict = {"files": len(files), "bytes": sum(len(d) for d in files.values())}
    if main is None:
        return info
    header = main.find("fileheader")
    if header is not None:
        info["header_author"] = text_of(header, "author")
        licence = header.find("license")
        if licence is not None:
            info["header_licence"] = licence.get("licenseName") or (licence.text or "").strip() or None
        copyright_text = " ".join((e.text or "") for e in header.iter())
        info["header_not_for_sale"] = bool(re.search(r"not (to be )?(sold|for sale)", copyright_text, re.I))
    metrics = main.find("metrics")
    if metrics is not None:
        span = metrics.find("wingspan")
        if span is not None and span.text:
            try:
                value = float(span.text)
                unit = span.get("unit", "FT").upper()
                info["wingspan_m"] = round(value * (0.3048 if unit == "FT" else 1 if unit == "M" else 0.0254 if unit == "IN" else 0.3048), 2)
            except ValueError:
                pass
    engines = main.findall("propulsion/engine")
    info["engine_count"] = len(engines)
    kinds = []
    for engine in engines:
        reference = engine.get("file") or ""
        kind = "unknown"
        for name, data in files.items():
            stem = posixpath.splitext(posixpath.basename(name))[0]
            if stem == reference:
                root = parse_xml(data)
                if root is not None and root.tag in ENGINE_TAGS:
                    kind = root.tag.replace("_engine", "")
                    break
        kinds.append(kind)
    info["engine_types"] = sorted(set(kinds))
    thrusters = []
    for engine in engines:
        thruster = engine.find("thruster")
        if thruster is not None:
            for name, data in files.items():
                if posixpath.splitext(posixpath.basename(name))[0] == thruster.get("file"):
                    root = parse_xml(data)
                    if root is not None:
                        thrusters.append(root.tag)
                    break
    info["thruster_types"] = sorted(set(thrusters))
    contacts = main.findall("ground_reactions/contact")
    bogeys = [c for c in contacts if c.get("type", "BOGEY").upper() == "BOGEY"]
    info["gear_bogeys"] = len(bogeys)
    info["gear_retractable"] = any((text_of(c, "retractable") or "0") not in ("0", "") for c in bogeys)
    info["structure_contacts"] = len(contacts) - len(bogeys)
    info["systems"] = len(main.findall("system"))
    absolute: set[str] = set()
    for data in files.values():
        root = parse_xml(data)
        if root is None:
            continue
        for element in root.iter():
            for value in [element.text or "", *element.attrib.values()]:
                for match in ABSOLUTE_PROPERTY.findall(value):
                    if not match.startswith(("/fdm/jsbsim/",)):
                        absolute.add(match)
    info["external_properties"] = sorted(absolute)
    return info


def licence_findings(text: str) -> list[str]:
    """What a piece of text says about licensing, if anything."""
    summary = []
    if re.search(r"GNU GENERAL PUBLIC LICENSE\s+Version 2", text, re.I):
        summary.append("GPL-2.0 text")
    if re.search(r"GNU GENERAL PUBLIC LICENSE\s+Version 3", text, re.I):
        summary.append("GPL-3.0 text")
    if re.search(r"version 2 of the License, or\s*\(at your option\) any later", text, re.I) and "GPL-2.0 text" not in summary:
        summary.append("GPL-2.0-or-later notice")
    if re.search(r"creative\s*commons|CC[- ]BY", text, re.I):
        summary.append("Creative Commons mention")
    # GPLv2's own text says "noncommercial distribution" in section 3c, so
    # the licence text itself is not evidence of a non-commercial term.
    licence_text = any(finding.endswith(" text") for finding in summary)
    if not licence_text and re.search(r"CC[- ]BY[- ]NC|non[- ]?commercial", text, re.I):
        summary.append("non-commercial mention")
    if not licence_text and re.search(r"not (to be )?(sold|for sale)|no commercial use", text, re.I):
        summary.append("not-for-sale mention")
    if re.search(r"public domain", text, re.I):
        summary.append("public-domain mention")
    if not summary and re.search(r"all rights reserved", text, re.I):
        summary.append("all-rights-reserved mention")
    if not summary and re.search(r"\bGPL\b|General Public Licen[cs]e", text, re.I):
        summary.append("GPL named without its text")
    return summary


def licence_evidence(package: Package) -> list[dict]:
    """Licence-looking files, at the package root first and then anywhere.

    "No licence file at the root" is not "no licence": FlightGear aircraft put
    the statement in a COPYING beside the aircraft, in a subdirectory, in a
    file header, or nowhere at all, and only the last is a real gap. The scan
    keeps where it found each statement so the difference stays visible.
    """
    evidence = []
    candidates = sorted(package.members, key=lambda name: package.relative(name).count("/"))
    for name in candidates:
        relative = package.relative(name)
        if not LICENCE_NAMES.match(posixpath.basename(relative)):
            continue
        if package.members[name].file_size > 400_000 or len(evidence) >= 12:
            continue
        findings = licence_findings(package.read(name)[:12000].decode("utf-8", "replace"))
        evidence.append({"file": relative, "root": "/" not in relative, "findings": findings})
    if any(entry["findings"] for entry in evidence):
        return evidence
    # Nothing said so far: try the headers of the files the aircraft is made of.
    for name in candidates:
        relative = package.relative(name)
        if len(evidence) >= 16 or not relative.lower().endswith((".nas", ".xml")):
            continue
        if package.members[name].file_size > 400_000:
            continue
        findings = licence_findings(package.read(name)[:4000].decode("utf-8", "replace"))
        if findings:
            evidence.append({"file": relative, "root": "/" not in relative, "findings": findings, "header": True})
    return evidence


def scan_package(entry: dict, base_url: str, extract_dir: Path | None) -> list[dict]:
    url = base_url + entry["url"]
    records = []
    try:
        package = Package(url, entry["dir"])
    except Exception as error:  # noqa: BLE001 - recorded, not fatal
        return [{**entry, "variant_id": entry["id"], "error": f"open: {error}"}]
    members = package.members
    def total(extensions):
        return sum(info.file_size for name, info in members.items() if posixpath.splitext(name)[1].lower() in extensions)
    def count(extensions):
        return sum(1 for name in members if posixpath.splitext(name)[1].lower() in extensions)
    stats = {
        "zip_bytes": package.remote.size,
        "members": len(members),
        "model_files": count(MODEL_EXT),
        "model_bytes": total(MODEL_EXT),
        "texture_bytes": total(TEXTURE_EXT),
        "sound_files": count(SOUND_EXT),
        "nasal_files": count({".nas"}),
        "nasal_bytes": total({".nas"}),
        "licence_files": licence_evidence(package),
    }
    for variant in entry["variants"]:
        record = {**{k: v for k, v in entry.items() if k != "variants"}, **variant, **stats}
        record["variant_id"] = variant["variant_id"]
        try:
            set_info, problems = load_set_file(package, variant["variant_id"])
            record.update(set_info)
            record["problems"] = problems
            if (set_info.get("flight_model") or "").lower() == "jsb":
                aero = set_info.get("aero") or variant["variant_id"]
                files, closure_problems = jsbsim_closure(package, aero)
                record["problems"] += closure_problems
                if files:
                    record["jsbsim"] = describe_jsbsim(files, aero)
                    record["jsbsim"]["aero"] = aero
                    if extract_dir:
                        target = extract_dir / variant["variant_id"]
                        for relative, data in files.items():
                            path = target / "aircraft" / aero / relative
                            path.parent.mkdir(parents=True, exist_ok=True)
                            path.write_bytes(data)
                        (target / "source.json").write_text(json.dumps({
                            "package": entry["id"], "variant": variant["variant_id"], "aero": aero,
                            "zip": url, "revision": entry.get("revision"), "md5": entry.get("md5"),
                            "files": sorted(files),
                        }, indent=2))
        except Exception as error:  # noqa: BLE001
            record["error"] = f"{type(error).__name__}: {error}"
        records.append(record)
    records[0]["bytes_fetched"] = package.remote.bytes_fetched
    return records


def read_catalog(data: bytes) -> tuple[str, list[dict]]:
    root = ET.fromstring(data)
    base = text_of(root, "base-url") or root.find("base-url").get("text")
    entries = []
    for package in root.findall("package"):
        def rating(element):
            r = element.find("rating")
            return {child.tag: int(child.text) for child in r} if r is not None else None
        entry = {
            "id": text_of(package, "id"), "dir": text_of(package, "dir"), "url": text_of(package, "url"),
            "name": text_of(package, "name"), "catalog_status": text_of(package, "status"),
            "catalog_author": text_of(package, "author"), "revision": text_of(package, "revision"),
            "md5": text_of(package, "md5"), "catalog_rating": rating(package),
            "tags": [t.text for t in package.findall("tag")],
        }
        variants = [{"variant_id": entry["id"], "variant_name": entry["name"], "variant_rating": entry["catalog_rating"]}]
        for variant in package.findall("variant"):
            variants.append({
                "variant_id": text_of(variant, "id"), "variant_name": text_of(variant, "name"),
                "variant_rating": rating(variant) or entry["catalog_rating"],
            })
        entry["variants"] = variants
        entries.append(entry)
    return base, entries


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--catalog", default=DEFAULT_CATALOG)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--jobs", type=int, default=8)
    parser.add_argument("--only", nargs="*", help="package ids to scan (default: all)")
    parser.add_argument("--extract-fdm", action="store_true", help="write each JSBSim aircraft's files to fdm/")
    args = parser.parse_args()

    out = args.out or default_output()
    out.mkdir(parents=True, exist_ok=True)
    catalog_bytes, _ = fetch(args.catalog)
    (out / "catalog.xml").write_bytes(catalog_bytes)
    base, entries = read_catalog(catalog_bytes)
    if args.only:
        entries = [e for e in entries if e["id"] in set(args.only)]
    extract_dir = out / "fdm" if args.extract_fdm else None

    records: list[dict] = []
    lock = threading.Lock()
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = {pool.submit(scan_package, entry, base, extract_dir): entry for entry in entries}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            with lock:
                records.extend(result)
                done += 1
                if done % 25 == 0 or done == len(entries):
                    print(f"{done}/{len(entries)} packages", file=sys.stderr, flush=True)
    records.sort(key=lambda r: (r["id"] or "", r["variant_id"] or ""))
    (out / "inventory.json").write_text(json.dumps({
        "catalog": args.catalog, "scanned": datetime.datetime.now().isoformat(timespec="seconds"),
        "packages": len(entries), "records": records,
    }, indent=1))
    fetched = sum(r.get("bytes_fetched", 0) for r in records)
    print(f"{len(records)} variants from {len(entries)} packages, {fetched / 1e6:.0f} MB fetched -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
