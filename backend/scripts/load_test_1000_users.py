#!/usr/bin/env python3
"""
Load test: N SIMULTANEOUS chat requests against LLM pipeline.

Tests the system's behavior under extreme load:
- Semaphore saturation (max_concurrent=3)
- Queue buffer (queue_maxsize=50)
- Circuit breaker activation
- Response timeouts and graceful degradation

Usage:  python3 scripts/load_test_1000_users.py --users 100
"""
import argparse
import json
import secrets
import subprocess
import sys
import time
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

BASE = "http://localhost:8000/api"


def api_request(method, path, token=None, **kwargs):
    """Single HTTP request to API."""
    import requests
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    timeout = kwargs.pop("timeout", 120)
    return requests.request(method, f"{BASE}{path}", headers=headers, timeout=timeout, **kwargs)


def create_user_via_docker(username, password, role="user"):
    """Create user directly in backend via docker exec."""
    try:
        code = f"from app.services.user_service import create_user; create_user({username!r}, {password!r}, {role!r})"
        subprocess.run(
            ["docker", "exec", "kence-backend", "python3", "-c", code],
            capture_output=True, timeout=10
        )
        return True
    except Exception:
        return False


def login(username, password):
    """Login and return token."""
    import requests
    try:
        r = requests.post(f"{BASE}/auth/login", data={"username": username, "password": password}, timeout=10)
        if r.status_code == 200:
            return r.json().get("access_token")
    except Exception:
        pass
    return None


def create_session_via_db(username):
    """Create a session directly in DB (fastest, bypasses API)."""
    session_id = f"loadtest_{uuid.uuid4().hex[:8]}"

    code = f'''
from app.core.database import SessionLocal
from app.models.models import DocSession
db = SessionLocal()
session = DocSession(
    session_id="{session_id}",
    owner_username="{username}"
)
try:
    db.add(session)
    db.commit()
except:
    db.rollback()
db.close()
print("{session_id}")
'''
    try:
        result = subprocess.run(
            ["docker", "exec", "kence-backend", "python3", "-c", code],
            capture_output=True, text=True, timeout=10
        )
        # Session ID should be in stdout
        return session_id
    except Exception:
        return None


def chat_request(session_id, token):
    """Single chat request (POST /chat) - returns (status_code, response_time_ms, result)."""
    import requests

    payload = {
        "session_id": session_id,
        "question": "О чем документ?",
        "language": "ru"
    }

    headers = {"Authorization": f"Bearer {token}"}

    t0 = time.time()
    try:
        r = requests.post(f"{BASE}/chat", json=payload, headers=headers, timeout=120)
        dt = (time.time() - t0) * 1000

        if r.status_code == 200:
            return (r.status_code, round(dt), "OK")
        else:
            # Error response
            try:
                err_text = r.json().get("detail", r.text[:100])
            except Exception:
                err_text = r.text[:100]
            return (r.status_code, round(dt), err_text)

    except requests.exceptions.Timeout:
        dt = (time.time() - t0) * 1000
        return (-1, round(dt), "TIMEOUT")
    except Exception as e:
        dt = (time.time() - t0) * 1000
        return (-2, round(dt), str(e)[:100])


def create_test_user_and_session():
    """Create a test user and session with mock document for testing."""

    # Create new test user (password known)
    username = f"loadtest_bot_{uuid.uuid4().hex[:6]}"
    password = "testpass123"

    # Create user directly in DB via docker exec
    create_user_via_docker(username, password, "admin")

    # Login
    token = login(username, password)
    if not token:
        raise Exception(f"Failed to login as {username}")

    # Create session with mock document data via DB directly
    import subprocess
    session_id = f"loadtest_{uuid.uuid4().hex[:8]}"

    code = f'''
from app.core.database import SessionLocal
from app.models.models import DocSession
db = SessionLocal()
s = DocSession(
    session_id="{session_id}",
    owner_username="{username}",
    has_vector_store=True,
    document_name="test_doc.txt",
    preview="Test document for load testing. Contains information about KENCE.AI platform.",
    markdown_text="# Test Document\\n\\nThis is a test document used for load testing the LLM pipeline.\\n\\n## Overview\\nKENCE.AI is an AI document assistant.\\n\\n## Features\\n- Chat with documents\\n- Translation\\n- Comparison\\n- Presentations"
)
try:
    db.add(s)
    db.commit()
except:
    db.rollback()
db.close()
'''
    subprocess.run(["docker", "exec", "kence-backend", "python3", "-c", code], capture_output=True)

    # Also create mock ChromaDB directory to pass the vector_store check
    code2 = f'''
import os
os.makedirs(f"chroma_db/{session_id}", exist_ok=True)
with open(f"chroma_db/{session_id}/.keep", "w") as f:
    f.write("mock")
'''
    subprocess.run(["docker", "exec", "kence-backend", "python3", "-c", code2], capture_output=True)

    return {"token": token, "session_id": session_id}


