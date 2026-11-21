import json, joblib
from pathlib import Path
from sklearn.ensemble import HistGradientBoostingClassifier, IsolationForest
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, brier_score_loss
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from src.data import CREDIT_FEATURES, make_credit, make_normal_tx, make_anomalies
from src.nlp import train_nlp

MODELS = Path(__file__).resolve().parent.parent / "models"
VERSION = "0.1.0-synthetic"

def main():
    MODELS.mkdir(exist_ok=True); m = {"version": VERSION, "data": "synthetic only"}
    df = make_credit(); X, y = df[CREDIT_FEATURES], df["default"]
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)
    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(Xtr, ytr)
    gb = HistGradientBoostingClassifier(random_state=0).fit(Xtr, ytr)
    m["credit"] = {n: {"roc_auc": round(roc_auc_score(yte, mdl.predict_proba(Xte)[:, 1]), 4), "brier": round(brier_score_loss(yte, mdl.predict_proba(Xte)[:, 1]), 4)} for n, mdl in [("logreg", lr), ("gradient_boosting", gb)]}
    m["credit"]["served_model"] = "logreg (linear, explainable)"; m["credit"]["default_rate"] = round(float(y.mean()), 4)
    joblib.dump(lr, MODELS / "credit.joblib")
    ntr, nte = train_test_split(make_normal_tx(), test_size=0.25, random_state=0)
    iso = IsolationForest(n_estimators=200, contamination=0.02, random_state=0).fit(ntr)
    m["anomaly"] = {"false_positive_rate": round(float((iso.predict(nte) == -1).mean()), 4), "injected_detection_rate": round(float((iso.predict(make_anomalies()) == -1).mean()), 4), "note": "synthetic injected anomalies"}
    joblib.dump(iso, MODELS / "anomaly.joblib")
    pipe, acc = train_nlp(); m["nlp"] = {"heldout_accuracy": acc, "heldout_n": 10, "note": "tiny hand-written set"}
    joblib.dump(pipe, MODELS / "nlp.joblib")
    (MODELS / "metrics.json").write_text(json.dumps(m, indent=2)); print(json.dumps(m, indent=2))

if __name__ == "__main__":
    main()
