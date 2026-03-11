#!/usr/bin/env python3
import os
import sqlite3
import subprocess
import sys
from datetime import datetime

SQLITE_PATH = os.environ.get("SQLITE_PATH", "/tmp/questrade.db")
PG_CONTAINER = os.environ.get("PG_CONTAINER", "app-postgres")
PG_USER = os.environ.get("PGUSER", "appuser")
PG_DB = os.environ.get("PGDATABASE", "appdb")

TABLES = [
    ("accounts", ["id", "account_number", "account_type", "nickname", "created_at", "updated_at"]),
    ("import_files", ["id", "filename", "file_hash", "row_count", "inserted_count", "skipped_count", "failed_count", "imported_at"]),
    ("portfolio_settings", ["id", "weekly_amount", "fx_fee_percent", "updated_at"]),
    ("allocation_targets", ["id", "portfolio_settings_id", "symbol", "target_weight", "currency"]),
    ("price_cache", ["id", "symbol", "price", "previous_close", "currency", "fetched_at", "expires_at"]),
    ("fx_cache", ["id", "pair", "rate", "fetched_at", "expires_at"]),
    ("symbol_mappings", ["id", "internal_code", "ticker", "name", "created_at"]),
    ("transactions", ["id", "source_row_hash", "transaction_date", "settlement_date", "action", "symbol", "symbol_mapped", "description", "quantity", "price", "gross_amount", "commission", "net_amount", "currency", "activity_type", "cad_equivalent", "account_id", "import_file_id", "created_at"]),
]

DATETIME_COLUMNS = {
    "accounts": {"created_at", "updated_at"},
    "import_files": {"imported_at"},
    "portfolio_settings": {"updated_at"},
    "price_cache": {"fetched_at", "expires_at"},
    "fx_cache": {"fetched_at", "expires_at"},
    "symbol_mappings": {"created_at"},
    "transactions": {"transaction_date", "settlement_date", "created_at"},
}


def normalize_value(table, column, value):
    if value is None:
        return None
    if table in DATETIME_COLUMNS and column in DATETIME_COLUMNS[table]:
        if isinstance(value, (int, float)):
            return datetime.utcfromtimestamp(value / 1000).strftime('%Y-%m-%d %H:%M:%S')
        if isinstance(value, str) and value.isdigit():
            return datetime.utcfromtimestamp(int(value) / 1000).strftime('%Y-%m-%d %H:%M:%S')
    return value


def pg_escape(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return "'" + str(value).replace("'", "''") + "'"


def main():
    if not os.path.exists(SQLITE_PATH):
        print(f"SQLite DB not found: {SQLITE_PATH}", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(SQLITE_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    statements = [
        "BEGIN;",
        "TRUNCATE TABLE transactions, allocation_targets, portfolio_settings, symbol_mappings, fx_cache, price_cache, import_files, accounts RESTART IDENTITY CASCADE;",
    ]

    for table, columns in TABLES:
        cur.execute(f"SELECT {', '.join(columns)} FROM {table}")
        rows = cur.fetchall()
        if not rows:
            continue
        values_sql = []
        for row in rows:
            values_sql.append("(" + ", ".join(pg_escape(normalize_value(table, col, row[col])) for col in columns) + ")")
        statements.append(f"INSERT INTO {table} ({', '.join(columns)}) VALUES\n  " + ",\n  ".join(values_sql) + ";")

    statements.append("COMMIT;")
    sql = "\n".join(statements)

    cmd = [
        "docker", "exec", "-i", PG_CONTAINER,
        "psql", "-v", "ON_ERROR_STOP=1", "-U", PG_USER, "-d", PG_DB
    ]
    subprocess.run(cmd, input=sql.encode("utf-8"), check=True)
    print(f"Migration complete from {SQLITE_PATH} to {PG_CONTAINER}/{PG_DB}")


if __name__ == "__main__":
    main()