def check_system_status():
    """Check LLM subsystem status via internal endpoint."""
    import requests
    try:
        # Use localhost from inside container
        r = requests.get("http://localhost:8000/api/system/llm-status", timeout=5)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


def run_single_chat(session_id, token):
    """Single chat request."""
    return chat_request(session_id, token)


def simulate_concurrent_load(num_users, test_config=None):
    """
    Simulate load by sending N concurrent chat requests.

    With max_concurrent=3 and queue_maxsize=50:
    - First ~3 succeed quickly (1-2s each)
    - Next ~47 wait in queue (may timeout if >60s)
    - Remaining get 503 "queue full" immediately
    """
    import requests

    token = test_config["token"]
    session_id = test_config["session_id"]

    print(f"\nStarting load test with {num_users} concurrent requests...")
    print(f"Using session: {session_id[:16]}...")
    print(f"System config: max_concurrent=3, queue_maxsize=50")
    print(f"Expected:")
    print(f"  - First ~3 requests succeed quickly (~1-2s)")
    print(f"  - Next ~47 queue (may timeout after 60s+)")
    print(f"  - Remaining get 503 'queue full'")

    results = []
    semaphore_counts = {"ok": 0, "timeout": 0, "503": 0, "other": 0}

    t_start_all = time.time()

    # Send all requests concurrently using the same session/token
    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = []
        for i in range(num_users):
            futures.append(executor.submit(run_single_chat, session_id, token))

        completed = 0
        for future in as_completed(futures):
            completed += 1
            status_code, ms, result = future.result()
            results.append({"status": status_code, "ms": ms, "result": result})

            if status_code == 200:
                semaphore_counts["ok"] += 1
            elif status_code == -1:
                semaphore_counts["timeout"] += 1
            elif status_code == 503:
                semaphore_counts["503"] += 1
            else:
                semaphore_counts["other"] += 1

            # Progress update every 25 requests
            if completed % 25 == 0 or completed == num_users:
                print(f"  Progress: {completed}/{num_users} | OK={semaphore_counts['ok']} Timeout={semaphore_counts['timeout']} 503={semaphore_counts['503']}")

    total_time = time.time() - t_start_all

    # Compute stats
    if results:
        avg_ms = sum(r["ms"] for r in results) / len(results)
        min_ms = min(r["ms"] for r in results)
        max_ms = max(r["ms"] for r in results)
    else:
        avg_ms = min_ms = max_ms = 0

    stats = {
        "total": len(results),
        "success": semaphore_counts["ok"],
        "timeout": semaphore_counts["timeout"],
        "error_503": semaphore_counts["503"],
        "error_other": semaphore_counts["other"],
        "avg_ms": round(avg_ms),
        "min_ms": min_ms,
        "max_ms": max_ms,
        "total_time_sec": round(total_time, 2)
    }

    return stats, results[:10]  # Save first 10 detailed results for analysis


