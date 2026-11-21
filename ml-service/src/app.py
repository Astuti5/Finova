import hmac, os
from pathlib import Path
import joblib, pandas as pd
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from src.data import CREDIT_FEATURES, ANOM_FEATURES
from src.nlp import extract_amount

MODELS = Path(__file__).resolve().parent.parent / "models"
VERSION = "0.1.0-synthetic"
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)  # no public API docs
_cache: dict = {}

def model(name):
    if name not in _cache:
        p = MODELS / f"{name}.joblib"
        if not p.exists(): raise HTTPException(503, "Model not trained")
        _cache[name] = joblib.load(p)
    return _cache[name]

def auth(secret):
    expected = os.environ.get("ML_SHARED_SECRET", "")
    if not expected: raise HTTPException(503, "Service not configured")
    if not secret or not hmac.compare_digest(secret.encode(), expected.encode()): raise HTTPException(401, "Unauthorized")

class Credit(BaseModel):
    on_time_ratio: float = Field(ge=0, le=1); delay_std_days: float = Field(ge=0, le=60); tenure_cycles: int = Field(ge=0, le=600); past_defaults: int = Field(ge=0, le=20)
    income_monthly: float = Field(gt=0, le=10_000_000); income_volatility: float = Field(ge=0, le=1); loan_to_income: float = Field(ge=0, le=20); group_avg_on_time: float = Field(ge=0, le=1)
class Tx(BaseModel):
    amount_ratio: float = Field(gt=0, le=1000); tx_per_hour: float = Field(ge=0, le=1000); hours_since_prev: float = Field(ge=0, le=10000); hour_of_day: int = Field(ge=0, le=23)
class Text(BaseModel):
    text: str = Field(min_length=1, max_length=200)

@app.get("/health")
def health(): return {"ok": True}

@app.post("/credit-risk")
def credit(body: Credit, x_ml_secret: str | None = Header(default=None)):
    auth(x_ml_secret); pipe = model("credit"); X = pd.DataFrame([body.model_dump()])[CREDIT_FEATURES]
    prob = float(pipe.predict_proba(X)[0, 1]); contrib = pipe[-1].coef_[0] * pipe[0].transform(X)[0]  # linear per-feature contribution
    top = sorted(range(len(CREDIT_FEATURES)), key=lambda i: -abs(contrib[i]))[:4]
    return {"default_probability": round(prob, 4), "risk_category": "low" if prob < 0.15 else "medium" if prob < 0.35 else "high",
            "factors": [{"feature": CREDIT_FEATURES[i], "effect": "raises risk" if contrib[i] > 0 else "lowers risk", "weight": round(float(contrib[i]), 3)} for i in top],
            "demo": True, "model_version": VERSION, "disclaimer": "Trained on synthetic data. Not a real creditworthiness assessment."}

@app.post("/anomaly")
def anomaly(body: Tx, x_ml_secret: str | None = Header(default=None)):
    auth(x_ml_secret); iso = model("anomaly"); X = pd.DataFrame([body.model_dump()])[ANOM_FEATURES]; ind = []
    if body.amount_ratio > 3: ind.append("Amount far above the member's usual")
    if body.tx_per_hour > 5: ind.append("Unusually many transactions per hour")
    if body.hours_since_prev < 0.25 and body.tx_per_hour > 2: ind.append("Very short gap since previous transaction")
    if body.hour_of_day < 5: ind.append("Unusual time of day")
    return {"anomaly_score": round(float(-iso.score_samples(X)[0]), 4), "flagged": bool(iso.predict(X)[0] == -1), "indicators": ind, "demo": True, "model_version": VERSION}

@app.post("/nlp")
def nlp(body: Text, x_ml_secret: str | None = Header(default=None)):
    auth(x_ml_secret); pipe = model("nlp"); p = pipe.predict_proba([body.text])[0]; i = int(p.argmax())
    intent = str(pipe.classes_[i]) if p[i] >= 0.3 else "unknown"
    return {"intent": intent, "confidence": round(float(p[i]), 3), "amount_rupees": extract_amount(body.text) if intent == "request_loan" else None, "demo": True, "model_version": VERSION}
