#!/usr/bin/env python3
"""Resilience / load test for the KENCE.AI LLM pipeline (Task 6 of the
"устранение зависших сессий" spec).

Exercises the live system through its public HTTP API (and, for the two
disruptive scenarios, `docker restart`) to verify that no chat generation can
remain "running" forever and that the LLM queue (semaphore / circuit breaker /
generation registry) recovers on its own after an Ollama or backend restart.

Run from the host (needs `docker` CLI + `requests`):

    python3 scripts/load_test_llm_resilience.py --scenarios 1,2,4,6
    python3 scripts/load_test_llm_resilience.py --scenarios 3 --yes-disruptive
    python3 scripts/load_test_llm_resilience.py --scenarios 5 --yes-disruptive

Scenario 3 restarts `kence-ollama`, scenario 5 restarts `kence-backend` —
both require --yes-disruptive and briefly disrupt the system for ALL users.

A throwaway admin user (loadtest_admin_<run_id>) is created directly via
`docker exec` (app.services.user_service.create_user) so the script can poll
GET /api/system/llm-status without touching the real `admin` account.
"""
import argparse
import json
import secrets
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

import requests

BASE = "http://localhost:8000/api"

TEST_DOC = b"""# Load Test Document

This is a short synthetic document used by the LLM resilience load test.

## Section 1: Overview
KENCE.AI is an AI assistant for working with documents: chat, translation,
comparison, conversion and presentations. This section exists purely to give
the retriever and the LLM something to talk about.

## Section 2: Numbers
In 2024 the project processed 1200 documents. In 2025 that grew to 3400
documents. The team consists of 5 engineers.

## Section 3: Conclusion
This document is intentionally short so that chat responses are fast during
load testing.
"""


def api(method, path, token=None, **kw):
    headers = kw.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    timeout = kw.pop("timeout", 30)
    return requests.request(method, f"{BASE}{path}", headers=headers, timeout=timeout, **kw)


