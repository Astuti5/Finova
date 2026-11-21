"""SYNTHETIC data only. Labels come from an assumed risk formula, so metrics measure how well a model
recovers that formula, NOT real-world default prediction."""
import numpy as np, pandas as pd
CREDIT_FEATURES = ["on_time_ratio", "delay_std_days", "tenure_cycles", "past_defaults", "income_monthly", "income_volatility", "loan_to_income", "group_avg_on_time"]
ANOM_FEATURES = ["amount_ratio", "tx_per_hour", "hours_since_prev", "hour_of_day"]

def make_credit(n=12000, seed=7):
    r = np.random.default_rng(seed)
    on, grp = r.beta(8, 2, n), r.beta(7, 2, n)
    delay, ten, pdf = np.abs(r.normal(2, 2, n)), r.integers(1, 36, n), np.clip(r.poisson(0.3, n), 0, 5)
    inc, vol, lti = r.lognormal(9.8, 0.4, n), r.beta(2, 6, n), np.clip(r.lognormal(-0.7, 0.5, n), 0.05, 4)
    z = -2.2 - 3.0 * (on - 0.8) + 0.12 * delay + 0.5 * pdf + 1.2 * vol + 0.9 * lti - 0.02 * ten - 1.5 * (grp - 0.8)
    y = (r.random(n) < 1 / (1 + np.exp(-z))).astype(int)
    return pd.DataFrame({"on_time_ratio": on, "delay_std_days": delay, "tenure_cycles": ten, "past_defaults": pdf, "income_monthly": inc,
                         "income_volatility": vol, "loan_to_income": lti, "group_avg_on_time": grp, "default": y})

def make_normal_tx(n=8000, seed=11):
    r = np.random.default_rng(seed)
    w = np.array([1] * 7 + [6] * 16 + [1], dtype=float)
    return pd.DataFrame({"amount_ratio": r.lognormal(0, 0.3, n), "tx_per_hour": r.poisson(0.4, n), "hours_since_prev": 1 + r.exponential(36, n),
                         "hour_of_day": r.choice(24, n, p=w / w.sum())})[ANOM_FEATURES]

def make_anomalies(n=400, seed=13):
    r = np.random.default_rng(seed)
    return pd.DataFrame({"amount_ratio": r.uniform(4, 15, n), "tx_per_hour": r.integers(6, 20, n), "hours_since_prev": r.uniform(0, 0.2, n),
                         "hour_of_day": r.choice([1, 2, 3, 4], n)})[ANOM_FEATURES]
