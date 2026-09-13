import pytest
from unittest.mock import patch, MagicMock
from app.config import settings
from app.services.llm_client import get_qwen_client, call_qwen_chat
from app.agents.agent1_ingestor_a import Agent1LexIngestorA
from app.agents.agent2_ingestor_b import Agent2LexIngestorB
from app.agents.agent3_arbiter import Agent3Arbiter
from app.agents.agent4_scrivener import Agent4Scrivener


def test_qwen_config_loaded():
    assert hasattr(settings, "QWEN_API_KEY")
    assert hasattr(settings, "QWEN_BASE_URL")
    assert hasattr(settings, "QWEN_MODEL")
    assert "sk-ws-" in settings.QWEN_API_KEY
    assert "dashscope-intl" in settings.QWEN_BASE_URL
    assert settings.QWEN_MODEL == "qwen-plus"


def test_get_qwen_client():
    client = get_qwen_client()
    assert client is not None
    assert "dashscope-intl" in str(client.base_url)


@patch("app.services.llm_client.OpenAI")
def test_call_qwen_chat_mock(mock_openai_cls):
    mock_instance = MagicMock()
    mock_openai_cls.return_value = mock_instance

    mock_resp = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = '{"status": "success", "analysis": "qwen analysis"}'
    mock_resp.choices = [mock_choice]
    mock_instance.chat.completions.create.return_value = mock_resp

    result = call_qwen_chat("Analyze this contract clause", json_mode=True)
    assert "qwen analysis" in result
    mock_instance.chat.completions.create.assert_called_once()


def test_agent1_qwen_fallback_resilience():
    agent = Agent1LexIngestorA()
    sample_clauses = [
        {
            "clause_id": "c1",
            "section_number": "1.1",
            "title": "Limitation of Liability",
            "text": "Neither party shall be liable for indirect damages."
        }
    ]
    res = agent._execute(clauses=sample_clauses, matter_id="test_matter")
    assert res is not None
    assert len(res.classified_clauses) >= 1
    assert res.classified_clauses[0].clause_id == "c1"


def test_agent2_qwen_fallback_resilience():
    agent = Agent2LexIngestorB()
    clauses_a = [{"clause_id": "c1", "section_number": "1.1", "title": "Liability", "text": "Cap is 1M"}]
    clauses_b = [{"clause_id": "c1", "section_number": "1.1", "title": "Liability", "text": "Cap is 500K"}]
    diffs = [{"clause_id": "c1", "section_number": "1.1", "diff_type": "modified", "original_text": "Cap is 1M", "counterparty_text": "Cap is 500K"}]
    
    res = agent._execute(party_a_clauses=clauses_a, party_b_clauses=clauses_b, diffs=diffs, matter_id="test_matter")
    assert res is not None
    assert len(res.clause_risk_profiles) >= 1
    assert res.clause_risk_profiles[0].clause_id == "c1"


def test_agent4_qwen_fallback_resilience():
    agent = Agent4Scrivener()
    legal_summary = MagicMock()
    legal_summary.overall_assessment = "Low risk."
    commercial_impact = MagicMock()
    commercial_impact.headline = "Balanced terms."
    commercial_impact.arr_value = "$1,000,000"
    commercial_impact.cost_of_float = "$5,000"
    counsel_estimate = MagicMock()
    counsel_estimate.estimated_hours = 12.5
    counsel_estimate.counsel_cost_saved = 45000.0
    counsel_estimate.cycle_time_minutes = 15.0
    counsel_estimate.counsel_hours_saved = 35.0
    counsel_estimate.speedup_multiplier = 10.0
    
    brief = agent._generate_executive_summary(
        m_id="test_matter",
        docket_num="2026-DOC-001",
        m_title="Test Negotiation",
        buyer="Buyer Corp",
        counterparty="Seller Corp",
        key_changes=[],
        legal_summary=legal_summary,
        commercial_impact=commercial_impact,
        counsel_estimate=counsel_estimate,
        norm_clauses=[],
        v_metrics={"confidence": 85, "accepted": 1, "total": 1}
    )
    assert brief is not None
    assert len(brief) > 50