def register_or_login(username, password, role="user"):
    r = api("POST", "/auth/register", json={"username": username, "password": password, "role": role})
    if r.status_code == 200:
        return r.json()["access_token"]
    r = api("POST", "/auth/login", data={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def setup_session(token):
    r = api("POST", "/sessions", token=token)
    r.raise_for_status()
    sid = r.json()["session_id"]
    files = {"file": ("loadtest.txt", TEST_DOC, "text/plain")}
    r = api("POST", f"/documents/upload?session_id={sid}", token=token, files=files, timeout=120)
    r.raise_for_status()
    return sid


def stream_chat(token, session_id, question, mode="precise", language="ru", timeout=180):
    """Consume an SSE /chat/stream response to completion. Returns the list
    of parsed event dicts (plus {'done': True} as the last element)."""
    params = {"session_id": session_id, "question": question, "mode": mode, "language": language}
    headers = {"Authorization": f"Bearer {token}"}
    events = []
    with requests.get(f"{BASE}/chat/stream", params=params, headers=headers, stream=True, timeout=timeout) as r:
        r.raise_for_status()
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            payload = line[len("data: "):]
            if payload == "[DONE]":
                events.append({"done": True})
                break
            try:
                events.append(json.loads(payload))
            except json.JSONDecodeError:
                continue
    return events


def abrupt_disconnect_chat(token, session_id, question, read_n_events=2):
    """Open /chat/stream, read a couple of events, then close the
    connection without reading [DONE] — simulates a closed browser tab."""
    params = {"session_id": session_id, "question": question, "mode": "precise", "language": "ru"}
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE}/chat/stream", params=params, headers=headers, stream=True, timeout=180)
    try:
        count = 0
        for line in r.iter_lines(decode_unicode=True):
            if line and line.startswith("data: "):
                count += 1
                if count >= read_n_events:
                    break
    finally:
        r.close()


def health_full():
    r = requests.get(f"{BASE}/health/full", timeout=10)
    r.raise_for_status()
    return r.json()


def llm_status(admin_token):
    r = api("GET", "/system/llm-status", token=admin_token, timeout=10)
    r.raise_for_status()
    return r.json()


def wait_clean(admin_token, timeout=10, interval=0.5):
    """Poll /api/system/llm-status until the registry is empty (handles the
    race between the client receiving [DONE] and the server's finally-block
    calling generation_registry.finish())."""
    deadline = time.time() + timeout
    st = llm_status(admin_token)
    while st["generation_registry_size"] != 0 and time.time() < deadline:
        time.sleep(interval)
        st = llm_status(admin_token)
    return st


# ─────────────────────────────────────────────────────────────────────────
# Scenarios
# ─────────────────────────────────────────────────────────────────────────

def scenario_1(token, session_id, admin_token):
    print("\n=== Scenario 1: 10 sequential requests (1 user) ===")
    results = []
    ok = True
    for i in range(10):
        t0 = time.time()
        stream_chat(token, session_id, f"Кратко (1 предложение): о чём документ? (запрос {i + 1})")
        dt = time.time() - t0
        st = wait_clean(admin_token)
        row = {
            "i": i + 1,
            "duration_sec": round(dt, 1),
            "registry_size": st["generation_registry_size"],
            "semaphore": st["semaphore_usage"],
            "circuit": st["circuit_breaker_state"],
        }
        results.append(row)
        print(f"  [{i + 1:2d}/10] {dt:5.1f}s  registry={row['registry_size']} "
              f"sem={row['semaphore']} circuit={row['circuit']}")
        if row["registry_size"] != 0 or row["circuit"] != "closed":
            ok = False
    print("PASS" if ok else "FAIL")
    return {"scenario": 1, "pass": ok, "results": results}


def scenario_2(admin_token, run_id):
    print("\n=== Scenario 2: 5 parallel users ===")
    users = []
    for i in range(5):
        username = f"loadtest_p{run_id}_{i}"
        password = secrets.token_urlsafe(16)
        token = register_or_login(username, password)
        sid = setup_session(token)
        users.append({"username": username, "token": token, "session_id": sid})

    results = {}

    def worker(u):
        t0 = time.time()
        events = stream_chat(u["token"], u["session_id"], "Сделай краткое summary документа в 2 предложениях.")
        results[u["username"]] = {"duration_sec": round(time.time() - t0, 1), "n_events": len(events)}

    threads = [threading.Thread(target=worker, args=(u,)) for u in users]
    for t in threads:
        t.start()
    time.sleep(2)
    mid = llm_status(admin_token)
    print("  mid-flight:", json.dumps(mid, ensure_ascii=False))
    for t in threads:
        t.join()
    final = wait_clean(admin_token)
    print("  final:     ", json.dumps(final, ensure_ascii=False))

    ok = (
        mid["active_generations"] <= 2
        and final["generation_registry_size"] == 0
        and final["circuit_breaker_state"] == "closed"
        and all(r["n_events"] > 0 for r in results.values())
    )
    print("PASS" if ok else "FAIL")
    return {"scenario": 2, "pass": ok, "mid": mid, "final": final, "results": results}


def scenario_3(token, session_id, admin_token):
    print("\n=== Scenario 3: Ollama restart mid-generation ===")
    box = {}

    def worker():
        t0 = time.time()
        try:
            box["events"] = stream_chat(
                token, session_id,
                "Напиши подробный анализ документа на 5 абзацев, перечисли все цифры.",
                timeout=300,
            )
        except Exception as e:
            box["error"] = str(e)
        box["duration"] = time.time() - t0

    th = threading.Thread(target=worker)
    th.start()
    time.sleep(2)
    print("  restarting kence-ollama ...")
    subprocess.run(["docker", "restart", "kence-ollama"], check=True, capture_output=True)
    th.join()

    text = "".join(e.get("text", "") for e in box.get("events", []))
    timeout_msg_seen = ("не отвечает" in text) or ("Ошибка генерации" in text) or ("error" in str(box))
    print(f"  generation finished after {box['duration']:.1f}s, timeout/error message seen={timeout_msg_seen}")

    # wait for ollama to come back healthy
    print("  waiting for Ollama to become healthy again ...")
    for _ in range(60):
        h = health_full()
        if h["services"]["ollama"]["status"] == "ok":
            break
        time.sleep(2)
    else:
        print("  WARNING: Ollama did not report healthy within 120s")

    st = llm_status(admin_token)
    print("  post-restart status:", json.dumps(st, ensure_ascii=False))

    # new request, no backend restart
    t0 = time.time()
    try:
        events2 = stream_chat(token, session_id, "Привет! Кратко: о чём документ?", timeout=180)
        recovered = any("text" in e for e in events2)
    except Exception as e:
        recovered = False
        print("  recovery request error:", e)
    print(f"  recovery request: {'OK' if recovered else 'FAILED'} in {time.time() - t0:.1f}s")

    final = wait_clean(admin_token)
    print("  final status:      ", json.dumps(final, ensure_ascii=False))

    ok = timeout_msg_seen and recovered and final["circuit_breaker_state"] == "closed" and final["generation_registry_size"] == 0
    print("PASS" if ok else "FAIL")
    return {
        "scenario": 3, "pass": ok,
        "timeout_msg_seen": timeout_msg_seen, "recovered": recovered,
        "post_restart": st, "final": final,
    }


def scenario_4(token, session_id, admin_token):
    print("\n=== Scenario 4: client disconnect mid-stream ===")
    abrupt_disconnect_chat(token, session_id, "Напиши очень подробный анализ документа на 8 абзацев.", read_n_events=2)
    print("  client disconnected after 2 events, waiting for backend to notice ...")
    st = wait_clean(admin_token, timeout=20, interval=1)
    print("  status after disconnect:", json.dumps(st, ensure_ascii=False))
    ok = st["generation_registry_size"] == 0
    print("PASS" if ok else "FAIL")
    return {"scenario": 4, "pass": ok, "final": st}


def scenario_5(token, session_id, admin_token):
    print("\n=== Scenario 5: backend restart mid-generation ===")
    box = {}

    def worker():
        try:
            box["events"] = stream_chat(token, session_id, "Сделай детальный пересказ документа.", timeout=120)
        except Exception as e:
            box["error"] = str(e)

    th = threading.Thread(target=worker)
    th.start()
    time.sleep(2)
    print("  restarting kence-backend ...")
    subprocess.run(["docker", "restart", "kence-backend"], check=True, capture_output=True)
    th.join()
    print(f"  worker result during restart: {box}")

    print("  waiting for backend to become healthy again ...")
    for _ in range(60):
        try:
            r = requests.get(f"{BASE}/health", timeout=5)
            if r.status_code == 200:
                break
        except Exception:
            pass
        time.sleep(2)
    else:
        print("  WARNING: backend did not come back within 120s")

    logs = subprocess.run(["docker", "logs", "--since", "2m", "kence-backend"], capture_output=True, text=True).stdout
    reconciled = "[startup] reconciled stale state" in logs

    final = wait_clean(admin_token, timeout=20)
    print("  post-restart status:", json.dumps(final, ensure_ascii=False))

    try:
        events2 = stream_chat(token, session_id, "Привет! Кратко: о чём документ?", timeout=180)
        recovered = any("text" in e for e in events2)
    except Exception as e:
        recovered = False
        print("  recovery request error:", e)
    print(f"  recovery request: {'OK' if recovered else 'FAILED'}")

    final2 = wait_clean(admin_token)
    ok = recovered and final2["generation_registry_size"] == 0 and final2["circuit_breaker_state"] == "closed"
    print("PASS" if ok else "FAIL")
    return {"scenario": 5, "pass": ok, "reconciled_logged": reconciled, "recovered": recovered, "final": final2}


def scenario_6(token, session_id, admin_token):
    print("\n=== Scenario 6: chat + agent task + graph extraction concurrently ===")
    box = {}

    def chat_worker():
        box["chat_events"] = stream_chat(token, session_id, "О чём этот документ? Ответь подробно, минимум 3 предложения.", timeout=180)

    th = threading.Thread(target=chat_worker)
    th.start()
    time.sleep(0.5)

    r = api("POST", "/agents/tasks", token=token, json={"task_type": "data_extractor", "session_id": session_id})
    box["agent_status_code"] = r.status_code
    box["agent_resp"] = r.json() if r.ok else r.text
    print(f"  agent task: {r.status_code} {box['agent_resp']}")

    r2 = api("POST", "/orgs/1/graph/extract", token=token, json={"session_id": session_id, "language": "ru"})
    box["graph_status_code"] = r2.status_code
    box["graph_resp"] = r2.json() if r2.ok else r2.text
    print(f"  graph extraction: {r2.status_code} {box['graph_resp']}")

    time.sleep(2)
    mid = llm_status(admin_token)
    print("  mid-flight:", json.dumps(mid, ensure_ascii=False))

    th.join()

    if r.ok:
        task_id = box["agent_resp"]["task_id"]
        for _ in range(60):
            tr = api("GET", f"/agents/tasks/{task_id}", token=token, timeout=10).json()
            if tr.get("status") in ("done", "failed", "cancelled"):
                box["agent_final_status"] = tr.get("status")
                break
            time.sleep(2)

    if r2.ok:
        job_id = box["graph_resp"]["job_id"]
        for _ in range(60):
            jr = api("GET", f"/orgs/1/graph/jobs/{job_id}", token=token, timeout=10).json()
            if jr.get("status") in ("done", "failed"):
                box["graph_final_status"] = jr.get("status")
                break
            time.sleep(2)

    final = wait_clean(admin_token)
    print("  final:", json.dumps(final, ensure_ascii=False))

    active, cap = (int(x) for x in mid["semaphore_usage"].split("/"))
    ok = (
        active <= cap
        and final["generation_registry_size"] == 0
        and final["circuit_breaker_state"] == "closed"
        and len(box.get("chat_events", [])) > 0
    )
    print("PASS" if ok else "FAIL")
    return {"scenario": 6, "pass": ok, "mid": mid, "final": final, "details": box}


# ─────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenarios", default="1,2,4,6", help="comma-separated list, e.g. 1,2,3,4,5,6")
    parser.add_argument("--yes-disruptive", action="store_true", help="required for scenarios 3 and 5")
    args = parser.parse_args()
    scenarios = set(s.strip() for s in args.scenarios.split(","))

    if ("3" in scenarios or "5" in scenarios) and not args.yes_disruptive:
        print("Scenarios 3 and 5 restart kence-ollama / kence-backend and require --yes-disruptive")
        sys.exit(1)

    run_id = uuid.uuid4().hex[:8]
    print(f"Load test run_id={run_id}")

    # Throwaway admin account (created directly via the app's user_service,
    # shared Postgres DB — does not touch the real `admin` account) so the
    # script can poll GET /api/system/llm-status.
    admin_user = f"loadtest_admin_{run_id}"
    admin_pass = secrets.token_urlsafe(16)
    code = (
        f"from app.services.user_service import create_user; "
        f"create_user({admin_user!r}, {admin_pass!r}, 'admin')"
    )
    subprocess.run(["docker", "exec", "kence-backend", "python3", "-c", code], check=True)
    admin_token = register_or_login(admin_user, admin_pass, role="admin")

    main_user = f"loadtest_user_{run_id}"
    main_pass = secrets.token_urlsafe(16)
    main_token = register_or_login(main_user, main_pass)
    session_id = setup_session(main_token)
    print(f"Main test user={main_user} session_id={session_id}")

    results = []
    if "1" in scenarios:
        results.append(scenario_1(main_token, session_id, admin_token))
    if "2" in scenarios:
        results.append(scenario_2(admin_token, run_id))
    if "4" in scenarios:
        results.append(scenario_4(main_token, session_id, admin_token))
    if "6" in scenarios:
        results.append(scenario_6(main_token, session_id, admin_token))
    if "3" in scenarios:
        results.append(scenario_3(main_token, session_id, admin_token))
    if "5" in scenarios:
        results.append(scenario_5(main_token, session_id, admin_token))

    out_path = Path(__file__).parent / f"load_test_results_{run_id}.json"
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False, default=str))

    print("\n=== Summary ===")
    for r in results:
        print(f"  Scenario {r['scenario']}: {'PASS' if r['pass'] else 'FAIL'}")
    print(f"\nFull results: {out_path}")
    print(f"Throwaway accounts created: {admin_user}, {main_user}, loadtest_p{run_id}_0..4 (if scenario 2 ran)")

    if not all(r["pass"] for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
