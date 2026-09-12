"""Cross-organisation isolation & session-ownership regression tests.

Covers the Stage-1 security-gate fixes:
  BL-01  library document reads scoped by org_id (metadata/download/open-session + agent path)
  BL-03  agent task creation must verify membership of a client-supplied org_id
  I-01   sharing operations require session ownership
  I-06   upload / document-image / converted-download / visual routes enforce session owner

The suite provisions two real organisations (A, B) with distinct owners and
asserts a member of A can never reach B's resources — at the route AND at the
service/query layer.
"""
import io
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.auth_routes import get_current_user
from app.core.database import SessionLocal
from app.core.session import session_manager
from app.models.models import DocumentLibrary, AgentTask
from app.services.user_service import create_user
from app.services import org_service

# ── Provision users, orgs, memberships, docs, sessions ────────────────────────

USER_A = {"username": "iso_user_a", "role": "user", "is_active": True}
USER_B = {"username": "iso_user_b", "role": "user", "is_active": True}
ADMIN  = {"username": "iso_admin",  "role": "admin", "is_active": True}

_STATE = {}


@pytest.fixture(scope="module", autouse=True)
def provision():
    # Tables are normally created by the app lifespan; ensure they exist before
    # we provision directly (this fixture may run before any TestClient context).
    from app.core.database import create_tables
    create_tables()

    for u in (USER_A, USER_B, ADMIN):
        try:
            create_user(u["username"], "Password123", u["role"])
        except Exception:
            pass

    org_a = org_service.create_org("iso-org-a", "Org A", USER_A["username"])
    org_b = org_service.create_org("iso-org-b", "Org B", USER_B["username"])
    _STATE["org_a"] = org_a["id"]
    _STATE["org_b"] = org_b["id"]

    with SessionLocal() as db:
        doc_a = DocumentLibrary(org_id=org_a["id"], owner_username=USER_A["username"],
                                name="NPA-A", file_path="/tmp/iso_doc_a.txt", doc_kind="npa")
        doc_b = DocumentLibrary(org_id=org_b["id"], owner_username=USER_B["username"],
                                name="NPA-B", file_path="/tmp/iso_doc_b.txt", doc_kind="npa")
        db.add_all([doc_a, doc_b])
        db.commit()
        db.refresh(doc_a); db.refresh(doc_b)
        _STATE["doc_a"] = doc_a.id
        _STATE["doc_b"] = doc_b.id

    # Real backing files so a *successful* download path would find a file
    # (negative tests must be denied BEFORE reaching the file).
    for p in ("/tmp/iso_doc_a.txt", "/tmp/iso_doc_b.txt"):
        with open(p, "w") as f:
            f.write("regulatory text")

    _STATE["sess_a"] = _make_session(USER_A["username"])
    _STATE["sess_b"] = _make_session(USER_B["username"])
    yield


def _make_session(owner: str) -> str:
    sid = session_manager.create_session()
    s = session_manager.get_session(sid)
    s["owner_username"] = owner
    s["document"] = "pic.png"
    s["vector_store"] = True
    s["markdown_text"] = "text"
    session_manager.save_session(sid)
    return sid