def main():
    parser = argparse.ArgumentParser(description="Load test concurrent LLM chat requests")
    parser.add_argument("--users", type=int, default=100, help="Number of concurrent users (default: 100)")
    parser.add_argument("--quick", action="store_true", help="Quick mode: shorter timeouts for faster testing")
    args = parser.parse_args()

    run_id = uuid.uuid4().hex[:6]
    num_users = args.users

    print("="*60)
    print(f"LOAD TEST: {num_users} concurrent LLM chat requests")
    print(f"Run ID: {run_id}")
    print("="*60)

    # Pre-test status
    print("\n=== Pre-test system status ===")
    pre_status = check_system_status()
    print(json.dumps(pre_status, indent=2))

    # Check circuit breaker is closed
    if pre_status.get("circuit_breaker_state") == "open":
        print("\n⚠ WARNING: Circuit breaker OPEN! Waiting for recovery...")
        time.sleep(35)  # Wait for half-open transition

    # Create test user and session with document
    print(f"\n=== Creating test user and session ===")
    try:
        test_config = create_test_user_and_session()
        print(f"Test token: {test_config['token'][:20]}...")
        print(f"Session ID: {test_config['session_id']}")
    except Exception as e:
        print(f"ERROR creating test user: {e}")
        sys.exit(1)

    # Run load test
    stats, results = simulate_concurrent_load(num_users, test_config)

    # Post-test status (immediate)
    print("\n=== After load (immediate) ===")
    post_status = check_system_status()
    print(json.dumps(post_status, indent=2))

    # Wait for queue to drain and check final status
    print(f"\nWaiting 15s for queue to drain...")
    time.sleep(15)

    print("\n=== Final status (after cooldown) ===")
    final_status = check_system_status()
    print(json.dumps(final_status, indent=2))

    # Save results
    out_path = Path(__file__).parent / f"load_test_{num_users}users_{run_id}.json"
    out_data = {
        "run_id": run_id,
        "config": {"users": num_users, "max_concurrent": 3, "queue_maxsize": 50},
        "pre_status": pre_status,
        "post_status": post_status,
        "final_status": final_status,
        "stats": stats,
        "sample_results": results,  # First 10 detailed responses for debugging
    }
    out_path.write_text(json.dumps(out_data, indent=2, ensure_ascii=False, default=str))

    # Summary
    print("\n" + "="*60)
    print("LOAD TEST SUMMARY")
    print("="*60)
    print(f"Total requests:      {stats['total']}")
    print(f"Successful (200):    {stats['success']} ({100*stats['success']/max(1,stats['total']):.1f}%)")
    print(f"Timeouts (>120s):    {stats['timeout']}")
    print(f"503 (queue full):    {stats['error_503']}")
    print(f"Other errors:        {stats['error_other']}")
    print("-"*60)
    print(f"Avg response time:   {stats['avg_ms']}ms")
    print(f"Min/Max:             {stats['min_ms']}ms / {stats['max_ms']}ms")
    print(f"Wall clock time:     {stats['total_time_sec']}s")
    print("="*60)

    # Analysis
    success_rate = 100 * stats['success'] / max(1, stats['total'])

    print("\nANALYSIS:")
    print("-"*60)

    if stats['error_503'] > 0:
        pct = 100 * stats['error_503'] / stats['total']
        print(f"  ✓ Queue buffer worked: {stats['error_503']} requests ({pct:.0f}%) rejected with 503")
        print(f"     This prevents OOM under extreme load")

    if stats['timeout'] > 0:
        pct = 100 * stats['timeout'] / stats['total']
        print(f"  ⚠ Timeouts: {stats['timeout']} requests ({pct:.0f}%) exceeded 120s timeout")
        print(f"     Consider increasing LLM_TIMEOUT_SEC or reducing concurrent load")

    if success_rate <= 5:
        print(f"\n  ℹ Low success rate ({success_rate:.1f}%) - expected for {num_users} users with max_concurrent=3")
        print(f"     Only ~3 requests can complete immediately; rest queue/timeout/503")

    if final_status.get("circuit_breaker_state") == "open":
        print(f"\n  ✗ CRITICAL: Circuit breaker is OPEN!")
        print(f"     Ollama overloaded or unreachable. System needs recovery time.")
    elif final_status.get("circuit_breaker_state") == "half_open":
        print(f"  ℹ Circuit breaker HALF_OPEN - recovering from failures")
    else:
        print(f"\n  ✓ Circuit breaker CLOSED - system healthy after test")

    if post_status.get("generation_registry_size", 0) > 0:
        print(f"  ℹ Stale generations in registry: {post_status['generation_registry_size']}")
        print(f"     Will be cleaned by watchdog (every {pre_status.get('watchdog_interval', '30')}s)")

    # Expected vs actual behavior
    print("\n" + "-"*60)
    print("EXPECTED BEHAVIOR:")
    print("  With max_concurrent=3, queue_maxsize=50:")
    print(f"    - ~3 requests should succeed immediately (~1-2s)")
    print(f"    - Up to 47 can queue (may timeout after 60-120s)")
    print(f"    - Rest get 503 'queue full'")
    print()

    if stats['success'] <= 5:
        print("  ✓ System behaved as expected - limited concurrency preserved")
    else:
        print(f"  ⚠ Unexpectedly high success rate ({stats['success']}): check config")

    print("\nFull results saved to:", out_path)


if __name__ == "__main__":
    main()
