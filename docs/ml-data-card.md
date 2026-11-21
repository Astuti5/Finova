# ML data card
- Credit risk: 12,000 SYNTHETIC records (`ml-service/src/data.py`). Labels come from an assumed formula, so metrics show recovery of that formula, not real default prediction. Served model: logistic regression (explainable); gradient boosting is trained for comparison.
- Anomaly: IsolationForest on 8,000 synthetic normal transactions; evaluated on 400 injected synthetic anomalies.
- Hinglish NLP: 40 hand-written training phrases, 10 held-out phrases, 5 intents. Very small; accuracy is indicative only.
- Real metrics are written to `ml-service/models/metrics.json` by `python -m src.train`. Nothing here is real-world validated.
- Public datasets (UCI German Credit, Home Credit) are not integrated yet. Never collect Aadhaar, bank credentials or phone numbers for training.
