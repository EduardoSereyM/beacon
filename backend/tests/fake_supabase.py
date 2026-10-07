"""
Cliente Supabase falso en memoria para tests unitarios (sin red ni .env real).
Soporta la parte de la API async que usan los endpoints de polls/series:
select/eq/ilike/limit/order/maybe_single/insert/update/delete, defaults de columnas
y restricciones únicas (error con código 23505, como Postgres).
"""

from typing import Any

UNIQUE = {
    "polls": [("series_id", "edition"), ("slug",)],
    "poll_series": [("slug",)],
}
DEFAULTS = {
    "poll_series": {"template_version": 1, "is_active": True, "last_published_at": None},
}


class Result:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters, self.op, self.payload, self.single = {}, "select", None, False
        self.ilikes = {}

    def select(self, *_):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def ilike(self, key, pattern):
        self.ilikes[key] = pattern.lower()
        return self

    def limit(self, *_):
        return self

    def order(self, *_, **__):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def _check_unique(self, rows):
        for columns in UNIQUE.get(self.table, []):
            values = [self.payload.get(c) for c in columns]
            if any(v is None for v in values):
                continue  # índice parcial: filas sin esas columnas no cuentan
            if any([r.get(c) for c in columns] == values for r in rows):
                name = f"{self.table}_{'_'.join(columns)}_key"
                raise Exception(f'duplicate key value violates unique constraint "{name}" (23505)')

    async def execute(self):
        rows = self.db.setdefault(self.table, [])
        if self.op == "insert":
            self._check_unique(rows)
            row = {"id": f"{self.table}-{len(rows) + 1}", **DEFAULTS.get(self.table, {}), **self.payload}
            rows.append(row)
            return Result([row])
        matched = [
            r for r in rows
            if all(r.get(k) == v for k, v in self.filters.items())
            and all(str(r.get(k) or "").lower() == v for k, v in self.ilikes.items())
        ]
        if self.op == "update":
            for r in matched:
                r.update(self.payload)
        elif self.op == "delete":
            self.db[self.table] = [r for r in rows if r not in matched]
        if self.single:
            return Result(matched[0] if matched else None)
        return Result(matched)


class FakeSupabase:
    def __init__(self, series: list[dict[str, Any]] | None = None, polls: list[dict[str, Any]] | None = None):
        self.db = {
            "poll_series": [dict(s) for s in (series or [])],
            "polls": [dict(p) for p in (polls or [])],
        }

    def table(self, name):
        return Query(self.db, name)
