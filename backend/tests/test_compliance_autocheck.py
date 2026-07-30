"""Tests for the automatic НПА compliance check triggered on document upload."""
import pytest
from unittest.mock import patch

from app.services import compliance_autocheck


def _session(chars: int = 5000) -> dict:
    return {"markdown_text": "x" * chars, "document": "contract.pdf"}


def test_skipped_when_disabled(monkeypatch):
    with patch.object(compliance_autocheck, "_org_has_npa", return_value=True):
        s = compliance_autocheck.get_settings()
        monkeypatch.setattr(s, "AUTO_COMPLIANCE_CHECK", False)
        assert compliance_autocheck.should_autocheck(_session(), org_id=1) is False


def test_skipped_without_org():
    assert compliance_autocheck.should_autocheck(_session(), org_id=None) is False


def test_skipped_for_short_document():
    """A scrap of text isn't worth an LLM run."""
    with patch.object(compliance_autocheck, "_org_has_npa", return_value=True):
        assert compliance_autocheck.should_autocheck(_session(chars=50), org_id=1) is False


def test_skipped_when_org_has_no_npa():
    """Otherwise every upload would queue a task that fails instantly."""
    with patch.object(compliance_autocheck, "_org_has_npa", return_value=False):
        assert compliance_autocheck.should_autocheck(_session(), org_id=1) is False


def test_skipped_when_uploading_an_npa_itself():
    """An НПА added to the library must not be checked against itself."""
    with patch.object(compliance_autocheck, "_org_has_npa", return_value=True):
        assert compliance_autocheck.should_autocheck(_session(), org_id=1, library_doc_id=7) is False


def test_runs_for_normal_document_with_npa_present():
    with patch.object(compliance_autocheck, "_org_has_npa", return_value=True):
        assert compliance_autocheck.should_autocheck(_session(), org_id=1) is True


def test_npa_lookup_failure_does_not_raise():
    """A DB hiccup must degrade to 'no check', never break the upload."""
    with patch.object(compliance_autocheck, "_org_has_npa", side_effect=RuntimeError("db down")):
        assert compliance_autocheck.should_autocheck(_session(), org_id=1) is False


def test_dispatch_creates_task_and_dispatches():
    with patch("app.api.agent_routes._dispatch_agent_task") as mock_dispatch:
        task_id = compliance_autocheck.dispatch("sess-1", "testuser", org_id=1)
    assert task_id is not None
    mock_dispatch.assert_called_once()
    args = mock_dispatch.call_args[0]
    assert args[0] == task_id
    assert args[1] == "compliance"
    assert args[2]["session_id"] == "sess-1"
    assert args[2]["auto"] is True


def test_dispatch_failure_returns_none_instead_of_raising():
    """Upload already succeeded by this point — a failed dispatch must stay silent."""
    with patch("app.api.agent_routes._dispatch_agent_task", side_effect=RuntimeError("no loop")):
        assert compliance_autocheck.dispatch("sess-2", "testuser", org_id=1) is None