def as_user(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.fixture
def c():
    with TestClient(app) as client:
        yield client
    # Restore the conftest default override after each test.
    from tests.conftest import FAKE_USER
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER


# ── BL-01: library isolation ──────────────────────────────────────────────────

def test_1_owner_reads_own_library_doc_200(c):
    as_user(USER_A)
    r = c.get(f"/api/orgs/{_STATE['org_a']}/library/{_STATE['doc_a']}")
    assert r.status_code == 200
    assert r.json()["id"] == _STATE["doc_a"]


def test_2_own_org_path_foreign_doc_id_404(c):
    """Member of A, using A's path, asks for B's doc_id → 404 (existence hidden)."""
    as_user(USER_A)
    r = c.get(f"/api/orgs/{_STATE['org_a']}/library/{_STATE['doc_b']}")
    assert r.status_code == 404


def test_3_foreign_org_path_non_member_403(c):
    """Member of A hits B's path directly → 403 (not a member)."""
    as_user(USER_A)
    r = c.get(f"/api/orgs/{_STATE['org_b']}/library/{_STATE['doc_b']}")
    assert r.status_code == 403


def test_4_download_foreign_doc_denied(c):
    as_user(USER_A)
    # via own org path → 404 (doc not in org A)
    r1 = c.get(f"/api/orgs/{_STATE['org_a']}/library/{_STATE['doc_b']}/download")
    assert r1.status_code == 404
    # via foreign org path → 403 (not a member)
    r2 = c.get(f"/api/orgs/{_STATE['org_b']}/library/{_STATE['doc_b']}/download")
    assert r2.status_code == 403


def test_5_open_foreign_doc_as_session_denied_no_session(c):
    as_user(USER_A)
    before = len(session_manager._mem)
    r = c.post(f"/api/orgs/{_STATE['org_a']}/library/{_STATE['doc_b']}/open-session")
    assert r.status_code == 404
    assert len(session_manager._mem) == before  # no session created


def test_11_service_layer_enforces_org(c):
    """Defence lives in the service/query, not only the route."""
    from app.services.library_service import get_library_doc, get_library_content
    assert get_library_doc(_STATE["doc_b"], _STATE["org_a"]) is None
    assert get_library_doc(_STATE["doc_b"], _STATE["org_b"]) is not None
    assert get_library_content(_STATE["doc_b"], _STATE["org_a"]) is None


# ── BL-03: agent org_id trust ─────────────────────────────────────────────────

def test_6_agent_task_foreign_org_403_no_row(c):
    as_user(USER_A)
    with SessionLocal() as db:
        before = db.query(AgentTask).count()
    r = c.post("/api/agents/tasks", json={
        "task_type": "compliance",
        "org_id": _STATE["org_b"],           # not a member of B
        "session_id": _STATE["sess_a"],
    })
    assert r.status_code == 403
    with SessionLocal() as db:
        after = db.query(AgentTask).count()
    assert after == before  # task not created, nothing dispatched


async def test_7_input_data_cannot_override_verified_org(c):
    """Even if input_data carries a foreign org_id, the orchestrator uses the
    membership-verified argument only."""
    import app.services.agents.orchestrator as orch
    with SessionLocal() as db:
        t = AgentTask(org_id=_STATE["org_a"], username=USER_A["username"],
                      task_type="fake", input_data={"org_id": _STATE["org_b"]}, steps=[])
        db.add(t); db.commit(); db.refresh(t)
        tid = t.id

    captured = {}

    class FakeModule:
        @staticmethod
        async def run(state, llm):
            captured["org_id"] = state["org_id"]
            state["result"] = {"ok": True}
            return state

    orig = orch.get_agent_class
    orch.get_agent_class = lambda tt: FakeModule
    try:
        await orch.run_agent_task(tid, "fake",
                                  {"org_id": _STATE["org_b"]},  # smuggled
                                  _STATE["org_a"],               # verified arg
                                  USER_A["username"])
    finally:
        orch.get_agent_class = orig
    assert captured["org_id"] == _STATE["org_a"]


# ── I-01: sharing requires session ownership ──────────────────────────────────

def test_8_cannot_share_or_list_foreign_session(c):
    as_user(USER_A)
    sess_b = _STATE["sess_b"]
    # list shares of B's session
    r_list = c.get(f"/api/sessions/{sess_b}/shares")
    assert r_list.status_code in (403, 404)
    # create a share on B's session
    r_share = c.post(f"/api/sessions/{sess_b}/shares",
                     json={"org_id": _STATE["org_a"], "permission": "view",
                           "shared_with": USER_A["username"]})
    assert r_share.status_code in (403, 404)


# ── I-06: session-ownership on upload / image / content ───────────────────────

def test_9_cannot_upload_or_read_image_for_foreign_session(c):
    as_user(USER_A)
    sess_b = _STATE["sess_b"]
    r_img = c.get(f"/api/documents/{sess_b}/image")
    assert r_img.status_code == 403
    r_content = c.get(f"/api/documents/{sess_b}/content")
    assert r_content.status_code == 403
    files = {"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")}
    r_up = c.post(f"/api/documents/upload?session_id={sess_b}", files=files)
    assert r_up.status_code == 403


# ── 10: admin behaviour matches the ACTUAL role model ─────────────────────────

def test_10_admin_bypasses_session_owner_but_not_org_membership(c):
    as_user(ADMIN)
    # Global admin bypasses the session owner check → can read any session.
    r_content = c.get(f"/api/documents/{_STATE['sess_b']}/content")
    assert r_content.status_code == 200
    # But global admin is NOT auto-member of an org → library still 403.
    r_lib = c.get(f"/api/orgs/{_STATE['org_b']}/library/{_STATE['doc_b']}")
    assert r_lib.status_code == 403


# ── 12: create_session stamps an owner, closing the unowned-session hole ──────

def test_12_new_session_is_owned_by_its_creator_not_open_to_everyone(c):
    """POST /sessions must stamp owner_username immediately (I-06 follow-up):
    previously a session with no owner recorded was treated as open to any
    authenticated user, including one just created and never uploaded to."""
    as_user(USER_A)
    sid = c.post("/api/sessions").json()["session_id"]

    as_user(USER_B)
    r = c.delete(f"/api/sessions/{sid}")
    assert r.status_code == 403

    as_user(USER_A)
    r = c.delete(f"/api/sessions/{sid}")
    assert r.status_code == 200
