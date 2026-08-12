"""Sync qa/BUGS_FRONT.md + qa/BUGS_BACK.md to a Trello board.

Idempotent:
- board/lists/labels created only if missing (matched by name)
- cards matched by exact title; existing cards are updated (desc + labels + list)
  so status transitions (open -> fixed) move the card between lists

Design goals:
- Single source of truth: the markdown files stay authoritative for the *content*
- Trello mirrors current state for team visibility (back + admin + qa collaborate)
- Rerun-safe: this script is meant to run on every commit that touches the .md files

Env vars (required):
  TRELLO_KEY    — the Trello API key
  TRELLO_TOKEN  — a user token with read+write scope

Env vars (optional):
  TRELLO_BOARD_NAME   default: "Skilluv - QA & Bugs Admin"
  TRELLO_BOARD_ID     shortLink to reuse an existing board (bypasses name lookup)

Flags:
  --dry-run   print the diff without touching Trello
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
import time

# Windows default is cp1252 which chokes on em-dashes and arrows in Trello
# titles/descriptions. Force UTF-8 so this script runs cleanly under both
# `python` and `py -3` on Windows without needing chcp 65001.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
from dataclasses import dataclass, field
from pathlib import Path

import requests

HERE = Path(__file__).parent

# Sources parsed for cards. Each tuple is (path, team, default_type):
#   team          — team:<x> label (backend | frontend | admin)
#   default_type  — type:<x> label (bug | implementation | other)
# Titles inside a file must be unique; Trello dedupes by title.
SOURCES = [
    (HERE / "BUGS_FRONT.md", "admin", "bug"),
    (HERE / "BUGS_BACK.md", "backend", "bug"),
    (HERE / "TODO_ADMIN.md", "admin", "implementation"),
    (HERE / "TODO_BACKEND.md", "backend", "implementation"),
]

BASE = "https://api.trello.com/1"
SLEEP = 0.2  # ~5 req/s, well under Trello's 100/10s cap

BOARD_NAME_DEFAULT = "Skilluv - QA & Bugs Admin"

# Workflow lists in display order.
LISTS = ["Backlog", "À faire", "En cours", "Review", "Fait"]

# Labels: team (color-coded), type (color-coded), priority (color-coded).
LABEL_COLORS: dict[str, str | None] = {
    # Team
    "team:backend": "blue",
    "team:frontend": "green",
    "team:admin": "orange",
    # Type
    "type:bug": "red",
    "type:implementation": "purple",
    "type:other": "black",
    # Priority
    "P0": "red",
    "P1": "orange",
    "P2": "sky",
    "P3": None,
}


# ── Parsing ────────────────────────────────────────────────────────────


@dataclass
class Card:
    """One bug/task, mirrored as a Trello card."""

    title: str
    description: str
    team: str          # backend | frontend | admin
    type: str          # bug | implementation | other
    priority: str      # P0 | P1 | P2
    status: str        # open | in_progress | fixed
    labels: list[str] = field(default_factory=list)

    def resolved_list(self) -> str:
        if self.status == "fixed":
            return "Fait"
        if self.status == "in_progress":
            return "En cours"
        return "Backlog"

    def resolved_labels(self) -> list[str]:
        return [f"team:{self.team}", f"type:{self.type}", self.priority] + self.labels


# Section header : `### [Pn] Titre` (n = 0..9 to cover P0/P1/P2/P3+ backlog levels).
ENTRY_RE = re.compile(r"^### \[(P[0-9])\]\s+(.+?)\s*$", re.MULTILINE)
STATUS_RE = re.compile(r"^\*\*Statut\s*:\*\*\s*(open|in_progress|fixed).*$", re.MULTILINE)


TYPE_RE = re.compile(r"^\*\*Type\s*:\*\*\s*(bug|implementation|other)\s*$", re.MULTILINE)


def parse_source(path: Path, team: str, default_type: str) -> list[Card]:
    """Extract cards from a BUGS_*.md / TODO_*.md file.

    Each `### [Pxx] Title` block until the next `### ` or `---` becomes a card.
    - Status defaults to `open` if no `**Statut :**` line is found.
    - Type defaults to `default_type` unless the entry has a `**Type :**` line
      (allows a single file to mix bugs + implementations if needed).
    """
    if not path.exists():
        return []

    text = path.read_text(encoding="utf-8")
    # Strip the template block so its `### [Pxx] Titre court` skeleton doesn't
    # get pushed as a card. The template lives inside a fenced code block.
    template_re = re.compile(r"## Template.*?```.*?```", re.DOTALL)
    text = template_re.sub("", text)

    matches = list(ENTRY_RE.finditer(text))
    cards: list[Card] = []
    for i, m in enumerate(matches):
        priority = m.group(1)
        title = m.group(2).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        # Stop at the next `---` (section separator) or `## ` header.
        for stopper in (r"\n---\s*\n", r"\n## "):
            cut = re.search(stopper, body)
            if cut:
                body = body[: cut.start()].strip()

        status_m = STATUS_RE.search(body)
        status = status_m.group(1) if status_m else "open"
        type_m = TYPE_RE.search(body)
        card_type = type_m.group(1) if type_m else default_type

        cards.append(
            Card(
                title=f"[{priority}] {title}",
                description=body,
                team=team,
                type=card_type,
                priority=priority,
                status=status,
            )
        )
    return cards


# ── Trello client ──────────────────────────────────────────────────────


class Trello:
    def __init__(self, key: str, token: str, dry_run: bool = False) -> None:
        self.auth = {"key": key, "token": token}
        self.dry_run = dry_run

    def _req(self, method: str, path: str, params: dict | None = None, retry: int = 3):
        p = {**self.auth, **(params or {})}
        if self.dry_run and method != "GET":
            print(f"  [dry-run] {method} {path}  {params or {}}")
            return {}
        for attempt in range(retry):
            r = requests.request(method, f"{BASE}{path}", params=p, timeout=30)
            if 200 <= r.status_code < 300:
                time.sleep(SLEEP)
                return r.json() if r.text else {}
            if r.status_code in (429, 500, 502, 503, 504) and attempt < retry - 1:
                wait = 2 ** attempt
                print(f"  ! {r.status_code}, retry in {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:200]}")
        raise RuntimeError("unreachable")

    # ── boards ─────────────────────────────────────────────────────────

    def find_board(self, name_or_short: str) -> dict | None:
        # Try by shortLink first (12-char id).
        if re.fullmatch(r"[A-Za-z0-9]{8,12}", name_or_short):
            try:
                return self._req("GET", f"/boards/{name_or_short}", {"fields": "name,id,url"})
            except RuntimeError:
                pass
        boards = self._req("GET", "/members/me/boards", {"fields": "name,id,url", "filter": "open"})
        for b in boards:
            if b["name"] == name_or_short:
                return b
        return None

    def create_board(self, name: str) -> dict:
        return self._req(
            "POST",
            "/boards",
            {"name": name, "defaultLists": "false", "prefs_permissionLevel": "org"},
        )

    # ── lists ──────────────────────────────────────────────────────────

    def ensure_lists(self, board_id: str) -> dict[str, str]:
        existing = {l["name"]: l["id"] for l in self._req("GET", f"/boards/{board_id}/lists")}
        ids: dict[str, str] = {}
        for i, name in enumerate(LISTS):
            if name in existing:
                ids[name] = existing[name]
            else:
                print(f"  + list '{name}'")
                r = self._req("POST", "/lists", {"name": name, "idBoard": board_id, "pos": (i + 1) * 65536})
                ids[name] = r.get("id", f"<dry-run-list-{name}>")
        return ids

    # ── labels ─────────────────────────────────────────────────────────

    def ensure_labels(self, board_id: str) -> dict[str, str]:
        existing = {l["name"]: l["id"] for l in self._req("GET", f"/boards/{board_id}/labels")}
        ids: dict[str, str] = {}
        for name, color in LABEL_COLORS.items():
            if name in existing:
                ids[name] = existing[name]
            else:
                print(f"  + label '{name}' ({color or 'no color'})")
                params: dict[str, str] = {"name": name, "idBoard": board_id}
                if color:
                    params["color"] = color
                r = self._req("POST", "/labels", params)
                ids[name] = r.get("id", f"<dry-run-label-{name}>")
        return ids

    # ── cards ──────────────────────────────────────────────────────────

    def all_cards(self, board_id: str) -> dict[str, dict]:
        cards = self._req(
            "GET",
            f"/boards/{board_id}/cards",
            {"fields": "name,desc,idList,idLabels"},
        )
        return {c["name"]: c for c in cards}

    def upsert_card(
        self,
        board_id: str,
        existing: dict[str, dict],
        list_ids: dict[str, str],
        label_ids: dict[str, str],
        card: Card,
    ) -> str:
        list_id = list_ids[card.resolved_list()]
        want_label_ids = sorted(label_ids[l] for l in card.resolved_labels() if l in label_ids)
        prev = existing.get(card.title)

        if prev is None:
            print(f"  + card {card.title[:70]}")
            r = self._req(
                "POST",
                "/cards",
                {
                    "idList": list_id,
                    "name": card.title,
                    "desc": card.description,
                    "idLabels": ",".join(want_label_ids),
                    "pos": "bottom",
                },
            )
            return r.get("id", "<dry-run-card>")

        has_label_ids = sorted(prev.get("idLabels") or [])
        needs_update = (
            prev.get("desc") != card.description
            or prev.get("idList") != list_id
            or has_label_ids != want_label_ids
        )
        if needs_update:
            print(f"  ~ card {card.title[:70]}  (list={card.resolved_list()})")
            self._req(
                "PUT",
                f"/cards/{prev['id']}",
                {
                    "desc": card.description,
                    "idList": list_id,
                    "idLabels": ",".join(want_label_ids),
                },
            )
        else:
            print(f"  = card {card.title[:70]}")
        return prev["id"]


# ── Entry point ────────────────────────────────────────────────────────


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="print planned changes without hitting Trello")
    args = ap.parse_args()

    # Auto-load qa/.trello.env if present (gitignored — see qa/README.md).
    envfile = HERE / ".trello.env"
    if envfile.exists():
        for line in envfile.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    key = os.environ.get("TRELLO_KEY")
    token = os.environ.get("TRELLO_TOKEN")
    if not key or not token:
        sys.exit("Missing TRELLO_KEY or TRELLO_TOKEN env var. Aborting.")

    board_ref = os.environ.get("TRELLO_BOARD_ID") or os.environ.get("TRELLO_BOARD_NAME") or BOARD_NAME_DEFAULT

    all_cards: list[Card] = []
    for path, team, default_type in SOURCES:
        cards = parse_source(path, team, default_type)
        print(f"Parsed {len(cards):>2} card(s) from {path.name}")
        all_cards.extend(cards)

    trello = Trello(key, token, dry_run=args.dry_run)

    board = trello.find_board(board_ref)
    if board is None:
        print(f"Board '{board_ref}' not found — creating it")
        board = trello.create_board(BOARD_NAME_DEFAULT if not re.fullmatch(r"[A-Za-z0-9]{8,12}", board_ref) else BOARD_NAME_DEFAULT)
    print(f"-> Board '{board.get('name', '?')}' ({board.get('url', '?')})")
    board_id = board.get("id", "<dry-run-board>")

    print("\n== Lists ==")
    list_ids = trello.ensure_lists(board_id)

    print("\n== Labels ==")
    label_ids = trello.ensure_labels(board_id)

    print("\n== Cards ==")
    existing = trello.all_cards(board_id) if not args.dry_run else {}
    for c in all_cards:
        trello.upsert_card(board_id, existing, list_ids, label_ids, c)

    print(f"\nDone. {len(all_cards)} card(s) reconciled.")


if __name__ == "__main__":
    main()
