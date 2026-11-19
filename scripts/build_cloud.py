# -*- coding: utf-8 -*-
"""从本地 Python 模型生成 Pages 静态题库、Edge Function 模型与旧数据导入 SQL。"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
CLOUD = os.path.dirname(HERE)
APP = os.path.dirname(CLOUD)
sys.path.insert(0, APP)

from content import (DIMS, DIM_INFO, QUESTIONS, SITUATIONS, THEORY_PANEL,  # noqa: E402
                     BOUNDARY)
from cities import CITIES  # noqa: E402
from scoring import public_questions  # noqa: E402

CN = timezone(timedelta(hours=8))


def json_text(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("wrote", os.path.relpath(path, APP), len(text), "chars")


def build_assets():
    qs = public_questions()
    write(os.path.join(CLOUD, "docs", "data", "questions.json"),
          json.dumps({"total": len(qs), "questions": qs},
                     ensure_ascii=False, indent=2) + "\n")

    model = {
        "DIMS": DIMS,
        "DIM_INFO": DIM_INFO,
        "QUESTIONS": QUESTIONS,
        "CITIES": CITIES,
        "SITUATIONS": SITUATIONS,
        "THEORY_PANEL": THEORY_PANEL,
        "BOUNDARY": BOUNDARY,
    }
    ts = (
        "// 由 cloud/scripts/build_cloud.py 生成，请勿手改。\n"
        "// 只部署在 Supabase Edge Function，不进入 Pages 前端。\n"
        "export const MODEL = " + json.dumps(model, ensure_ascii=False) + ";\n"
    )
    write(os.path.join(CLOUD, "supabase", "functions", "_shared", "model.js"), ts)


def build_standalone():
    """生成可整段粘贴到 Supabase Dashboard 的单文件函数（免 CLI）。"""
    shared = os.path.join(CLOUD, "supabase", "functions", "_shared")
    with open(os.path.join(shared, "model.js"), "r", encoding="utf-8") as f:
        model = f.read()
    with open(os.path.join(shared, "scoring.js"), "r", encoding="utf-8") as f:
        scoring = f.read()
    with open(os.path.join(CLOUD, "supabase", "functions", "submit", "index.ts"),
              "r", encoding="utf-8") as f:
        index = f.read()

    model = model.replace("export const MODEL", "const MODEL", 1)
    scoring = scoring.replace('import { MODEL } from "./model.js";', "")
    scoring = scoring.replace("export function", "function").replace("export const", "const")
    index = index.replace('import { pickResult, validateAnswers } from "../_shared/scoring.js";', "")
    index = index.replace('import { validateAnswers } from "../_shared/scoring.js";', "")

    out = (
        "// 单文件版 Edge Function：Supabase Dashboard → Edge Functions → 新建 submit → 粘贴整段。\n"
        "// 内容由 build_cloud.py 合并 model.js + scoring.js + index.ts，请勿手改。\n\n"
        + model + "\n\n" + scoring + "\n\n" + index
    )
    write(os.path.join(CLOUD, "supabase", "functions", "submit", "standalone.ts"), out)


def sql_str(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def sql_ts(v):
    if not v:
        return "null"
    s = str(v).strip().replace("T", " ").replace("Z", "")
    if "+" in s or s.endswith("00:00"):
        return sql_str(s)
    return sql_str(s + "+08")


def build_legacy():
    db_path = os.path.join(APP, "data", "db.json")
    if not os.path.isfile(db_path):
        print("no local db.json, skip legacy import")
        return
    with open(db_path, "r", encoding="utf-8") as f:
        db = json.load(f)

    lines = [
        "-- 旧版本地数据导入：卡密、会话、结果",
        "-- 在 0001_init.sql 之后执行；可重复执行（on conflict do nothing）。",
        "-- 旧结果为七维结构，前端会以「旧版结果」降级展示。",
        "begin;",
    ]

    for code, c in sorted(db.get("cards", {}).items()):
        status = c.get("status") or "unused"
        if status not in ("unused", "in_use", "used"):
            status = "used" if c.get("resultId") else "unused"
        lines.append(
            "insert into public.cards (code,status,note,created_at,used_at,session_id,result_id) values ("
            "%s,%s,%s,%s,%s,%s,%s) on conflict (code) do nothing;" % (
                sql_str(code), sql_str(status), sql_str(c.get("note") or ""),
                sql_ts(c.get("createdAt")), sql_ts(c.get("usedAt")),
                sql_str(c.get("sessionId")), sql_str(c.get("resultId"))))

    for sid, s in sorted(db.get("sessions", {}).items()):
        if isinstance(s, dict) and s.get("id"):
            sid = s["id"]
        code = s.get("code") if isinstance(s, dict) else None
        if not code:
            continue
        lines.append(
            "insert into public.sessions (id,code,created_at,submitted_at,result_id) values ("
            "%s,%s,%s,%s,%s) on conflict (id) do nothing;" % (
                sql_str(sid), sql_str(code), sql_ts(s.get("createdAt")),
                sql_ts(s.get("submittedAt") or s.get("usedAt")), sql_str(s.get("resultId"))))

    for rid, r in sorted(db.get("results", {}).items()):
        data = r.get("data") if isinstance(r, dict) else None
        if data is None:
            continue
        lines.append(
            "insert into public.results (id,data,created_at) values (%s,%s::jsonb,%s) "
            "on conflict (id) do nothing;" % (
                sql_str(rid), sql_str(json_text(data)), sql_ts(r.get("createdAt"))))

    lines += [
        "-- 旧卡密如果没有会话记录，补一条，保证管理端状态完整",
        "insert into public.sessions (id,code,created_at,submitted_at,result_id)",
        "select c.session_id, c.code, c.created_at, c.used_at, c.result_id",
        "from public.cards c",
        "where c.session_id is not null",
        "  and not exists (select 1 from public.sessions s where s.id = c.session_id);",
        "commit;",
        "",
    ]
    write(os.path.join(CLOUD, "supabase", "legacy_import.sql"), "\n".join(lines))


if __name__ == "__main__":
    build_assets()
    build_standalone()
    build_legacy()
