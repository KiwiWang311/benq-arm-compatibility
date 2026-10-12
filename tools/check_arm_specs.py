#!/usr/bin/env python3
"""Check that the arm specs written into index.html match BenQArmSpec.csv.

The spec table and the JSON-LD block in index.html are static copies of the
CSV (so crawlers that skip JavaScript can read them). Run this after editing
the CSV:

    python3 tools/check_arm_specs.py

Exits non-zero and lists every mismatch if the three sources disagree.
"""

import csv
import json
import re
import sys
from html.parser import HTMLParser
from itertools import zip_longest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "js" / "data" / "BenQArmSpec.csv"
HTML_PATH = ROOT / "index.html"


def num(value):
    f = float(value)
    return int(f) if f.is_integer() else f


def load_groups():
    """Collapse colour variants into one entry per product_group."""
    groups = {}
    with CSV_PATH.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            key = row["product_group"] or row["arm_id"]
            group = groups.setdefault(key, {"ids": [], "lead": row})
            group["ids"].append(row["arm_id"])
            if row["is_group_primary"].strip().upper() == "TRUE":
                group["lead"] = row
    return groups


class SpecTableParser(HTMLParser):
    """Collects the rows of the static spec table (class BNQARM01-table)."""

    def __init__(self):
        super().__init__()
        self.in_table = False
        self.in_tbody = False
        self.cell = None
        self.row = None
        self.rows = []

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get("class") or ""
        if tag == "table" and "BNQARM01-table" in cls.split():
            self.in_table = True
        elif self.in_table and tag == "tbody":
            self.in_tbody = True
        elif self.in_tbody and tag == "tr":
            self.row = []
        elif self.row is not None and tag in ("th", "td"):
            self.cell = ""

    def handle_endtag(self, tag):
        if self.cell is not None and tag in ("th", "td"):
            self.row.append(" ".join(self.cell.split()))
            self.cell = None
        elif self.row is not None and tag == "tr":
            self.rows.append(self.row)
            self.row = None
        elif self.in_tbody and tag == "tbody":
            self.in_tbody = False
        elif self.in_table and tag == "table":
            self.in_table = False

    def handle_data(self, data):
        if self.cell is not None:
            self.cell += data


def expected_row(group):
    lead = group["lead"]
    suffix = " (每螢幕)" if lead["limits_per_display"].strip().upper() == "TRUE" else ""
    arm_type = {"single": "單螢幕", "dual": "雙螢幕"}.get(lead["arm_type"], lead["arm_type"])
    vesa = " / ".join(v.strip() for v in lead["vesa_supported"].split(";") if v.strip())
    return [
        "、".join(group["ids"]),
        f"{num(lead['size_min_inch'])} - {num(lead['size_max_inch'])} 吋{suffix}",
        f"{num(lead['weight_min_kg'])} - {num(lead['weight_max_kg'])} Kg{suffix}",
        vesa,
        arm_type,
    ]


def jsonld_nodes(html):
    match = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    if not match:
        return None
    return json.loads(match.group(1))["@graph"]


def check_jsonld(groups, nodes, errors):
    by_group = {}
    for node in nodes:
        if node["@type"] == "ProductGroup":
            by_group[node["productGroupID"]] = node
        elif node["@type"] == "Product" and "sku" in node:
            by_group[node["sku"][:3]] = node

    for key, group in groups.items():
        node = by_group.get(key)
        if node is None:
            errors.append(f"JSON-LD: missing product for group {key}")
            continue
        lead = group["lead"]
        props = {p["name"]: p for p in node.get("additionalProperty", [])}
        weight = next((p for n, p in props.items() if "承重" in n), None)
        size = next((p for n, p in props.items() if "尺寸" in n), None)
        want = {
            "weight": (num(lead["weight_min_kg"]), num(lead["weight_max_kg"])),
            "size": (num(lead["size_min_inch"]), num(lead["size_max_inch"])),
        }
        got = {
            "weight": weight and (weight.get("minValue"), weight.get("maxValue")),
            "size": size and (size.get("minValue"), size.get("maxValue")),
        }
        for field in want:
            if got[field] != want[field]:
                errors.append(f"JSON-LD {key} {field}: {got[field]} != CSV {want[field]}")

        skus = (
            [v["sku"] for v in node.get("hasVariant", [])]
            if node["@type"] == "ProductGroup"
            else [node["sku"]]
        )
        if sorted(skus) != sorted(group["ids"]):
            errors.append(f"JSON-LD {key} SKUs: {skus} != CSV {group['ids']}")


def main():
    groups = load_groups()
    html = HTML_PATH.read_text(encoding="utf-8")
    errors = []

    parser = SpecTableParser()
    parser.feed(html)
    want_rows = [expected_row(g) for g in groups.values()]
    if parser.rows != want_rows:
        errors.append("Spec table rows differ from CSV:")
        for got, want in zip_longest(parser.rows, want_rows):
            if got != want:
                errors.append(f"  html: {got}\n  csv:  {want}")

    nodes = jsonld_nodes(html)
    if nodes is None:
        errors.append("JSON-LD block not found in index.html")
    else:
        check_jsonld(groups, nodes, errors)

    if errors:
        print("\n".join(errors))
        return 1
    print(f"OK: spec table and JSON-LD match {CSV_PATH.name} ({len(groups)} arm groups).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
