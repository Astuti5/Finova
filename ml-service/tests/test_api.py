import os
os.environ["ML_SHARED_SECRET"] = "test-secret"
import pytest
from fastapi.testclient import TestClient
from src import train
H = {"X-ML-Secret": "test-secret"}
GOOD = dict(on_time_ratio=0.98, delay_std_days=0.5, tenure_cycles=30, past_defaults=0, income_monthly=40000, income_volatility=0.05, loan_to_income=0.2, group_avg_on_time=0.95)
BAD = dict(on_time_ratio=0.4, delay_std_days=12, tenure_cycles=2, past_defaults=3, income_monthly=9000, income_volatility=0.8, loan_to_income=3, group_avg_on_time=0.5)

@pytest.fixture(scope="module")
def c():
    train.main()
    from src.app import app
    return TestClient(app)

def test_requires_secret(c): assert c.post("/credit-risk", json=GOOD).status_code == 401
def test_rejects_invalid_input(c): assert c.post("/credit-risk", json={**GOOD, "on_time_ratio": 2}, headers=H).status_code == 422
def test_risk_ordering(c):
    g = c.post("/credit-risk", json=GOOD, headers=H).json(); b = c.post("/credit-risk", json=BAD, headers=H).json()
    assert g["default_probability"] < b["default_probability"] and g["demo"] is True
def test_nlp_amount(c):
    r = c.post("/nlp", json={"text": "mujhe 5k ka loan chahiye"}, headers=H).json()
    assert r["intent"] == "request_loan" and r["amount_rupees"] == 5000
def test_anomaly_flags_extreme(c):
    r = c.post("/anomaly", json=dict(amount_ratio=12, tx_per_hour=15, hours_since_prev=0.05, hour_of_day=3), headers=H).json()
    assert r["flagged"] is True and r["indicators"]
