"""
Cliente Supabase falso en memoria para tests unitarios (sin red ni .env real).
Soporta la parte de la API async que usan los endpoints de polls/series:
select/eq/ilike/lt/in_/is_/not_.is_/limit/order/single/maybe_single/insert/update/delete, defaults de columnas
y restricciones únicas (error con código 23505, como Postgres).

Fiel al cliente real (supabase==2.9.1, postgrest 0.17.2):
- `.maybe_single()` devuelve None (no un resultado vacío) si no hay fila.
- `.single()` lanza `APIError` (PGRST116) si no hay exactamente una fila, igual que PostgREST (406).
  Por eso el código nuevo usa `.limit(1)` y trata `data` vacía como "no encontrado".
"""

from typing import Any

from postgrest.exceptions import APIError

UNIQUE = {
    "polls": [("series_id", "edition"), ("slug",)],
    "poll_series": [("slug",)],
    "poll_results_snapshot": [("poll_id",)],
}
DEFAULTS = {
    "poll_series": {"template_version": 1, "is_active": True, "last_published_at": None},
}


class Result:
    def __init__(self, data):
        self.data = data


class _Not:
    def __init__(self, query):
        self.query = query

    def is_(self, key, value):
        assert value == "null", "el fake solo soporta not_.is_(col, 'null')"
        self.query.preds.append(lambda r: r.get(key) is not None)
        return self.query


class Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters, self.op, self.payload, self.maybe, self.strict_single = {}, "select", None, False, False
        self.ilikes = {}
        self.preds = []

    def select(self, *_):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def ilike(self, key, pattern):
        self.ilikes[key] = pattern.lower()
        return self

    def lt(self, key, value):
        self.preds.append(lambda r: r.get(key) is not None and str(r[key]) < str(value))
        return self

    def in_(self, key, values):
        self.preds.append(lambda r: r.get(key) in values)
        return self

    def is_(self, key, value):
        assert value == "null", "el fake solo soporta is_(col, 'null')"
        self.preds.append(lambda r: r.get(key) is None)
        return self

    @property
    def not_(self):
        return _Not(self)

    def limit(self, *_):
        return self

    def order(self, *_, **__):
        return self

    def maybe_single(self):
        self.maybe = True
        return self

    def single(self):
        """`.single()` del cliente real: lanza si no hay exactamente una fila."""
        self.strict_single = True
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
            and all(pred(r) for pred in self.preds)
        ]
        if self.op == "update":
            for r in matched:
                r.update(self.payload)
        elif self.op == "delete":
            self.db[self.table] = [r for r in rows if r not in matched]
        if self.strict_single:
            if len(matched) != 1:
                raise APIError({
                    "message": "JSON object requested, multiple (or no) rows returned",
                    "code": "PGRST116",
                    "details": f"The result contains {len(matched)} rows",
                    "hint": None,
                })
            return Result(matched[0])
        if self.maybe:
            # El cliente real devuelve None (no un resultado vacío) si maybe_single() no encuentra fila.
            return Result(matched[0]) if matched else None
        return Result(matched)


class FakeSupabase:
    def __init__(self, series: list[dict[str, Any]] | None = None, polls: list[dict[str, Any]] | None = None):
        self.db = {
            "poll_series": [dict(s) for s in (series or [])],
            "polls": [dict(p) for p in (polls or [])],
        }

    def table(self, name):
        return Query(self.db, name)
